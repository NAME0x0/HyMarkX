import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Definition, Diagnostic, Html, Node, Root, Span, TableCell } from '@hymarkx/ast'
import type { AnalyzedDocument } from '../analyze/index.js'
import type { TrustMode } from '../types.js'
import type { DirectiveNode, RenderedElement, RenderPlan } from '../components/types.js'
import type { Backend, EmitResult } from './backend.js'
import { encodeUrl, escapeHtml } from './escape.js'
import { addAttributesToRawHtml, isAllowedDocumentUrl, sanitizeRawHtml } from './sanitize.js'

interface HtmlOptions {
  readonly trust: TrustMode
  readonly omittedNodes: ReadonlySet<Html>
  readonly scopeAttributes: readonly string[]
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
}

interface WriteAction {
  readonly kind: 'write'
  readonly value: string
}

type EmitAction = NodeAction | WriteAction

const blockContext: EmitContext = { block: true }
const inlineContext: EmitContext = { block: false }

function write(value: string): WriteAction {
  return { kind: 'write', value }
}

function emitNode(node: Node, context: EmitContext): NodeAction {
  return { kind: 'node', node, context }
}

function pushInOrder(stack: EmitAction[], actions: readonly EmitAction[]): void {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (action !== undefined) {
      stack.push(action)
    }
  }
}

function childActions(nodes: readonly Node[], context: EmitContext): EmitAction[] {
  return nodes.map((node) => emitNode(node, context))
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

function directiveActions(
  node: DirectiveNode,
  context: EmitContext,
  document: AnalyzedDocument,
  scope: string,
): EmitAction[] {
  const component = document.components.get(node)
  if (component === undefined || !component.kindAllowed) {
    if (node.type === 'textDirective') {
      return childActions(node.children, inlineContext)
    }
    if (node.type === 'leafDirective') {
      return childActions(node.label ?? [], inlineContext)
    }
    return [
      ...childActions(node.label ?? [], inlineContext),
      ...childActions(node.children, blockContext),
    ]
  }

  const plan = withUniversalAttributes(
    component.renderer(node, component.attributes),
    component.attributes,
  )
  const actions: EmitAction[] = plan.wrappers.map((wrapper) => write(elementStart(wrapper, scope)))
  const label = node.type === 'textDirective' ? [] : (node.label ?? [])
  if (label.length > 0) {
    if (plan.labelWrapper !== undefined) {
      actions.push(write(elementStart(plan.labelWrapper, scope)))
    }
    actions.push(...childActions(label, inlineContext))
    if (plan.labelWrapper !== undefined) {
      actions.push(write(`</${plan.labelWrapper.tag}>`))
    }
  }
  if (node.type === 'textDirective') {
    actions.push(...childActions(node.children, inlineContext))
  } else if (node.type === 'containerDirective') {
    actions.push(...childActions(node.children, blockContext))
  }
  for (let index = plan.wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = plan.wrappers[index]
    if (wrapper !== undefined) {
      actions.push(write(`</${wrapper.tag}>${context.block && index === 0 ? '\n' : ''}`))
    }
  }
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
        emitNode(child, {
          block: true,
          tightParagraph: true,
          ...(index === 0 && node.checked !== null
            ? { taskPrefix: taskPrefix(node.checked, scope) }
            : {}),
        }),
      )
      if (index < children.length - 1) {
        actions.push(write('\n'))
      }
    } else {
      if (tight && index === 0) {
        actions.push(write('\n'))
      }
      actions.push(emitNode(child, blockContext))
    }
  }

  actions.push(write('</li>\n'))
  return actions
}

