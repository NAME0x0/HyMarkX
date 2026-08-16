import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Diagnostic, LeafDirective, Point, Root, Span, Yaml } from '@hymarkx/ast'
import { parse } from '@hymarkx/parser'
import { setDiagnosticOrigin } from '../diagnostic-origin.js'
import { compileFrontmatter } from '../frontmatter.js'
import type { CompileOptions, FrontmatterValue } from '../types.js'
import { componentHtmlDiagnostics, isAllowedDocumentUrl } from '../emit/sanitize.js'
import { builtinComponents } from './builtins.js'
import type {
  AttributeSchema,
  AttributeType,
  ComponentRegistry,
  ComponentRenderer,
} from './types.js'

/** Source input for one HMX-authored component. */
export interface AuthoredComponent {
  /** Registered name, normally the case-sensitive file basename. */
  readonly name: string
  /** Complete HMX component document source. */
  readonly source: string
  /** Path displayed for diagnostics raised inside the component. */
  readonly from?: string
}

/** Parsed compiler-only template associated with an authored component renderer. */
export interface AuthoredComponentDefinition {
  readonly name: string
  readonly source: string
  readonly root: Root
  readonly childrenMarkers: readonly LeafDirective[]
  readonly from?: string
}

/** Result of compiling authored component sources into a normal component registry. */
export interface CompileComponentsResult {
  readonly registry: ComponentRegistry
  readonly diagnostics: readonly Diagnostic[]
}

const ATTRIBUTE_TYPES = new Set<AttributeType>([
  'string',
  'number',
  'boolean',
  'enum',
  'url',
  'identifier',
])
const SCHEMA_KEYS = new Set(['type', 'values', 'required', 'default', 'min', 'max', 'description'])
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/
const authoredRenderers = new WeakMap<ComponentRenderer, AuthoredComponentDefinition>()

function isMapping(value: unknown): value is FrontmatterValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function componentPath(component: AuthoredComponent): string {
  return component.from ?? `${component.name}.hmx`
}

function componentDiagnostic(
  component: AuthoredComponent,
  span: Span,
  code: 'HMX2050' | 'HMX2051' | 'HMX2053' | 'HMX2057',
  severity: Diagnostic['severity'],
  message: string,
): Diagnostic {
  const diagnostic = createDiagnostic({ code, severity, message, span })
  setDiagnosticOrigin(diagnostic, component.source, component.from)
  return diagnostic
}

function authoredDescription(component: AuthoredComponent, propName: string): string {
  return `Property "${propName}" accepted by authored component "${component.name}".`
}

function scalarDefault(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined
}

function validDefault(
  value: string,
  schema: Omit<AttributeSchema, 'default'>,
  trust: CompileOptions['trust'],
): boolean {
  switch (schema.type) {
    case 'string':
      return true
    case 'number': {
      const parsed = Number(value)
      return (
        Number.isFinite(parsed) &&
        Number.isInteger(parsed) &&
        (schema.min === undefined || parsed >= schema.min) &&
        (schema.max === undefined || parsed <= schema.max)
      )
    }
    case 'boolean':
      return value === 'true' || value === 'false'
    case 'enum':
      return schema.values?.includes(value) === true
    case 'identifier':
      return IDENTIFIER.test(value)
    case 'url':
      return trust === 'app' || isAllowedDocumentUrl(value)
  }
}

