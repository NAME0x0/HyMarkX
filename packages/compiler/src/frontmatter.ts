import { createDiagnostic, isForbiddenAttributeName } from '@hymarkx/ast'
import type { Diagnostic, Point, Root, Span, Yaml } from '@hymarkx/ast'
import { parseDocument } from 'yaml'
import type { DocumentOptions, ParseOptions, SchemaOptions, ToJSOptions } from 'yaml'
import type { FrontmatterScalar, FrontmatterValue } from './types.js'

interface FrontmatterResult {
  readonly diagnostics: readonly Diagnostic[]
  readonly value?: FrontmatterValue
  /**
   * `false` when a leading `---` block is not frontmatter after all and the document
   * should be reparsed as ordinary Markdown. See {@link looksLikeMapping}.
   */
  readonly recognized: boolean
}

/**
 * Reports whether a block was plausibly *intended* as frontmatter.
 *
 * `---` is also ordinary CommonMark. `---\nFoo\n---\nBar\n---` is a thematic break
 * followed by two setext headings, and `---\n---` is two thematic breaks; both appear in
 * the conformance suite. Treating every leading `---` block as frontmatter would break the
 * compatibility guarantee in SPEC §3, which outranks frontmatter.
 *
 * So a block becomes frontmatter only when it parses as a YAML mapping. When it does not,
 * the document is reparsed as Markdown — silently, unless it contains a `key:` line, which
 * means the author was writing frontmatter and deserves to hear what went wrong rather
 * than watch it render as prose.
 */
const LOOKS_LIKE_MAPPING = /^[ \t]*[A-Za-z_][A-Za-z0-9_-]*[ \t]*:(?:\s|$)/m

function looksLikeMapping(value: string): boolean {
  return LOOKS_LIKE_MAPPING.test(value)
}

function unrecognized(node: Yaml, diagnostics: readonly Diagnostic[]): FrontmatterResult {
  return {
    recognized: false,
    diagnostics: looksLikeMapping(node.value) ? diagnostics : [],
  }
}

const YAML_PARSE_OPTIONS: ParseOptions & DocumentOptions & SchemaOptions & ToJSOptions = {
  schema: 'core',
  merge: false,
  customTags: [],
  stringKeys: true,
  uniqueKeys: true,
  maxAliasCount: 10,
  version: '1.2',
}

const reservedTypes = {
  title: 'string',
  description: 'string',
  layout: 'string',
  lang: 'string',
  draft: 'boolean',
  // Head metadata (ADR-0020). Named one per intent rather than a general `head:` mapping,
  // which would put `http-equiv` — page navigation and content security policy — inside a
  // document's reach.
  canonical: 'string',
  icon: 'string',
  image: 'string',
  siteName: 'string',
  author: 'string',
} as const

