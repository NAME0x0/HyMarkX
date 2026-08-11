import { createDiagnostic } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Span } from '@hymarkx/ast'
import { isAllowedDocumentUrl } from '../emit/sanitize.js'
import type { TrustMode } from '../types.js'
import type {
  AttributeSchema,
  ComponentRenderer,
  ComponentSchema,
  DirectiveKind,
  DirectiveNode,
  ResolvedAttribute,
  ResolvedAttributes,
} from './types.js'

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/
const CLASS_NAMES = /^[A-Za-z0-9_ -]*$/

const universalAttributes: Readonly<Record<string, AttributeSchema>> = {
  id: { type: 'identifier', description: 'A unique HTML identifier.' },
  class: { type: 'string', description: 'Space-separated HTML class names.' },
  title: { type: 'string', description: 'Advisory text for the component.' },
}

/** Validated data and trusted renderer associated with one known directive node. */
export interface AnalyzedComponent {
  readonly schema: ComponentSchema
  readonly renderer: ComponentRenderer
  readonly attributes: ResolvedAttributes
  readonly kindAllowed: boolean
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? 0
      const next = Math.min(
        above + 1,
        (previous[rightIndex - 1] ?? 0) + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
      previous[rightIndex] = next
    }
  }
  return previous[right.length] ?? 0
}

/** Returns the single closest case-insensitive candidate within edit distance two. */
export function nearestSuggestion(
  value: string,
  candidates: readonly string[],
): string | undefined {
  let closest: string | undefined
  let closestDistance = 3
  const normalized = value.toLowerCase()
  for (const candidate of candidates) {
    const distance = levenshtein(normalized, candidate.toLowerCase())
    if (distance < closestDistance) {
      closest = candidate
      closestDistance = distance
    }
  }
  return closest
}

function suggestion(replacement: string | undefined, span: Span) {
  return replacement === undefined
    ? {}
    : {
        suggestion: {
          message: `Replace with "${replacement}".`,
          replacement,
          span,
        },
      }
}

function kindOf(node: DirectiveNode): DirectiveKind {
  switch (node.type) {
    case 'containerDirective':
      return 'container'
    case 'leafDirective':
      return 'leaf'
    case 'textDirective':
      return 'text'
  }
}

function labelOf(node: DirectiveNode): readonly unknown[] {
  return node.type === 'textDirective' ? node.children : (node.label ?? [])
}

function contentOf(node: DirectiveNode): readonly { readonly position: Span }[] {
  if (node.type === 'containerDirective' || node.type === 'textDirective') {
    return node.children
  }
  return []
}

function validateValue(
  value: string | null,
  schema: AttributeSchema,
  trust: TrustMode,
): ResolvedAttribute | undefined {
  if (value === null) {
    return schema.type === 'boolean' ? true : undefined
  }
  switch (schema.type) {
    case 'string':
      return value
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) &&
        Number.isInteger(parsed) &&
        (schema.min === undefined || parsed >= schema.min) &&
        (schema.max === undefined || parsed <= schema.max)
        ? parsed
        : undefined
    }
    case 'boolean':
      return value === 'true' ? true : value === 'false' ? false : undefined
    case 'enum':
      return schema.values?.includes(value) === true ? value : undefined
    case 'identifier':
      return IDENTIFIER.test(value) ? value : undefined
    case 'url':
      return trust === 'app' || isAllowedDocumentUrl(value) ? value : undefined
  }
}

function invalidValueMessage(name: string, value: string | null, schema: AttributeSchema): string {
  const shown = value === null ? 'bare' : `"${value}"`
  if (schema.type === 'number') {
    const bounds = [
      ...(schema.min === undefined ? [] : [`at least ${schema.min}`]),
      ...(schema.max === undefined ? [] : [`at most ${schema.max}`]),
    ].join(' and ')
    return `Attribute "${name}" must be a finite integer${bounds === '' ? '' : ` ${bounds}`}; received ${shown}.`
  }
  if (schema.type === 'boolean') {
    return `Attribute "${name}" must be true, false, or bare; received ${shown}.`
  }
  if (schema.type === 'identifier') {
    return `Attribute "${name}" must be an identifier beginning with a letter; received ${shown}.`
  }
  if (schema.type === 'url') {
    return `Attribute "${name}" uses a URL scheme that is not allowed in document mode.`
  }
  return `Attribute "${name}" must be a ${schema.type} value; received ${shown}.`
}

function validateClass(attribute: Attribute, diagnostics: Diagnostic[]): string | undefined {
  if (attribute.value !== null && CLASS_NAMES.test(attribute.value)) {
    return attribute.value
  }
  diagnostics.push(
    createDiagnostic({
      code: 'HMX2005',
      severity: 'error',
      message:
        'Attribute "class" may contain only letters, numbers, spaces, underscores, and hyphens.',
      span: attribute.valueSpan ?? attribute.nameSpan,
    }),
  )
  return undefined
}