function propSchema(
  component: AuthoredComponent,
  propName: string,
  value: unknown,
  span: Span,
  trust: CompileOptions['trust'],
  diagnostics: Diagnostic[],
): AttributeSchema | undefined {
  if (!isMapping(value)) {
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: schema for "${propName}" must be a mapping.`,
      ),
    )
    return undefined
  }

  let malformed = false
  for (const key of Object.keys(value)) {
    if (!SCHEMA_KEYS.has(key)) {
      malformed = true
      diagnostics.push(
        componentDiagnostic(
          component,
          span,
          'HMX2051',
          'error',
          `Malformed props in ${componentPath(component)}: unknown schema key "${key}" on "${propName}".`,
        ),
      )
    }
  }

  const typeValue = value.type
  if (typeof typeValue !== 'string' || !ATTRIBUTE_TYPES.has(typeValue as AttributeType)) {
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: "${propName}" has an invalid type.`,
      ),
    )
    return undefined
  }
  const type = typeValue as AttributeType

  let values: readonly string[] | undefined
  if (value.values !== undefined) {
    if (!Array.isArray(value.values) || !value.values.every((item) => typeof item === 'string')) {
      malformed = true
      diagnostics.push(
        componentDiagnostic(
          component,
          span,
          'HMX2051',
          'error',
          `Malformed props in ${componentPath(component)}: "values" on "${propName}" must contain only strings.`,
        ),
      )
    } else {
      values = value.values
    }
  }
  if (type === 'enum' && (values === undefined || values.length === 0)) {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: enum prop "${propName}" requires values.`,
      ),
    )
  } else if (type !== 'enum' && values !== undefined) {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: "values" is only valid for enum props.`,
      ),
    )
  }

  const required = value.required
  if (required !== undefined && typeof required !== 'boolean') {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: "required" on "${propName}" must be boolean.`,
      ),
    )
  }
  const min = value.min
  const max = value.max
  if (
    (min !== undefined && (typeof min !== 'number' || !Number.isFinite(min))) ||
    (max !== undefined && (typeof max !== 'number' || !Number.isFinite(max))) ||
    ((min !== undefined || max !== undefined) && type !== 'number') ||
    (typeof min === 'number' && typeof max === 'number' && min > max)
  ) {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: numeric bounds on "${propName}" are invalid.`,
      ),
    )
  }
  const description = value.description
  if (description !== undefined && typeof description !== 'string') {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: "description" on "${propName}" must be a string.`,
      ),
    )
  }

  const schemaWithoutDefault: Omit<AttributeSchema, 'default'> = {
    type,
    ...(values === undefined ? {} : { values }),
    ...(typeof required === 'boolean' ? { required } : {}),
    ...(typeof min === 'number' && type === 'number' ? { min } : {}),
    ...(typeof max === 'number' && type === 'number' ? { max } : {}),
    description:
      typeof description === 'string' ? description : authoredDescription(component, propName),
  }
  const defaultValue = value.default === undefined ? undefined : scalarDefault(value.default)
  if (
    value.default !== undefined &&
    (defaultValue === undefined || !validDefault(defaultValue, schemaWithoutDefault, trust))
  ) {
    malformed = true
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: default for "${propName}" does not satisfy its schema.`,
      ),
    )
  }

  return malformed
    ? undefined
    : {
        ...schemaWithoutDefault,
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
      }
}

