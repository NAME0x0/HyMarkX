import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Interpolation, Node, Root, Span } from '@hymarkx/ast'
import { authoredComponentFor, type AuthoredComponentDefinition } from '../components/authored.js'
import type { ComponentRegistry, DirectiveNode } from '../components/types.js'
import { validateComponent } from '../components/validate.js'
import type { AnalyzedComponent } from '../components/validate.js'
import { setDiagnosticOrigin } from '../diagnostic-origin.js'
import {
  compileHandlerExpression,
  evaluateExpression,
  isExpressionIdentifier,
} from '../expression.js'
import type { ExpressionEvaluation, ExpressionInstruction, ExpressionValue } from '../expression.js'
import { isAllowedEventAttribute } from '../events.js'
import type { EventName } from '../events.js'
import { nearestSuggestion } from '../suggestions.js'
import type { FrontmatterScalar, FrontmatterValue, TrustMode } from '../types.js'

/** One state-dependent expression and the local state names that can invalidate it. */
export interface ReactiveExpression {
  readonly instruction: ExpressionInstruction
  readonly identifiers: readonly string[]
  readonly stateNames: readonly string[]
}

/** One reactive directive attribute that maps to an emitted element attribute. */
export interface ReactiveAttribute {
  readonly name: string
  readonly expression: ReactiveExpression
  /** Whether runtime writes must retain URL scheme restrictions. */
  readonly url: boolean
}

/** One allowlisted event handler compiled for the browser interpreter. */
export interface AnalyzedEvent {
  readonly name: EventName
  readonly instruction: ExpressionInstruction
  readonly assignments: readonly string[]
  readonly inputState?: string
}

/** Component-local state and state-to-view edges discovered during semantic analysis. */
export interface AnalyzedReactivity {
  readonly state: Readonly<Record<string, FrontmatterScalar>>
  readonly scope: FrontmatterValue
  readonly interpolations: ReadonlyMap<Interpolation, ReactiveExpression>
  readonly attributes: ReadonlyMap<DirectiveNode, readonly ReactiveAttribute[]>
  readonly events: ReadonlyMap<DirectiveNode, readonly AnalyzedEvent[]>
}

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
  readonly reactivity: AnalyzedReactivity
}

/** One recursively analyzed authored-component invocation. */
export interface AnalyzedExpansion {
  readonly document: AnalyzedDocument
  /** Reactive caller expressions supplying authored-component props. */
  readonly propBindings: ReadonlyMap<string, ReactiveExpression>
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

const STATE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function stateValue(attribute: Attribute, source: string): FrontmatterScalar {
  if (attribute.value === null) {
    return null
  }
  const span = attribute.valueSpan
  const opening = span === undefined ? undefined : source[span.start.offset - 1]
  const closing = span === undefined ? undefined : source[span.end.offset]
  if ((opening === '"' || opening === "'") && closing === opening) {
    return attribute.value
  }
  if (attribute.value === 'true') return true
  if (attribute.value === 'false') return false
  if (attribute.value === 'null') return null
  if (STATE_NUMBER.test(attribute.value)) {
    const value = Number(attribute.value)
    return Number.isFinite(value) ? value : attribute.value
  }
  return attribute.value
}

function isStateExpression(attribute: Attribute, source: string): boolean {
  const span = attribute.valueSpan
  return (
    span !== undefined && source[span.start.offset - 1] === '{' && source[span.end.offset] === '}'
  )
}

function stateDiagnostic(code: 'HMX2062' | 'HMX2063', message: string, span: Span): Diagnostic {
  return createDiagnostic({ code, severity: 'error', message, span })
}

function collectState(
  root: Root,
  source: string,
  existingNames: readonly string[],
  diagnostics: Diagnostic[],
): Readonly<Record<string, FrontmatterScalar>> {
  const state = Object.create(null) as Record<string, FrontmatterScalar>
  const rootDeclarations = new Set(
    root.children.filter((node) => node.type === 'leafDirective' && node.name === 'state'),
  )
  const occupied = new Set(existingNames)

  visit(root, (node) => {
    if (node.type !== 'leafDirective' || node.name !== 'state') return
    if (!rootDeclarations.has(node)) {
      diagnostics.push(
        stateDiagnostic(
          'HMX2063',
          '::state must be declared directly in a document or authored component root.',
          node.position,
        ),
      )
      return
    }
    for (const attribute of node.attributes) {
      if (!isExpressionIdentifier(attribute.name)) {
        diagnostics.push(
          stateDiagnostic(
            'HMX2062',
            `State name "${attribute.name}" is not a valid expression identifier.`,
            attribute.nameSpan,
          ),
        )
        continue
      }
      if (occupied.has(attribute.name) || Object.hasOwn(state, attribute.name)) {
        diagnostics.push(
          stateDiagnostic(
            'HMX2062',
            `State name "${attribute.name}" collides with an existing expression-scope name.`,
            attribute.nameSpan,
          ),
        )
        continue
      }
      if (isStateExpression(attribute, source)) {
        diagnostics.push(
          stateDiagnostic(
            'HMX2062',
            `State "${attribute.name}" requires a scalar literal; named derived state is not supported.`,
            attribute.valueSpan ?? attribute.nameSpan,
          ),
        )
        continue
      }
      state[attribute.name] = stateValue(attribute, source)
    }
  })
  return state
}

function reactiveExpression(
  evaluation: Extract<ExpressionEvaluation, { readonly ok: true }>,
  stateNames: ReadonlySet<string>,
): ReactiveExpression {
  const dependencies = evaluation.identifiers.filter((name) => stateNames.has(name))
  return {
    instruction: evaluation.instruction,
    identifiers: evaluation.identifiers,
    stateNames: dependencies,
  }
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
  const state = collectState(root, options.source, options.identifierNames, diagnostics)
  const stateNames = new Set(Object.keys(state))
  const scope = Object.assign(Object.create(null), options.scope, state) as FrontmatterValue
  const identifierNames = [...options.identifierNames, ...stateNames]
  const components = new Map<DirectiveNode, AnalyzedComponent>()
  const interpolations = new Map<Interpolation, string>()
  const reactiveInterpolations = new Map<Interpolation, ReactiveExpression>()
  const reactiveAttributes = new Map<DirectiveNode, readonly ReactiveAttribute[]>()
  const events = new Map<DirectiveNode, readonly AnalyzedEvent[]>()
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
    reactivity: {
      state,
      scope,
      interpolations: reactiveInterpolations,
      attributes: reactiveAttributes,
      events,
    },
  }