/** Validates one known directive without exposing raw attribute strings to its renderer. */
export function validateComponent(
  node: DirectiveNode,
  schema: ComponentSchema,
  renderer: ComponentRenderer,
  trust: TrustMode,
  diagnostics: Diagnostic[],
): AnalyzedComponent {
  const resolved = Object.create(null) as Record<string, ResolvedAttribute>
  const declaredNames = Object.keys(schema.attributes)
  const knownNames = [...declaredNames, ...Object.keys(universalAttributes)]
  const occurrences = new Map<string, Attribute[]>()

  for (const attribute of node.attributes) {
    const attributes = occurrences.get(attribute.name) ?? []
    attributes.push(attribute)
    occurrences.set(attribute.name, attributes)
    if (
      !Object.hasOwn(schema.attributes, attribute.name) &&
      !Object.hasOwn(universalAttributes, attribute.name)
    ) {
      const replacement = nearestSuggestion(attribute.name, knownNames)
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2001',
          severity: 'warning',
          message: `Unknown attribute "${attribute.name}" on component "${schema.name}".`,
          span: attribute.nameSpan,
          ...suggestion(replacement, attribute.nameSpan),
        }),
      )
    }
  }

  const idAttributes = occurrences.get('id') ?? []
  for (const duplicate of idAttributes.slice(1)) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2010',
        severity: 'warning',
        message: 'More than one id was supplied; the last value wins.',
        span: duplicate.nameSpan,
      }),
    )
  }

  const classAttributes = occurrences.get('class') ?? []
  const classes = classAttributes
    .map((attribute) => validateClass(attribute, diagnostics))
    .filter((value): value is string => value !== undefined && value.length > 0)
  if (classes.length > 0) {
    resolved.class = classes.join(' ')
  }

  for (const [name, attributeSchema] of Object.entries({
    ...schema.attributes,
    id: universalAttributes.id,
    title: universalAttributes.title,
  })) {
    if (attributeSchema === undefined) {
      continue
    }
    const attributes = occurrences.get(name) ?? []
    if (attributes.length === 0) {
      if (attributeSchema.default !== undefined) {
        const defaultValue = validateValue(attributeSchema.default, attributeSchema, trust)
        if (defaultValue !== undefined) {
          resolved[name] = defaultValue
        }
      } else if (attributeSchema.required === true) {
        diagnostics.push(
          createDiagnostic({
            code: 'HMX2003',
            severity: 'error',
            message: `Required attribute "${name}" is missing. ${attributeSchema.description}`,
            span: node.position,
          }),
        )
      }
      continue
    }

    for (const [index, attribute] of attributes.entries()) {
      const value = validateValue(attribute.value, attributeSchema, trust)
      if (value === undefined) {
        const span = attribute.valueSpan ?? attribute.nameSpan
        if (attributeSchema.type === 'enum') {
          const values = attributeSchema.values ?? []
          const replacement =
            attribute.value === null ? undefined : nearestSuggestion(attribute.value, values)
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2004',
              severity: 'error',
              message: `Attribute "${name}" must be one of: ${values.join(', ')}.`,
              span,
              ...suggestion(replacement, span),
            }),
          )
        } else {
          diagnostics.push(
            createDiagnostic({
              code: 'HMX2005',
              severity: 'error',
              message: invalidValueMessage(name, attribute.value, attributeSchema),
              span,
            }),
          )
        }
      } else if (index === attributes.length - 1) {
        resolved[name] = value
      }
    }
  }

  const kind = kindOf(node)
  const kindAllowed = schema.kinds.includes(kind)
  if (!kindAllowed) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2008',
        severity: 'error',
        message: `Component "${schema.name}" cannot be written as a ${kind} directive.`,
        span: node.position,
      }),
    )
  }

  const content = contentOf(node)
  if (
    (schema.children === 'none' && content.length > 0) ||
    (schema.children === 'phrasing' && node.type === 'containerDirective' && content.length > 0)
  ) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2006',
        severity: 'warning',
        message: `Component "${schema.name}" does not permit this content.`,
        span: content[0]?.position ?? node.position,
      }),
    )
  }

  const label = labelOf(node)
  const hasLabel = label.length > 0
  if ((schema.label === 'required' && !hasLabel) || (schema.label === 'forbidden' && hasLabel)) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2007',
        severity: 'error',
        message:
          schema.label === 'required'
            ? `Component "${schema.name}" requires a label.`
            : `Component "${schema.name}" does not permit a label.`,
        span:
          hasLabel &&
          label[0] !== undefined &&
          typeof label[0] === 'object' &&
          label[0] !== null &&
          'position' in label[0]
            ? (label[0] as { readonly position: Span }).position
            : node.position,
      }),
    )
  }

  return { schema, renderer, attributes: resolved, kindAllowed }
}