function propsFromFrontmatter(
  component: AuthoredComponent,
  value: FrontmatterValue | undefined,
  span: Span,
  trust: CompileOptions['trust'],
  diagnostics: Diagnostic[],
): Readonly<Record<string, AttributeSchema>> {
  const props = value?.props
  if (props === undefined) {
    return {}
  }
  if (!isMapping(props)) {
    diagnostics.push(
      componentDiagnostic(
        component,
        span,
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: "props" must be a mapping.`,
      ),
    )
    return {}
  }

  const attributes = Object.create(null) as Record<string, AttributeSchema>
  for (const [name, schemaValue] of Object.entries(props)) {
    const schema = propSchema(component, name, schemaValue, span, trust, diagnostics)
    if (schema !== undefined) {
      attributes[name] = schema
    }
  }
  return attributes
}

function childrenMarkers(root: Root): readonly LeafDirective[] {
  const markers: LeafDirective[] = []
  visit(root, (node) => {
    if (node.type === 'leafDirective' && node.name === 'children') {
      markers.push(node)
    }
  })
  return markers
}

function componentRawHtmlDiagnostics(
  root: Root,
  component: AuthoredComponent,
  source: string,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  visit(root, (node) => {
    if (node.type !== 'html') {
      return
    }
    const styleOpening = /^<style[ \t]+scoped[ \t]*>/i.exec(node.value)
    const styleClosing = node.value.toLowerCase().lastIndexOf('</style>')
    if (
      styleOpening !== null &&
      styleClosing >= styleOpening[0].length &&
      node.value.slice(styleClosing + 8).trim() === ''
    ) {
      if (/<\s*script\b/i.test(node.value.slice(styleOpening[0].length, styleClosing))) {
        const diagnostic = createDiagnostic({
          code: 'HMX3001',
          severity: 'error',
          message: 'Authored component styles cannot contain script markup.',
          span: node.position,
        })
        setDiagnosticOrigin(diagnostic, source, component.from)
        diagnostics.push(diagnostic)
      }
      return
    }
    for (const diagnostic of componentHtmlDiagnostics(node.value, node.position)) {
      setDiagnosticOrigin(diagnostic, source, component.from)
      diagnostics.push(diagnostic)
    }
  })
  return diagnostics
}

function frontmatterNode(root: Root): Yaml | undefined {
  const node = root.children[0]
  return node?.type === 'yaml' ? node : undefined
}

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

function frontmatterValueSpan(node: Yaml, source: string): Span {
  const openingLineEnd = source.indexOf('\n', node.position.start.offset)
  const start = openingLineEnd === -1 ? node.position.start.offset : openingLineEnd + 1
  const end = Math.min(start + node.value.length, source.length)
  return { start: pointAt(source, start), end: pointAt(source, end) }
}

function parsedComponent(
  component: AuthoredComponent,
  options: CompileOptions,
  diagnostics: Diagnostic[],
): {
  readonly definition: AuthoredComponentDefinition
  readonly attributes: Readonly<Record<string, AttributeSchema>>
} {
  const parseOptions = {
    ...(component.from === undefined ? {} : { from: component.from }),
    ...(options.gfm === undefined ? {} : { gfm: options.gfm }),
  }
  let parsed = parse(component.source, parseOptions)
  for (const diagnostic of parsed.diagnostics) {
    setDiagnosticOrigin(diagnostic, parsed.source, component.from)
  }
  diagnostics.push(...parsed.diagnostics)

  const frontmatter = compileFrontmatter(parsed.root, parsed.source)
  const yaml = frontmatterNode(parsed.root)
  let value = frontmatter.value
  if (!frontmatter.recognized && yaml !== undefined && yaml.value.trim() !== '') {
    diagnostics.push(
      componentDiagnostic(
        { ...component, source: parsed.source },
        frontmatterValueSpan(yaml, parsed.source),
        'HMX2051',
        'error',
        `Malformed props in ${componentPath(component)}: component frontmatter must be a mapping.`,
      ),
    )
    value = undefined
  } else if (!frontmatter.recognized) {
    parsed = parse(component.source, { ...parseOptions, frontmatter: false })
    for (const diagnostic of parsed.diagnostics) {
      setDiagnosticOrigin(diagnostic, parsed.source, component.from)
    }
    diagnostics.push(...parsed.diagnostics)
  } else {
    for (const diagnostic of frontmatter.diagnostics) {
      setDiagnosticOrigin(diagnostic, parsed.source, component.from)
      diagnostics.push(diagnostic)
    }
  }

  const span = yaml === undefined ? parsed.root.position : frontmatterValueSpan(yaml, parsed.source)
  const normalizedComponent = { ...component, source: parsed.source }
  const attributes = propsFromFrontmatter(
    normalizedComponent,
    value,
    span,
    options.trust,
    diagnostics,
  )
  const markers = childrenMarkers(parsed.root)
  diagnostics.push(...componentRawHtmlDiagnostics(parsed.root, component, parsed.source))
  for (const duplicate of markers.slice(1)) {
    diagnostics.push(
      componentDiagnostic(
        normalizedComponent,
        duplicate.position,
        'HMX2053',
        'error',
        `Authored component "${component.name}" contains more than one ::children directive.`,
      ),
    )
  }
  return {
    definition: {
      name: component.name,
      source: parsed.source,
      root: parsed.root,
      childrenMarkers: markers,
      ...(component.from === undefined ? {} : { from: component.from }),
    },
    attributes,
  }
}

/** Returns authored template metadata for a renderer created by {@link compileComponents}. */
export function authoredComponentFor(
  renderer: ComponentRenderer,
): AuthoredComponentDefinition | undefined {
  return authoredRenderers.get(renderer)
}

/** Parses HMX component sources and registers their schemas and compile-time templates. */
export function compileComponents(
  sources: readonly AuthoredComponent[],
  options: CompileOptions = {},
): CompileComponentsResult {
  const schemas: Record<string, ComponentRegistry['schemas'][string]> = Object.create(null)
  const renderers: Record<string, ComponentRenderer> = Object.create(null)
  const diagnostics: Diagnostic[] = []

  for (const component of sources) {
    const parsed = parsedComponent(component, options, diagnostics)
    if (Object.hasOwn(schemas, component.name)) {
      diagnostics.push(
        componentDiagnostic(
          { ...component, source: parsed.definition.source },
          parsed.definition.root.position,
          'HMX2057',
          'error',
          `Authored component "${component.name}" is registered more than once.`,
        ),
      )
      continue
    }
    if (Object.hasOwn(builtinComponents.schemas, component.name)) {
      diagnostics.push(
        componentDiagnostic(
          { ...component, source: parsed.definition.source },
          parsed.definition.root.position,
          'HMX2050',
          'warning',
          `Authored component "${component.name}" shadows built-in component "${component.name}".`,
        ),
      )
    }

    const renderer: ComponentRenderer = () => ({ wrappers: [] })
    authoredRenderers.set(renderer, parsed.definition)
    schemas[component.name] = {
      name: component.name,
      kinds: ['container'],
      attributes: parsed.attributes,
      children: 'block',
      label: 'forbidden',
      description: `HMX-authored component "${component.name}".`,
    }
    renderers[component.name] = renderer
  }

  return { registry: { schemas, renderers }, diagnostics }
}