function pointAt(source: string, offset: number): Point {
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

function yamlPosition(error: unknown): readonly [number, number] | undefined {
  if (typeof error !== 'object' || error === null || !('pos' in error)) {
    return undefined
  }
  const position = error.pos
  if (
    !Array.isArray(position) ||
    !Number.isInteger(position[0]) ||
    !Number.isInteger(position[1])
  ) {
    return undefined
  }
  return [Number(position[0]), Number(position[1])]
}

function yamlValueOffset(node: Yaml, source: string): number {
  const openingLineEnd = source.indexOf('\n', node.position.start.offset)
  return openingLineEnd < 0 || openingLineEnd >= node.position.end.offset
    ? node.position.start.offset
    : openingLineEnd + 1
}

function yamlErrorSpan(error: unknown, node: Yaml, source: string): Span {
  const position = yamlPosition(error)
  if (position === undefined) {
    return node.position
  }

  const valueOffset = yamlValueOffset(node, source)
  const relativeStart = Math.min(Math.max(position[0], 0), node.value.length)
  const relativeEnd = Math.min(Math.max(position[1], relativeStart), node.value.length)
  return {
    start: pointAt(source, valueOffset + relativeStart),
    end: pointAt(source, valueOffset + relativeEnd),
  }
}

function yamlDiagnostic(error: unknown, node: Yaml, source: string): Diagnostic {
  const detail = error instanceof Error ? error.message : String(error)
  return createDiagnostic({
    code: 'HMX2021',
    severity: 'error',
    message: `Invalid YAML frontmatter: ${detail}`,
    span: yamlErrorSpan(error, node, source),
  })
}

function forbiddenKeyDiagnostic(name: string, span: Span): Diagnostic {
  return createDiagnostic({
    code: 'HMX3007',
    severity: 'error',
    message: `Frontmatter key "${name}" is forbidden because it can modify object prototypes.`,
    span,
  })
}

function isScalar(value: unknown): value is FrontmatterScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function rebuildValue(
  value: unknown,
  node: Yaml,
  diagnostics: Diagnostic[],
  ancestors: WeakSet<object>,
): unknown {
  if (isScalar(value)) {
    return value
  }
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`Unsupported YAML value type: ${typeof value}`)
  }
  if (ancestors.has(value)) {
    throw new TypeError('YAML aliases must not create cyclic values')
  }

  ancestors.add(value)
  if (Array.isArray(value)) {
    const output = value.map((item) => rebuildValue(item, node, diagnostics, ancestors))
    ancestors.delete(value)
    return output
  }

  const output = Object.create(null) as Record<string, unknown>
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenAttributeName(key)) {
      diagnostics.push(forbiddenKeyDiagnostic(key, node.position))
      continue
    }
    output[key] = rebuildValue(item, node, diagnostics, ancestors)
  }
  ancestors.delete(value)
  return output
}

function mappingDiagnostic(node: Yaml): Diagnostic {
  return createDiagnostic({
    code: 'HMX2020',
    severity: 'error',
    message: 'Frontmatter must be a mapping.',
    span: node.position,
    expected: 'a YAML mapping at the document root',
  })
}

function reservedKeyDiagnostics(value: FrontmatterValue, node: Yaml): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const [key, expected] of Object.entries(reservedTypes)) {
    if (Object.hasOwn(value, key) && typeof value[key] !== expected) {
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2022',
          severity: 'error',
          message: `Reserved frontmatter key "${key}" must be a ${expected}.`,
          span: node.position,
          expected: `a ${expected} value`,
        }),
      )
    }
  }
  return diagnostics
}

/** Parses and validates the root frontmatter node, if present. */
export function compileFrontmatter(root: Root, source: string): FrontmatterResult {
  const node = root.children[0]
  if (node?.type !== 'yaml') {
    return { recognized: true, diagnostics: [] }
  }
  if (node.value.trim().length === 0) {
    // `---\n---` is two thematic breaks in CommonMark. An empty block carries no metadata,
    // so there is nothing to lose by letting Markdown have it.
    return { recognized: false, diagnostics: [] }
  }

  let parsed: unknown
  try {
    const document = parseDocument(node.value, YAML_PARSE_OPTIONS)
    const issue = document.errors[0] ?? document.warnings[0]
    if (issue !== undefined) {
      return unrecognized(node, [yamlDiagnostic(issue, node, source)])
    }
    parsed = document.toJS(YAML_PARSE_OPTIONS) as unknown
  } catch (error) {
    return unrecognized(node, [yamlDiagnostic(error, node, source)])
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return unrecognized(node, [mappingDiagnostic(node)])
  }

  const diagnostics: Diagnostic[] = []
  let rebuilt: unknown
  try {
    rebuilt = rebuildValue(parsed, node, diagnostics, new WeakSet<object>())
  } catch (error) {
    return unrecognized(node, [yamlDiagnostic(error, node, source)])
  }
  const value = rebuilt as FrontmatterValue
  diagnostics.push(...reservedKeyDiagnostics(value, node))
  return { recognized: true, diagnostics, value }
}
