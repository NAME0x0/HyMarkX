import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Definition, Diagnostic, Html, Node, Root, Span, TableCell } from '@hymarkx/ast'
import type { AnalyzedDocument } from '../analyze/index.js'
import type { TrustMode } from '../types.js'
import type { AnalyzedComponent } from '../components/validate.js'
import type { DirectiveNode, RenderedElement, RenderPlan } from '../components/types.js'
import { setDiagnosticOrigin } from '../diagnostic-origin.js'
import type { InteractivityPlan } from '../runtime.js'
import type { Backend, EmitResult } from './backend.js'
import { encodeUrl, escapeHtml } from './escape.js'
import {
  addAttributesToRawHtml,
  addUniversalAttributesToFirstElement,
  componentHtmlDiagnostics,
  isAllowedDocumentUrl,
  sanitizeRawHtml,
} from './sanitize.js'

interface HtmlOptions {
  readonly trust: TrustMode
  readonly omittedNodes: ReadonlyMap<AnalyzedDocument, ReadonlySet<Html>>
  readonly rootScopeAttributes: readonly string[]
  readonly componentScopeAttributes: ReadonlyMap<AnalyzedDocument, readonly string[]>
  readonly interactivity: InteractivityPlan
}

interface EmitContext {
  readonly block: boolean
  readonly tightList?: boolean
  readonly tightParagraph?: boolean
  readonly taskPrefix?: string
  readonly tableHeader?: boolean
  readonly tableAlign?: 'left' | 'right' | 'center' | null
}

interface NodeAction {
  readonly kind: 'node'
  readonly node: Node
  readonly context: EmitContext
  readonly document: AnalyzedDocument
}

interface WriteAction {
  readonly kind: 'write'
  readonly value: string
}

interface ComponentBoundary {
  start?: number
}

interface ComponentStartAction {
  readonly kind: 'componentStart'
  readonly boundary: ComponentBoundary
}

interface ComponentEndAction {
  readonly kind: 'componentEnd'
  readonly boundary: ComponentBoundary
  readonly attributes: Readonly<Record<string, string>>
  readonly scope: string
}

type EmitAction = NodeAction | WriteAction | ComponentStartAction | ComponentEndAction

const blockContext: EmitContext = { block: true }
const inlineContext: EmitContext = { block: false }

function write(value: string): WriteAction {
  return { kind: 'write', value }
}

function emitNode(node: Node, context: EmitContext, document: AnalyzedDocument): NodeAction {
  return { kind: 'node', node, context, document }
}

function pushInOrder(stack: EmitAction[], actions: readonly EmitAction[]): void {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (action !== undefined) {
      stack.push(action)
    }
  }
}

function childActions(
  nodes: readonly Node[],
  context: EmitContext,
  document: AnalyzedDocument,
): EmitAction[] {
  return nodes.map((node) => emitNode(node, context, document))
}

function scopeAttributesFor(document: AnalyzedDocument, options: HtmlOptions): readonly string[] {
  return [...options.rootScopeAttributes, ...(options.componentScopeAttributes.get(document) ?? [])]
}

function scopeFor(document: AnalyzedDocument, options: HtmlOptions): string {
  return scopeAttributesFor(document, options)
    .map((attribute) => ` ${attribute}`)
    .join('')
}

function universalAttributeValues(
  attributes: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    ['id', 'class', 'title'].flatMap((name) => {
      const value = attributes[name]
      return typeof value === 'string' ? [[name, value] as const] : []
    }),
  )
}

/**
 * Universal attributes that keep merging even when a schema declares them.
 *
 * Both are structural and mean the same thing on any element, so an author writing one intends
 * it to reach the element alongside whatever the component sets. There is nothing to
 * disambiguate — see ADR-0019.
 */
const mergedUniversalAttributes: ReadonlySet<string> = new Set(['class', 'id'])

