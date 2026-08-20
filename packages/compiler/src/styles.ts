import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Diagnostic, Html, Point } from '@hymarkx/ast'
import postcss from 'postcss'
import type { AtRule, Container, Document, Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import type { AnalyzedDocument } from './analyze/index.js'
import { builtinComponents } from './components/builtins.js'
import { builtinStylesFor } from './components/styles.js'
import { setDiagnosticOrigin } from './diagnostic-origin.js'

interface StyleBlock {
  readonly node: Html
  readonly css: string
  readonly cssOffset: number
  readonly scoped: boolean
  readonly index: number
}

/** CSS and HTML-emission metadata prepared for one compilation. */
export interface PreparedStyles {
  readonly css: string
  readonly diagnostics: readonly Diagnostic[]
  readonly omittedNodes: ReadonlyMap<AnalyzedDocument, ReadonlySet<Html>>
  readonly rootScopeAttributes: readonly string[]
  readonly componentScopeAttributes: ReadonlyMap<AnalyzedDocument, readonly string[]>
  readonly scopedBlocks: readonly PreparedScopedBlock[]
}

interface PreparedScopedBlock {
  readonly block: StyleBlock
  readonly attribute: string
  readonly source: string
  readonly from?: string
}

const EMPTY_STYLES: PreparedStyles = {
  css: '',
  diagnostics: [],
  omittedNodes: new Map(),
  rootScopeAttributes: [],
  componentScopeAttributes: new Map(),
  scopedBlocks: [],
}

function parseStyleBlock(node: Html, index: number): StyleBlock | undefined {
  const opening = /^<style(?<scoped>[ \t]+scoped)?[ \t]*>/i.exec(node.value)
  if (opening === null) {
    return undefined
  }
  const closing = node.value.toLowerCase().lastIndexOf('</style>')
  if (closing < opening[0].length || node.value.slice(closing + 8).trim() !== '') {
    return undefined
  }
  const css = node.value.slice(opening[0].length, closing)
  const scoped = opening.groups?.scoped !== undefined
  // CommonMark example 176 uses a same-line raw `<style>…</style>` block. Requiring
  // non-empty plain author styles to start on the next line preserves that baseline while
  // scoped blocks and the explicitly supported empty `<style></style>` remain unambiguous.
  if (!scoped && css !== '' && !css.startsWith('\n')) {
    return undefined
  }
  return {
    node,
    css,
    cssOffset: node.position.start.offset + opening[0].length,
    scoped,
    index,
  }
}

function collectStyleBlocks(document: AnalyzedDocument): readonly StyleBlock[] {
  const blocks: StyleBlock[] = []
  visit(document.root, (node) => {
    if (node.type === 'html') {
      const block = parseStyleBlock(node, blocks.length)
      if (block !== undefined) {
        blocks.push(block)
      }
    }
  })
  return blocks
}

function hashScope(identity: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function authoredScopeAttribute(identity: string, used: Set<string>): string {
  const base = `data-hmx-s-${hashScope(identity)}-${hashScope(`authored\0${identity}`)}`
  let attribute = base
  let collision = 1
  while (used.has(attribute)) {
    collision += 1
    attribute = `${base}-${collision}`
  }
  used.add(attribute)
  return attribute
}

function isInsideKeyframes(rule: Rule): boolean {
  let parent: Container | Document | undefined = rule.parent
  while (parent !== undefined) {
    if (parent.type === 'atrule' && /(?:^|-)keyframes$/i.test((parent as AtRule).name)) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function markGlobal(node: selectorParser.Node, globals: WeakSet<selectorParser.Node>): void {
  globals.add(node)
  if ('nodes' in node) {
    for (const child of node.nodes) {
      markGlobal(child, globals)
    }
  }
}

function unwrapGlobals(
  selector: selectorParser.Selector,
  globals: WeakSet<selectorParser.Node>,
): void {
  const pseudos: selectorParser.Pseudo[] = []
  selector.walkPseudos((pseudo) => {
    if (pseudo.value.toLowerCase() === ':global') {
      pseudos.push(pseudo)
    }
  })
  for (const pseudo of pseudos.reverse()) {
    const nested = pseudo.nodes[0]
    if (nested === undefined || pseudo.nodes.length !== 1) {
      throw new Error(':global() requires exactly one selector')
    }
    const replacements = nested.nodes.map((node) => node.clone())
    for (const replacement of replacements) {
      markGlobal(replacement, globals)
    }
    pseudo.replaceWith(...replacements)
  }
}

function addScopeAttribute(
  selector: selectorParser.Selector,
  attributeName: string,
  globals: WeakSet<selectorParser.Node>,
): void {
  let selectedStart = -1
  let selectedEnd = -1
  let compoundStart = 0
  let compoundHasLocal = false

  for (let index = 0; index <= selector.nodes.length; index += 1) {
    const node = selector.nodes[index]
    if (node !== undefined && node.type !== 'combinator') {
      if (node.type !== 'comment' && !globals.has(node)) {
        compoundHasLocal = true
      }
      continue
    }
    if (compoundHasLocal) {
      selectedStart = compoundStart
      selectedEnd = index
    }
    compoundStart = index + 1
    compoundHasLocal = false
  }

  if (selectedStart === -1) {
    return
  }
  const attribute = selectorParser.attribute({
    attribute: attributeName,
    value: undefined,
    raws: {},
  })
  const pseudo = selector.nodes
    .slice(selectedStart, selectedEnd)
    .find((node) => node.type === 'pseudo')
  if (pseudo !== undefined) {
    selector.insertBefore(pseudo, attribute)
    return
  }
  const last = selector.nodes[selectedEnd - 1]
  if (last !== undefined) {
    selector.insertAfter(last, attribute)
  }
}

function scopeRule(rule: Rule, attributeName: string): void {
  if (isInsideKeyframes(rule)) {
    return
  }
  try {
    rule.selector = selectorParser((root) => {
      root.each((selector) => {
        const globals = new WeakSet<selectorParser.Node>()
        unwrapGlobals(selector, globals)
        addScopeAttribute(selector, attributeName, globals)
      })
    }).processSync(rule.selector)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw rule.error(message, { word: rule.selector })
  }
}

function pointAt(source: string, offset: number): Point {
  let line = 1
  let column = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column, offset }
}

function relativeOffset(
  value: string,
  line: number | undefined,
  column: number | undefined,
): number {
  if (line === undefined || column === undefined) {
    return 0
  }
  let offset = 0
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = value.indexOf('\n', offset)
    if (newline === -1) {
      return value.length
    }
    offset = newline + 1
  }
  return Math.min(offset + Math.max(column - 1, 0), value.length)
}

function syntaxErrorDiagnostic(error: unknown, source: string, block: StyleBlock): Diagnostic {
  const located = error as {
    readonly reason?: string
    readonly message?: string
    readonly line?: number
    readonly column?: number
    readonly endLine?: number
    readonly endColumn?: number
  }
  const startOffset = Math.min(
    block.cssOffset + relativeOffset(block.css, located.line, located.column),
    source.length,
  )
  const reportedEnd = relativeOffset(block.css, located.endLine, located.endColumn)
  const endOffset = Math.min(
    Math.max(startOffset + 1, block.cssOffset + reportedEnd),
    source.length,
  )
  return createDiagnostic({
    code: 'HMX2030',
    severity: 'error',
    message: `CSS syntax error: ${located.reason ?? located.message ?? 'invalid CSS'}`,
    span: { start: pointAt(source, startOffset), end: pointAt(source, endOffset) },
  })
}

function compileStyleBlock(
  block: StyleBlock,
  attributeName: string | undefined,
  source: string,
  from: string | undefined,
): { readonly css: string; readonly diagnostic?: Diagnostic } {
  try {
    const root = postcss.parse(block.css, from === undefined ? {} : { from })
    if (attributeName !== undefined) {
      root.walkRules((rule) => scopeRule(rule, attributeName))
      return { css: root.toString() }
    }
    return { css: block.css }
  } catch (error) {
    return { css: '', diagnostic: syntaxErrorDiagnostic(error, source, block) }
  }
}

function analyzedDocuments(root: AnalyzedDocument): readonly AnalyzedDocument[] {
  const documents: AnalyzedDocument[] = []
  const seen = new Set<AnalyzedDocument>()
  const stack = [root]
  while (stack.length > 0) {
    const document = stack.pop()
    if (document === undefined || seen.has(document)) {
      continue
    }
    seen.add(document)
    documents.push(document)
    const nested = [...document.expansions.values()].map((expansion) => expansion.document)
    for (let index = nested.length - 1; index >= 0; index -= 1) {
      const child = nested[index]
      if (child !== undefined) {
        stack.push(child)
      }
    }
  }
  return documents
}

function usedBuiltinComponents(documents: readonly AnalyzedDocument[]): ReadonlySet<string> {
  const used = new Set<string>()
  for (const document of documents) {
    for (const [node, component] of document.components) {
      if (
        component.kindAllowed &&
        component.schema === builtinComponents.schemas[node.name] &&
        component.renderer === builtinComponents.renderers[node.name]
      ) {
        used.add(node.name)
      }
    }
  }
  return used
}

/** Collects app-mode author CSS and proportional built-in component CSS. */
export function prepareStyles(
  document: AnalyzedDocument,
  source: string,
  options: { readonly from?: string; readonly collectAuthorStyles: boolean },
): PreparedStyles {
  const documents = analyzedDocuments(document)
  const builtins = builtinStylesFor(usedBuiltinComponents(documents))
  const omittedNodes = new Map<AnalyzedDocument, ReadonlySet<Html>>()
  const rootScopeAttributes: string[] = []
  const componentScopeAttributes = new Map<AnalyzedDocument, readonly string[]>()
  const scopedBlocks: PreparedScopedBlock[] = []
  const diagnostics: Diagnostic[] = []
  const authorCss: string[] = []
  const usedComponentScopeAttributes = new Set<string>()

  if (options.collectAuthorStyles) {
    const blocks = collectStyleBlocks(document)
    omittedNodes.set(document, new Set(blocks.map((block) => block.node)))
    for (const block of blocks) {
      // Identity, not content. Hashing the source renamed every scope attribute and every
      // selector referencing it whenever anything in the document changed, so a whitespace-only
      // reformat produced churn across the emitted CSS and HTML for an edit that altered
      // nothing. A path plus the block's index identifies the same block across edits.
      //
      // The content stays in the hash only when there is no path to identify the document by.
      // An anonymous compile is an embedding case where outputs may be concatenated, and two
      // documents sharing a scope attribute would leak one's styles onto the other's elements.
      const identity =
        options.from === undefined
          ? `\0${source}\0${block.index}`
          : `${options.from}\0${block.index}`
      const attributeName = block.scoped ? `data-hmx-s-${hashScope(identity)}` : undefined
      const compiled = compileStyleBlock(block, attributeName, source, options.from)
      if (compiled.diagnostic !== undefined) {
        diagnostics.push(compiled.diagnostic)
        continue
      }
      if (compiled.css !== '') {
        authorCss.push(compiled.css)
      }
      if (attributeName !== undefined) {
        rootScopeAttributes.push(attributeName)
        scopedBlocks.push({
          block,
          attribute: attributeName,
          source,
          ...(options.from === undefined ? {} : { from: options.from }),
        })
      }
    }
  }

  const componentDocuments = new Map<
    NonNullable<AnalyzedDocument['authored']>,
    AnalyzedDocument[]
  >()
  for (const owner of documents) {
    if (owner.authored === undefined) {
      continue
    }
    const instances = componentDocuments.get(owner.authored) ?? []
    instances.push(owner)
    componentDocuments.set(owner.authored, instances)
  }

  for (const [definition, instances] of componentDocuments) {
    const representative = instances[0]
    if (representative === undefined) {
      continue
    }
    const blocks = collectStyleBlocks(representative)
    const omitted = new Set(blocks.map((block) => block.node))
    for (const instance of instances) {
      omittedNodes.set(instance, omitted)
    }
    const attributes: string[] = []
    for (const block of blocks) {
      if (!block.scoped || /<\s*script\b/i.test(block.css)) {
        continue
      }
      const identity = `${definition.name}\0${definition.from ?? ''}\0${definition.source}\0${block.index}`
      const attributeName = authoredScopeAttribute(identity, usedComponentScopeAttributes)
      const compiled = compileStyleBlock(block, attributeName, definition.source, definition.from)
      if (compiled.diagnostic !== undefined) {
        setDiagnosticOrigin(compiled.diagnostic, definition.source, definition.from)
        diagnostics.push(compiled.diagnostic)
        continue
      }
      if (compiled.css !== '') {
        authorCss.push(compiled.css)
      }
      attributes.push(attributeName)
      scopedBlocks.push({
        block,
        attribute: attributeName,
        source: definition.source,
        ...(definition.from === undefined ? {} : { from: definition.from }),
      })
    }
    for (const instance of instances) {
      componentScopeAttributes.set(instance, attributes)
    }
  }

  if (
    builtins === '' &&
    authorCss.length === 0 &&
    diagnostics.length === 0 &&
    omittedNodes.size === 0
  ) {
    return EMPTY_STYLES
  }

  return {
    css: [builtins, ...authorCss].filter((value) => value !== '').join('\n'),
    diagnostics,
    omittedNodes,
    rootScopeAttributes,
    componentScopeAttributes,
    scopedBlocks,
  }
}

/** Warns for valid scoped blocks when no generated element received their scope attribute. */
export function emptyScopeDiagnostics(styles: PreparedStyles, html: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const { block, attribute, source, from } of styles.scopedBlocks) {
    if (html.includes(` ${attribute}`)) {
      continue
    }
    const diagnostic = createDiagnostic({
      code: 'HMX2031',
      severity: 'warning',
      message: 'Scoped style has no emitted elements to scope.',
      span: block.node.position,
    })
    setDiagnosticOrigin(diagnostic, source, from)
    diagnostics.push(diagnostic)
  }
  return diagnostics
}