function tableCellActions(node: TableCell, context: EmitContext, scope: string): EmitAction[] {
  const tag = context.tableHeader === true ? 'th' : 'td'
  const alignment =
    context.tableAlign === null || context.tableAlign === undefined
      ? ''
      : ` align="${context.tableAlign}"`
  return [
    write(`<${tag}${alignment}${scope}>`),
    ...childActions(node.children, inlineContext),
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
): EmitAction[] {
  const actions: EmitAction[] = [write(`<tr${scope}>\n`)]
  for (let index = 0; index < alignments.length; index += 1) {
    const alignment = alignments[index] ?? null
    const cell = cells[index]
    actions.push(
      cell === undefined
        ? emptyTableCell(header, alignment, scope)
        : emitNode(cell, { block: true, tableHeader: header, tableAlign: alignment }),
    )
  }
  actions.push(write('</tr>\n'))
  return actions
}

function securityDiagnostic(url: string, span: Span): Diagnostic {
  return createDiagnostic({
    code: 'HMX3003',
    severity: 'error',
    message: `URL "${url}" uses a scheme that is not allowed in document mode.`,
    span,
  })
}

function urlAttribute(
  name: 'href' | 'src',
  value: string,
  span: Span,
  trust: TrustMode,
  diagnostics: Diagnostic[],
): string {
  if (trust === 'document' && !isAllowedDocumentUrl(value)) {
    diagnostics.push(securityDiagnostic(value, span))
    return ''
  }
  return ` ${name}="${escapeHtml(encodeUrl(value))}"`
}

function assertNeverNode(node: never): never {
  throw new TypeError(`Unhandled node type in HTML emitter: ${JSON.stringify(node)}`)
}

function emitHtml(document: AnalyzedDocument, options: HtmlOptions): EmitResult {
  const definitions = collectDefinitions(document.root)
  const diagnostics: Diagnostic[] = []
  const chunks: string[] = []
  const scope = options.scopeAttributes.map((attribute) => ` ${attribute}`).join('')
  const stack: EmitAction[] = [emitNode(document.root, blockContext)]

  while (stack.length > 0) {
    const action = stack.pop()
    if (action === undefined) {
      continue
    }
    if (action.kind === 'write') {
      chunks.push(action.value)
      continue
    }

    const { node, context } = action
    switch (node.type) {
      case 'root':
        pushInOrder(stack, childActions(node.children, blockContext))
        break
      case 'yaml':
        break
      case 'paragraph': {
        const content = childActions(node.children, inlineContext)
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
          ...childActions(node.children, inlineContext),
          write(`</h${node.depth}>\n`),
        ])
        break
      case 'thematicBreak':
        chunks.push(`<hr${scope} />\n`)
        break
      case 'blockquote':
        pushInOrder(stack, [
          write(`<blockquote${scope}>\n`),
          ...childActions(node.children, blockContext),
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
          ...node.children.map((child) => emitNode(child, { block: true, tightList: tight })),
          write(`</${tag}>\n`),
        ])
        break
      }
      case 'listItem':
        pushInOrder(stack, listItemActions(node, context, scope))
        break
      case 'code': {
        const language = node.lang === null ? '' : ` class="language-${escapeHtml(node.lang)}"`
        const content = node.value.length === 0 ? '' : `${escapeHtml(node.value)}\n`
        chunks.push(`<pre${scope}><code${language}${scope}>${content}</code></pre>\n`)
        break
      }
      case 'html': {
        if (options.omittedNodes.has(node)) {
          break
        }
        if (options.trust === 'app') {
          const html = addAttributesToRawHtml(node.value, options.scopeAttributes)
          chunks.push(html)
          if (context.block && html.length > 0 && !html.endsWith('\n')) {
            chunks.push('\n')
          }
          break
        }

        const sanitized = sanitizeRawHtml(node.value, node.position)
        diagnostics.push(...sanitized.diagnostics)
        chunks.push(sanitized.html)
        if (context.block && sanitized.html.length > 0 && !sanitized.html.endsWith('\n')) {
          chunks.push('\n')
        }
        break
      }
      case 'text':
        chunks.push(escapeHtml(node.value))
        break
      case 'interpolation':
        chunks.push(escapeHtml(document.interpolations.get(node) ?? ''))
        break
      case 'emphasis':
        pushInOrder(stack, [
          write(`<em${scope}>`),
          ...childActions(node.children, inlineContext),
          write('</em>'),
        ])
        break
      case 'strong':
        pushInOrder(stack, [
          write(`<strong${scope}>`),
          ...childActions(node.children, inlineContext),
          write('</strong>'),
        ])
        break
      case 'delete':
        pushInOrder(stack, [
          write(`<del${scope}>`),
          ...childActions(node.children, inlineContext),
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
        const href = urlAttribute('href', node.url, node.position, options.trust, diagnostics)
        const title = node.title === null ? '' : ` title="${escapeHtml(node.title)}"`
        pushInOrder(stack, [
          write(`<a${href}${title}${scope}>`),
          ...childActions(node.children, inlineContext),
          write('</a>'),
        ])
        break
      }
      case 'image': {
        const src = urlAttribute('src', node.url, node.position, options.trust, diagnostics)
        const alt = escapeHtml(node.alt ?? '')
        const title = node.title === null ? '' : ` title="${escapeHtml(node.title)}"`
        chunks.push(`<img${src} alt="${alt}"${title}${scope} />`)
        break
      }
      case 'definition':
        break
      case 'linkReference': {
        const definition = definitions.get(node.identifier)
        if (definition === undefined) {
          pushInOrder(stack, childActions(node.children, inlineContext))
          break
        }
        const href = urlAttribute(
          'href',
          definition.url,
          definition.position,
          options.trust,
          diagnostics,
        )
        const title = definition.title === null ? '' : ` title="${escapeHtml(definition.title)}"`
        pushInOrder(stack, [
          write(`<a${href}${title}${scope}>`),
          ...childActions(node.children, inlineContext),
          write('</a>'),
        ])
        break
      }
      case 'imageReference': {
        const definition = definitions.get(node.identifier)
        if (definition === undefined) {
          chunks.push(escapeHtml(node.alt ?? ''))
          break
        }
        const src = urlAttribute(
          'src',
          definition.url,
          definition.position,
          options.trust,
          diagnostics,
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
            ...tableRowActions(header.children, node.align, true, scope),
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
            actions.push(...tableRowActions(row.children, node.align, false, scope))
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
          ...node.children.map((cell) => emitNode(cell, context)),
          write('</tr>\n'),
        ])
        break
      case 'tableCell':
        pushInOrder(stack, tableCellActions(node, context, scope))
        break
      case 'textDirective':
        pushInOrder(stack, directiveActions(node, context, document, scope))
        break
      case 'leafDirective':
        pushInOrder(stack, directiveActions(node, context, document, scope))
        break
      case 'containerDirective':
        pushInOrder(stack, directiveActions(node, context, document, scope))
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