/**
 * Attribute values that still reach the HTML after the component has taken its props.
 *
 * A name the schema declares belongs to the component: it is passed to the renderer as a prop
 * and is not also emitted as an HTML attribute of the same name. Without this a component with
 * a `title` prop renders `<h2 title="Revenue">Revenue</h2>` — a tooltip duplicating the visible
 * heading, which MDN calls out and Charter §28 rules against.
 */
function hostAttributes(component: AnalyzedComponent): Readonly<Record<string, unknown>> {
  const declared = component.schema.attributes
  return Object.fromEntries(
    Object.entries(component.attributes).filter(
      ([name]) => mergedUniversalAttributes.has(name) || !Object.hasOwn(declared, name),
    ),
  )
}

function elementStart(element: RenderedElement, scope: string): string {
  let output = `<${element.tag}`
  for (const [name, value] of Object.entries(element.attributes)) {
    output += ` ${name}="${escapeHtml(value)}"`
  }
  return `${output}${scope}>`
}

function withUniversalAttributes(
  plan: RenderPlan,
  attributes: Readonly<Record<string, unknown>>,
): RenderPlan {
  const outer = plan.wrappers[0]
  if (outer === undefined) {
    return plan
  }
  const authorClass = typeof attributes.class === 'string' ? attributes.class : undefined
  const rendererClass = outer.attributes.class
  const mergedClass = [rendererClass, authorClass].filter(Boolean).join(' ')
  const outerAttributes = {
    ...outer.attributes,
    ...(mergedClass === '' ? {} : { class: mergedClass }),
    ...(typeof attributes.id === 'string' ? { id: attributes.id } : {}),
    ...(typeof attributes.title === 'string' ? { title: attributes.title } : {}),
  }
  return {
    ...plan,
    wrappers: [{ ...outer, attributes: outerAttributes }, ...plan.wrappers.slice(1)],
  }
}

function interactionAttributes(
  node: DirectiveNode,
  document: AnalyzedDocument,
  options: HtmlOptions,
): Readonly<Record<string, string>> {
  const text = options.interactivity.attributeMarkers.get(document)?.get(node)
  const event = options.interactivity.eventMarkers.get(document)?.get(node)
  const inputValue = options.interactivity.inputValues.get(document)?.get(node)
  return {
    ...(text === undefined ? {} : { 'data-hmx-a': text }),
    ...(event === undefined ? {} : { 'data-hmx-e': event }),
    ...(inputValue === undefined ? {} : { value: inputValue }),
  }
}

function withOuterAttributes(
  plan: RenderPlan,
  attributes: Readonly<Record<string, string>>,
): RenderPlan {
  const outer = plan.wrappers[0]
  if (outer === undefined || Object.keys(attributes).length === 0) return plan
  return {
    ...plan,
    wrappers: [
      { ...outer, attributes: { ...outer.attributes, ...attributes } },
      ...plan.wrappers.slice(1),
    ],
  }
}