  checkDirectiveLikeParagraphs(root, diagnostics)

  visit(root, (node) => {
    if (node.type === 'interpolation') {
      const expression = interpolationSource(node, options.source)
      const evaluation = evaluateExpression(expression.value, scope, {
        documentSource: options.source,
        startOffset: expression.startOffset,
        identifierNames,
        strictScope: stateNames.size > 0,
      })
      diagnostics.push(...evaluation.diagnostics)
      if (evaluation.ok) {
        const reactive = reactiveExpression(evaluation, stateNames)
        reactiveInterpolations.set(node, reactive)
      }
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
      if (node.type === 'leafDirective' && node.name === 'state') {
        return
      }
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

      const schema = Object.hasOwn(options.components.schemas, node.name)
        ? options.components.schemas[node.name]
        : undefined
      const renderer = Object.hasOwn(options.components.renderers, node.name)
        ? options.components.renderers[node.name]
        : undefined
      const ignoredAttributes = new Set<Attribute>()
      const nodeEvents: AnalyzedEvent[] = []
      const nodeReactiveAttributes: ReactiveAttribute[] = []
      for (const attribute of node.attributes) {
        if (attribute.name.startsWith('on-')) {
          ignoredAttributes.add(attribute)
          if (!isAllowedEventAttribute(attribute.name)) {
            diagnostics.push(
              createDiagnostic({
                code: 'HMX2060',
                severity: 'error',
                message: `Event attribute "${attribute.name}" is not allowlisted.`,
                span: attribute.nameSpan,
              }),
            )
            continue
          }
          if (attribute.value === null) {
            diagnostics.push(
              createDiagnostic({
                code: 'HMX2061',
                severity: 'error',
                message: `Event attribute "${attribute.name}" requires a handler expression.`,
                span: attribute.nameSpan,
              }),
            )
            continue
          }
          const handler = compileHandlerExpression(attribute.value, stateNames, {
            documentSource: options.source,
            startOffset: attribute.valueSpan?.start.offset ?? attribute.nameSpan.end.offset,
            identifierNames: [...stateNames],
          })
          diagnostics.push(...handler.diagnostics)
          if (handler.ok) {
            const name = attribute.name.slice(3) as EventName
            if (name === 'input' && node.name === 'input' && handler.assignments.length !== 1) {
              diagnostics.push(
                createDiagnostic({
                  code: 'HMX2061',
                  severity: 'error',
                  message: 'on-input on an input must assign exactly one declared state name.',
                  span: attribute.valueSpan ?? attribute.nameSpan,
                }),
              )
              continue
            }
            const inputState =
              name === 'input' && node.name === 'input' ? handler.assignments[0] : undefined
            nodeEvents.push({
              name,
              instruction: handler.instruction,
              assignments: handler.assignments,
              ...(inputState === undefined ? {} : { inputState }),
            })
          }
          continue
        }
        const expression = attributeExpression(attribute, options.source)
        if (expression !== undefined) {
          const evaluation = evaluateExpression(expression.value, scope, {
            documentSource: options.source,
            startOffset: expression.startOffset,
            identifierNames,
            strictScope: stateNames.size > 0,
          })
          attributeExpressions.set(attribute, evaluation)
          diagnostics.push(...evaluation.diagnostics)
          if (evaluation.ok) {
            const reactive = reactiveExpression(evaluation, stateNames)
            nodeReactiveAttributes.push({
              name: attribute.name,
              expression: reactive,
              url:
                options.trust === 'document' && schema?.attributes[attribute.name]?.type === 'url',
            })
          }
        }
      }
      if (nodeEvents.length > 0) events.set(node, nodeEvents)
      if (nodeReactiveAttributes.length > 0) {
        reactiveAttributes.set(node, nodeReactiveAttributes)
      }

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
          ignoredAttributes,
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
        const propNames = new Set(Object.keys(schema.attributes))
        expansions.set(node, {
          document: nested,
          propBindings: new Map(
            nodeReactiveAttributes
              .filter(({ name }) => propNames.has(name))
              .map(({ name, expression }) => [name, expression]),
          ),
        })
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
