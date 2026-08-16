import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Interpolation, Node, Root, Span } from '@hymarkx/ast'
import { authoredComponentFor, type AuthoredComponentDefinition } from '../components/authored.js'
import type { ComponentRegistry, DirectiveNode } from '../components/types.js'
import { validateComponent } from '../components/validate.js'
import type { AnalyzedComponent } from '../components/validate.js'
import { setDiagnosticOrigin } from '../diagnostic-origin.js'
import { evaluateExpression } from '../expression.js'
import type { ExpressionEvaluation, ExpressionValue } from '../expression.js'
import { nearestSuggestion } from '../suggestions.js'
import type { FrontmatterValue, TrustMode } from '../types.js'

/** Syntax tree plus diagnostics produced by semantic analysis. */
export interface AnalyzedDocument {
  readonly root: Root
  readonly source: string
  readonly from?: string
  readonly authored?: AuthoredComponentDefinition
  readonly diagnostics: readonly Diagnostic[]
  readonly components: ReadonlyMap<DirectiveNode, AnalyzedComponent>
  readonly interpolations: ReadonlyMap<Interpolation, string>
  readonly expansions: ReadonlyMap<DirectiveNode, AnalyzedExpansion>
  readonly projections: ReadonlyMap<DirectiveNode, ProjectedChildren>
}

/** One recursively analyzed authored-component invocation. */
export interface AnalyzedExpansion {
  readonly document: AnalyzedDocument
}

/** Caller-owned child nodes substituted at a component's ::children marker. */
export interface ProjectedChildren {
  readonly document: AnalyzedDocument
  readonly nodes: readonly Node[]
}

interface AnalyzeOptions {
  readonly components: ComponentRegistry
  readonly trust: TrustMode
  readonly source: string
  readonly from?: string
  readonly frontmatter?: FrontmatterValue
}

interface RecursiveAnalyzeOptions extends AnalyzeOptions {
  readonly scope: FrontmatterValue
  readonly identifierNames: readonly string[]
  readonly stack: readonly string[]
  readonly authored?: AuthoredComponentDefinition
}

const MAX_COMPONENT_DEPTH = 32

/**
 * Matches a line that opens like a block directive: two or more colons immediately
 * followed by a directive name character. Prose such as `:: note` or a bare `:::` does
 * not match, because a name character must follow the colons with no space.
 */
const DIRECTIVE_LIKE = /^:{2,}[A-Za-z0-9]/

/**
 * Reports paragraphs that look like a block directive but were not parsed as one.
 *
 * The tokenizer refuses to open a directive whose attribute block is malformed — for
 * example `:::card{ bad` — and the line then falls through to ordinary Markdown. Without this
 * check the document renders
 * the source text verbatim and says nothing, which is the least debuggable failure a
 * markup language can have.
 */
function checkDirectiveLikeParagraphs(root: Root, diagnostics: Diagnostic[]): void {
  visit(root, (node) => {
    if (node.type !== 'paragraph') {
      return
    }

    const first = node.children[0]
    if (first?.type !== 'text' || !DIRECTIVE_LIKE.test(first.value)) {
      return
    }

    diagnostics.push(
      createDiagnostic({
        code: 'HMX1011',
        severity: 'warning',
        message: 'This line looks like a directive but was not recognized as one.',
        span: node.position,
        expected: 'a well-formed attribute block, such as :::name{key="value"}',
      }),
    )
  })
}

interface ExpressionSource {
  readonly value: string
  readonly startOffset: number
}

function leadingWhitespaceLength(value: string): number {
  return value.length - value.trimStart().length
}

function interpolationSource(node: Interpolation, source: string): ExpressionSource {
  const raw = source.slice(node.position.start.offset, node.position.end.offset)
  const interior = raw.startsWith('{{') && raw.endsWith('}}') ? raw.slice(2, -2) : node.value
  return {
    value: node.value,
    startOffset:
      node.position.start.offset +
      (raw.startsWith('{{') ? 2 : 0) +
      leadingWhitespaceLength(interior),
  }
}

function attributeExpression(attribute: Attribute, source: string): ExpressionSource | undefined {
  if (attribute.value === null || attribute.valueSpan === undefined) {
    return undefined
  }
  const start = attribute.valueSpan.start.offset
  const end = attribute.valueSpan.end.offset
  if (start < 1 || source[start - 1] !== '{' || source[end] !== '}') {
    return undefined
  }
  const interior = source.slice(start, end)
  return {
    value: attribute.value,
    startOffset: start + leadingWhitespaceLength(interior),
  }
}

function expressionSpan(expression: ExpressionSource, source: string): Span {
  const start = expression.startOffset
  const end = start + expression.value.length
  const pointAt = (offset: number) => {
    let line = 1
    let lineStart = 0
    for (let index = 0; index < offset; index += 1) {
      if (source.charCodeAt(index) === 10) {
        line += 1
        lineStart = index + 1
      }
    }
    return { line, column: offset - lineStart + 1, offset }
  }
  return { start: pointAt(start), end: pointAt(end) }
}

function interpolationText(
  value: ExpressionValue,
  expression: ExpressionSource,
  source: string,
  diagnostics: Diagnostic[],
): string {
  if (value === null) {
    return ''
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2042',
          severity: 'error',
          message: 'Numeric result must be finite.',
          span: expressionSpan(expression, source),
        }),
      )
      return ''
    }
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value)
  }
  diagnostics.push(
    createDiagnostic({
      code: 'HMX2043',
      severity: 'error',
      message: 'Objects and arrays cannot be rendered in a text position.',
      span: expressionSpan(expression, source),
    }),
  )
  return ''
}