function directiveActions(
  node: DirectiveNode,
  context: EmitContext,
  document: AnalyzedDocument,
  scope: string,
  options: HtmlOptions,
): EmitAction[] {
  if (node.type === 'leafDirective' && node.name === 'state') {
    return []
  }
  const island = document.islandNodes.get(node)
  if (island !== undefined) {
    // A placeholder and nothing else. The host bundles the module and mounts into this
    // element; the compiler has deliberately not looked at the file (ADR-0016).
    return [write(`<div data-hmx-island="${island.id}"${scope}></div>${context.block ? '\n' : ''}`)]
  }

  const projection = document.projections.get(node)
  if (projection !== undefined) {
    return childActions(projection.nodes, blockContext, projection.document)
  }
  const expansion = document.expansions.get(node)
  if (expansion !== undefined) {
    const component = document.components.get(node)
    const boundary: ComponentBoundary = {}
    return [
      { kind: 'componentStart', boundary },
      ...childActions(expansion.document.root.children, blockContext, expansion.document),
      {
        kind: 'componentEnd',
        boundary,
        attributes: {
          ...universalAttributeValues(component === undefined ? {} : hostAttributes(component)),
          ...interactionAttributes(node, document, options),
        },
        scope: scopeFor(expansion.document, options),
      },
    ]
  }

  const component = document.components.get(node)
  if (component === undefined || !component.kindAllowed) {
    if (node.type === 'textDirective') {
      return childActions(node.children, inlineContext, document)
    }
    if (node.type === 'leafDirective') {
      return childActions(node.label ?? [], inlineContext, document)
    }
    return [
      ...childActions(node.label ?? [], inlineContext, document),
      ...childActions(node.children, blockContext, document),
    ]
  }

  const plan = withOuterAttributes(
    withUniversalAttributes(
      component.renderer(node, component.attributes),
      hostAttributes(component),
    ),
    interactionAttributes(node, document, options),
  )
  const actions: EmitAction[] = plan.wrappers.map((wrapper) => write(elementStart(wrapper, scope)))
  const label = node.type === 'textDirective' ? [] : (node.label ?? [])
  if (label.length > 0) {
    if (plan.labelWrapper !== undefined) {
      actions.push(write(elementStart(plan.labelWrapper, scope)))
    }
    actions.push(...childActions(label, inlineContext, document))
    if (plan.labelWrapper !== undefined) {
      actions.push(write(`</${plan.labelWrapper.tag}>`))
    }
  }
  if (node.type === 'textDirective') {
    actions.push(...childActions(node.children, inlineContext, document))
  } else if (node.type === 'containerDirective') {
    const paragraph = plan.flattenSingleParagraph === true ? node.children[0] : undefined
    if (paragraph?.type === 'paragraph' && node.children.length === 1) {
      actions.push(...childActions(paragraph.children, inlineContext, document))
    } else {
      actions.push(...childActions(node.children, blockContext, document))
    }
  }
  for (let index = plan.wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = plan.wrappers[index]
    if (wrapper !== undefined && wrapper.void !== true) {
      actions.push(write(`</${wrapper.tag}>${context.block && index === 0 ? '\n' : ''}`))
    }
  }
  if (plan.wrappers[0]?.void === true && context.block) actions.push(write('\n'))
  return actions
}

function collectDefinitions(root: Root): ReadonlyMap<string, Definition> {
  const definitions = new Map<string, Definition>()
  visit(root, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node)
    }
  })
  return definitions
}

function taskPrefix(checked: boolean, scope: string): string {
  return checked
    ? `<input type="checkbox" disabled="" checked=""${scope} /> `
    : `<input type="checkbox" disabled=""${scope} /> `
}

function listItemActions(
  node: Node & { type: 'listItem' },
  context: EmitContext,
  scope: string,
  document: AnalyzedDocument,
): EmitAction[] {
  const children = node.children.filter((child) => child.type !== 'definition')
  const tight = context.tightList === true && !node.spread
  const className = node.checked === null ? '' : ' class="task-list-item"'
  const actions: EmitAction[] = [write(`<li${className}${scope}>`)]

  if (!tight && children.length > 0) {
    actions.push(write('\n'))
  }

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (child === undefined) {
      continue
    }

    if (tight && child.type === 'paragraph') {
      actions.push(
        emitNode(
          child,
          {
            block: true,
            tightParagraph: true,
            ...(index === 0 && node.checked !== null
              ? { taskPrefix: taskPrefix(node.checked, scope) }
              : {}),
          },
          document,
        ),
      )
      if (index < children.length - 1) {
        actions.push(write('\n'))
      }
    } else {
      if (tight && index === 0) {
        actions.push(write('\n'))
      }
      actions.push(emitNode(child, blockContext, document))
    }
  }

  actions.push(write('</li>\n'))
  return actions
}

function tableCellActions(
  node: TableCell,
  context: EmitContext,
  scope: string,
  document: AnalyzedDocument,
): EmitAction[] {
  const tag = context.tableHeader === true ? 'th' : 'td'
  const alignment =
    context.tableAlign === null || context.tableAlign === undefined
      ? ''
      : ` align="${context.tableAlign}"`
  return [
    write(`<${tag}${alignment}${scope}>`),
    ...childActions(node.children, inlineContext, document),
    write(`</${tag}>\n`),
  ]
}

function emptyTableCell(
  header: boolean,
  align: 'left' | 'right' | 'center' | null,
  scope: string,
): WriteAction {
  const tag = header ? 'th' : 'td'
  const alignment = align === null ? '' : ` align="${align}"`
  return write(`<${tag}${alignment}${scope}></${tag}>\n`)
}

function tableRowActions(
  cells: readonly TableCell[],
  alignments: ReadonlyArray<'left' | 'right' | 'center' | null>,
  header: boolean,
  scope: string,
  document: AnalyzedDocument,
): EmitAction[] {
  const actions: EmitAction[] = [write(`<tr${scope}>\n`)]
  for (let index = 0; index < alignments.length; index += 1) {
    const alignment = alignments[index] ?? null
    const cell = cells[index]
    actions.push(
      cell === undefined
        ? emptyTableCell(header, alignment, scope)
        : emitNode(cell, { block: true, tableHeader: header, tableAlign: alignment }, document),
    )
  }
  actions.push(write('</tr>\n'))
  return actions
}

function securityDiagnostic(url: string, span: Span, document: AnalyzedDocument): Diagnostic {
  const diagnostic = createDiagnostic({
    code: 'HMX3003',
    severity: 'error',
    message: `URL "${url}" uses a scheme that is not allowed in document mode.`,
    span,
  })
  setDiagnosticOrigin(diagnostic, document.source, document.from)
  return diagnostic
}

function urlAttribute(
  name: 'href' | 'src',
  value: string,
  span: Span,
  trust: TrustMode,
  diagnostics: Diagnostic[],
  document: AnalyzedDocument,
): string {
  if (trust === 'document' && !isAllowedDocumentUrl(value)) {
    diagnostics.push(securityDiagnostic(value, span, document))
    return ''
  }
  return ` ${name}="${escapeHtml(encodeUrl(value))}"`
}

function assertNeverNode(node: never): never {
  throw new TypeError(`Unhandled node type in HTML emitter: ${JSON.stringify(node)}`)
}