function callerChildren(node: DirectiveNode): readonly Node[] {
  return node.type === 'containerDirective' ? node.children : []
}

function propScope(component: AnalyzedComponent): FrontmatterValue {
  const scope = Object.create(null) as Record<string, FrontmatterValue[string]>
  for (const name of Object.keys(component.schema.attributes)) {
    const value = component.attributes[name]
    if (Object.hasOwn(component.attributes, name) && value !== undefined) {
      scope[name] = value
    }
  }
  return scope
}

function analyzeDocument(root: Root, options: RecursiveAnalyzeOptions): AnalyzedDocument {
  const diagnostics: Diagnostic[] = []
  const components = new Map<DirectiveNode, AnalyzedComponent>()
  const interpolations = new Map<Interpolation, string>()
  const attributeExpressions = new Map<Attribute, ExpressionEvaluation>()
  const expansions = new Map<DirectiveNode, AnalyzedExpansion>()
  const projections = new Map<DirectiveNode, ProjectedChildren>()
  const document: AnalyzedDocument = {
    root,
    source: options.source,
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.authored === undefined ? {} : { authored: options.authored }),
    diagnostics,
    components,
    interpolations,
    expansions,
    projections,
  }

  checkDirectiveLikeParagraphs(root, diagnostics)

  visit(root, (node) => {
    if (node.type === 'interpolation') {
      const expression = interpolationSource(node, options.source)
      const evaluation = evaluateExpression(expression.value, options.scope, {
        documentSource: options.source,
        startOffset: expression.startOffset,
        identifierNames: options.identifierNames,
      })
      diagnostics.push(...evaluation.diagnostics)
      interpolations.set(
        node,
        evaluation.ok
          ? interpolationText(evaluation.value, expression, options.source, diagnostics)
          : '',
      )
      return
    }

    if (
      node.type === 'textDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'containerDirective'
    ) {
      if (node.type === 'leafDirective' && node.name === 'children') {
        if (options.authored === undefined) {
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2056',
              severity: 'error',
              message: '::children can only appear inside an authored component document.',
              span: node.position,
            }),
          )
        }
        return
      }

      for (const attribute of node.attributes) {
        const expression = attributeExpression(attribute, options.source)
        if (expression !== undefined) {
          const evaluation = evaluateExpression(expression.value, options.scope, {
            documentSource: options.source,
            startOffset: expression.startOffset,
            identifierNames: options.identifierNames,
          })
          attributeExpressions.set(attribute, evaluation)
          diagnostics.push(...evaluation.diagnostics)
        }
      }

      const schema = Object.hasOwn(options.components.schemas, node.name)
        ? options.components.schemas[node.name]
        : undefined
      const renderer = Object.hasOwn(options.components.renderers, node.name)
        ? options.components.renderers[node.name]
        : undefined
      if (schema === undefined || renderer === undefined) {
        const replacement = nearestSuggestion(node.name, Object.keys(options.components.schemas))
        diagnostics.push(
          createDiagnostic({
            code: 'HMX2002',
            severity: 'warning',
            message: `Unknown directive "${node.name}"; rendering its content without a wrapper.`,
            span: node.position,
            ...(replacement === undefined
              ? {}
              : {
                  suggestion: {
                    message: `Replace with "${replacement}".`,
                    replacement,
                    span: node.position,
                  },
                }),
          }),
        )
      } else {
        const component = validateComponent(
          node,
          schema,
          renderer,
          options.trust,
          attributeExpressions,
          diagnostics,
        )
        components.set(node, component)

        const authored = authoredComponentFor(renderer)
        if (authored === undefined || !component.kindAllowed) {
          return
        }

        const cycleStart = options.stack.indexOf(authored.name)
        if (cycleStart !== -1) {
          const cycle = [...options.stack.slice(cycleStart), authored.name]
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2054',
              severity: 'error',
              message: `Authored component cycle detected: ${cycle.join(' -> ')}.`,
              span: node.position,
            }),
          )
          return
        }
        if (options.stack.length >= MAX_COMPONENT_DEPTH) {
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2055',
              severity: 'error',
              message: `Authored component expansion exceeds the maximum depth of ${MAX_COMPONENT_DEPTH}.`,
              span: node.position,
            }),
          )
          return
        }

        const children = callerChildren(node)
        const marker = authored.childrenMarkers[0]
        if (marker === undefined && children.length > 0) {
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2052',
              severity: 'warning',
              message: `Authored component "${authored.name}" discards supplied content because it has no ::children directive.`,
              span: children[0]?.position ?? node.position,
            }),
          )
        }

        const nested = analyzeDocument(authored.root, {
          components: options.components,
          trust: options.trust,
          source: authored.source,
          ...(authored.from === undefined ? {} : { from: authored.from }),
          scope: propScope(component),
          identifierNames: Object.keys(schema.attributes),
          stack: [...options.stack, authored.name],
          authored,
        })
        if (marker !== undefined) {
          const nestedProjections = nested.projections as Map<DirectiveNode, ProjectedChildren>
          nestedProjections.set(marker, {
            document,
            nodes: children,
          })
        }
        expansions.set(node, { document: nested })
        diagnostics.push(...nested.diagnostics)
      }
    }
  })

  for (const diagnostic of diagnostics) {
    setDiagnosticOrigin(diagnostic, options.source, options.from)
  }
  return document
}

/** Runs semantic component checks without mutating the syntax tree. */
export function analyze(root: Root, options: AnalyzeOptions): AnalyzedDocument {
  const scope = options.frontmatter ?? (Object.create(null) as FrontmatterValue)
  return analyzeDocument(root, {
    ...options,
    scope,
    identifierNames: Object.keys(scope),
    stack: [],
  })
}