function emitHtml(document: AnalyzedDocument, options: HtmlOptions): EmitResult {
  const definitions = new Map<AnalyzedDocument, ReadonlyMap<string, Definition>>()
  const definitionsFor = (owner: AnalyzedDocument): ReadonlyMap<string, Definition> => {
    const existing = definitions.get(owner)
    if (existing !== undefined) {
      return existing
    }
    const collected = collectDefinitions(owner.root)
    definitions.set(owner, collected)
    return collected
  }
  const diagnostics: Diagnostic[] = []
  const chunks: string[] = []
  const stack: EmitAction[] = [emitNode(document.root, blockContext, document)]

  while (stack.length > 0) {
    const action = stack.pop()
    if (action === undefined) {
      continue
    }
    if (action.kind === 'write') {
      chunks.push(action.value)
      continue
    }
    if (action.kind === 'componentStart') {
      action.boundary.start = chunks.length
      continue
    }
    if (action.kind === 'componentEnd') {
      const start = action.boundary.start ?? chunks.length
      const fragment = chunks.splice(start).join('')
      const attributed = addUniversalAttributesToFirstElement(fragment, action.attributes)
      if (attributed !== undefined) {
        chunks.push(attributed)
      } else if (Object.keys(action.attributes).length > 0) {
        chunks.push(
          `${elementStart({ tag: 'div', attributes: action.attributes }, action.scope)}${fragment}</div>\n`,
        )
      } else {
        chunks.push(fragment)
      }
      continue
    }

    const { node, context, document: owner } = action
    const scope = scopeFor(owner, options)
    switch (node.type) {
      case 'root':
        pushInOrder(stack, childActions(node.children, blockContext, owner))
        break
      case 'yaml':
        break
      case 'paragraph': {
        const content = childActions(node.children, inlineContext, owner)
        if (context.tightParagraph === true) {
          pushInOrder(stack, [
            ...(context.taskPrefix === undefined ? [] : [write(context.taskPrefix)]),
            ...content,
          ])
        } else {
          pushInOrder(stack, [write(`<p${scope}>`), ...content, write('</p>\n')])
        }
        break
      }
      case 'heading':
        pushInOrder(stack, [
          write(`<h${node.depth}${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write(`</h${node.depth}>\n`),
        ])
        break
      case 'thematicBreak':
        chunks.push(`<hr${scope} />\n`)
        break
      case 'blockquote':
        pushInOrder(stack, [
          write(`<blockquote${scope}>\n`),
          ...childActions(node.children, blockContext, owner),
          write('</blockquote>\n'),
        ])
        break
      case 'list': {
        const taskList = node.children.some((item) => item.checked !== null)
        const tight = !node.spread && node.children.every((item) => !item.spread)
        const className = taskList ? ' class="contains-task-list"' : ''
        const start =
          node.ordered && node.start !== null && node.start !== 1 ? ` start="${node.start}"` : ''
        const tag = node.ordered ? 'ol' : 'ul'
        pushInOrder(stack, [
          write(`<${tag}${start}${className}${scope}>\n`),
          ...node.children.map((child) =>
            emitNode(child, { block: true, tightList: tight }, owner),
          ),
          write(`</${tag}>\n`),
        ])
        break
      }
      case 'listItem':
        pushInOrder(stack, listItemActions(node, context, scope, owner))
        break
      case 'code': {
        const language = node.lang === null ? '' : ` class="language-${escapeHtml(node.lang)}"`
        const content = node.value.length === 0 ? '' : `${escapeHtml(node.value)}\n`
        chunks.push(`<pre${scope}><code${language}${scope}>${content}</code></pre>\n`)
        break
      }
      case 'html': {
        if (options.omittedNodes.get(owner)?.has(node) === true) {
          break
        }
        const scopeAttributes = scopeAttributesFor(owner, options)
        if (
          owner.authored !== undefined &&
          componentHtmlDiagnostics(node.value, node.position).length > 0
        ) {
          break
        }
        if (options.trust === 'app') {
          const html = addAttributesToRawHtml(node.value, scopeAttributes)
          chunks.push(html)
          if (context.block && html.length > 0 && !html.endsWith('\n')) {
            chunks.push('\n')
          }
          break
        }

        const sanitized = sanitizeRawHtml(node.value, node.position)
        for (const diagnostic of sanitized.diagnostics) {
          setDiagnosticOrigin(diagnostic, owner.source, owner.from)
        }
        diagnostics.push(...sanitized.diagnostics)
        const html = addAttributesToRawHtml(sanitized.html, scopeAttributes)
        chunks.push(html)
        if (context.block && html.length > 0 && !html.endsWith('\n')) {
          chunks.push('\n')
        }
        break
      }
      case 'text':
        chunks.push(escapeHtml(node.value))
        break
      case 'interpolation':
        {
          const value = escapeHtml(owner.interpolations.get(node) ?? '')
          const marker = options.interactivity.textMarkers.get(owner)?.get(node)
          chunks.push(
            marker === undefined ? value : `<span data-hmx-t="${marker}"${scope}>${value}</span>`,
          )
        }
        break
      case 'emphasis':
        pushInOrder(stack, [
          write(`<em${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write('</em>'),
        ])
        break
      case 'strong':
        pushInOrder(stack, [
          write(`<strong${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write('</strong>'),
        ])
        break
      case 'delete':
        pushInOrder(stack, [
          write(`<del${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write('</del>'),
        ])
        break
      case 'inlineCode':
        chunks.push(`<code${scope}>${escapeHtml(node.value.replaceAll('\n', ' '))}</code>`)
        break
      case 'break':
        chunks.push(`<br${scope} />\n`)
        break
      case 'link': {
        const href = urlAttribute(
          'href',
          node.url,
          node.position,
          owner.authored === undefined ? options.trust : 'document',
          diagnostics,
          owner,
        )
        const title = node.title === null ? '' : ` title="${escapeHtml(node.title)}"`
        pushInOrder(stack, [
          write(`<a${href}${title}${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write('</a>'),
        ])
        break
      }
      case 'image': {
        const src = urlAttribute(
          'src',
          node.url,
          node.position,
          owner.authored === undefined ? options.trust : 'document',
          diagnostics,
          owner,
        )
        const alt = escapeHtml(node.alt ?? '')
        const title = node.title === null ? '' : ` title="${escapeHtml(node.title)}"`
        chunks.push(`<img${src} alt="${alt}"${title}${scope} />`)
        break
      }
      case 'definition':
        break
      case 'linkReference': {
        const definition = definitionsFor(owner).get(node.identifier)
        if (definition === undefined) {
          pushInOrder(stack, childActions(node.children, inlineContext, owner))
          break
        }
        const href = urlAttribute(
          'href',
          definition.url,
          definition.position,
          owner.authored === undefined ? options.trust : 'document',
          diagnostics,
          owner,
        )
        const title = definition.title === null ? '' : ` title="${escapeHtml(definition.title)}"`
        pushInOrder(stack, [
          write(`<a${href}${title}${scope}>`),
          ...childActions(node.children, inlineContext, owner),
          write('</a>'),
        ])
        break
      }
      case 'imageReference': {
        const definition = definitionsFor(owner).get(node.identifier)
        if (definition === undefined) {
          chunks.push(escapeHtml(node.alt ?? ''))
          break
        }
        const src = urlAttribute(
          'src',
          definition.url,
          definition.position,
          owner.authored === undefined ? options.trust : 'document',
          diagnostics,
          owner,
        )
        const title = definition.title === null ? '' : ` title="${escapeHtml(definition.title)}"`
        chunks.push(`<img${src} alt="${escapeHtml(node.alt ?? '')}"${title}${scope} />`)
        break
      }
      case 'table': {
        const rows = node.children
        const actions: EmitAction[] = [write(`<table${scope}>\n`)]
        const header = rows[0]
        if (header !== undefined) {
          actions.push(write(`<thead${scope}>\n`))
          actions.push(
            ...tableRowActions(header.children, node.align, true, scope, owner),
            write('</thead>\n'),
          )
        }
        if (rows.length > 1) {
          actions.push(write(`<tbody${scope}>\n`))
          for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex]
            if (row === undefined) {
              continue
            }
            actions.push(...tableRowActions(row.children, node.align, false, scope, owner))
          }
          actions.push(write('</tbody>\n'))
        }
        actions.push(write('</table>\n'))
        pushInOrder(stack, actions)
        break
      }
      case 'tableRow':
        pushInOrder(stack, [
          write(`<tr${scope}>\n`),
          ...node.children.map((cell) => emitNode(cell, context, owner)),
          write('</tr>\n'),
        ])
        break
      case 'tableCell':
        pushInOrder(stack, tableCellActions(node, context, scope, owner))
        break
      case 'textDirective':
        pushInOrder(stack, directiveActions(node, context, owner, scope, options))
        break
      case 'leafDirective':
        pushInOrder(stack, directiveActions(node, context, owner, scope, options))
        break
      case 'containerDirective':
        pushInOrder(stack, directiveActions(node, context, owner, scope, options))
        break
      default:
        assertNeverNode(node)
    }
  }

  return { html: chunks.join(''), diagnostics }
}

/** Original HMX-AST-to-HTML backend. */
export const htmlBackend: Backend<HtmlOptions> = {
  name: 'html',
  emit: emitHtml,
}
