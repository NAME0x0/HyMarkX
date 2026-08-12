import { getAttributeValue, visit } from '../../../packages/ast/dist/index.js'
import {
  builtinComponents,
  compile as compileHtml,
  compileAst,
} from '../../../packages/compiler/dist/index.js'
import { parse } from '../../../packages/parser/dist/index.js'
import {
  assertExpressionScope,
  expressionFeatures,
  isAllowedIdentifier,
  parseExpression,
} from './expression.mjs'
import { generateBindings, generateRuntime } from './runtime.mjs'

const NUMBER_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function fail(message) {
  throw new SyntaxError(message)
}

function stateLiteral(attribute, source) {
  if (attribute.value === null) fail(`State "${attribute.name}" requires an initial value`)
  const span = attribute.valueSpan
  const opening = span === undefined ? undefined : source[span.start.offset - 1]
  const closing = span === undefined ? undefined : source[span.end.offset]
  if ((opening === '"' || opening === "'") && closing === opening) return attribute.value
  if (attribute.value === 'true') return true
  if (attribute.value === 'false') return false
  if (NUMBER_LITERAL.test(attribute.value)) {
    const value = Number(attribute.value)
    if (!Number.isFinite(value)) fail(`State "${attribute.name}" must be a finite number`)
    return value
  }
  return attribute.value
}

function childLists(node) {
  switch (node.type) {
    case 'root':
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'table':
    case 'tableRow':
    case 'tableCell':
    case 'textDirective':
      return [node.children]
    case 'leafDirective':
      return node.label === undefined ? [] : [node.label]
    case 'containerDirective':
      return node.label === undefined ? [node.children] : [node.label, node.children]
    default:
      return []
  }
}

function removeStateDirectives(root) {
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    for (const children of childLists(node)) {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]
        if (child.type === 'leafDirective' && child.name === 'state') {
          children.splice(index, 1)
        } else {
          stack.push(child)
        }
      }
    }
  }
}

function directiveKind(node) {
  if (node.type === 'textDirective') return 'text'
  if (node.type === 'leafDirective') return 'leaf'
  return 'container'
}

function labelIdentifier(node, purpose) {
  if (
    node.type !== 'textDirective' ||
    node.children.length !== 1 ||
    node.children[0].type !== 'text'
  ) {
    fail(`${purpose} requires a single plain identifier label`)
  }
  const name = node.children[0].value.trim()
  if (!isAllowedIdentifier(name)) fail(`${purpose} label "${name}" is not a valid identifier`)
  return name
}

function addDependency(map, name, marker) {
  const markers = map.get(name) ?? []
  markers.push(marker)
  map.set(name, markers)
}

function mapRecord(map) {
  return Object.fromEntries(map.entries())
}

function syntheticText(value, position) {
  return { type: 'text', value: String(value), position, synthetic: true }
}

function makeRegistry(root, markerMaps, initialState) {
  const definitions = new Map()
  visit(root, (node) => {
    if (
      node.type !== 'textDirective' &&
      node.type !== 'leafDirective' &&
      node.type !== 'containerDirective'
    ) {
      return
    }
    if (node.name !== 'v' && !markerMaps.handlers.has(node) && !markerMaps.inputs.has(node)) {
      return
    }
    const definition = definitions.get(node.name) ?? { kinds: new Set(), attributes: new Set() }
    definition.kinds.add(directiveKind(node))
    for (const attribute of node.attributes) {
      if (attribute.name !== 'id' && attribute.name !== 'class' && attribute.name !== 'title') {
        definition.attributes.add(attribute.name)
      }
    }
    definitions.set(node.name, definition)
  })

  const schemas = {}
  const renderers = {}
  for (const [name, definition] of definitions) {
    schemas[name] = {
      name,
      kinds: [...definition.kinds],
      attributes: Object.fromEntries(
        [...definition.attributes].map((attribute) => [
          attribute,
          { type: 'string', description: 'Prototype interactivity attribute.' },
        ]),
      ),
      children: 'block',
      label: 'optional',
      description: 'Prototype-only interactive directive.',
    }
    renderers[name] = (node) => {
      const attributes = {}
      const textMarker = markerMaps.texts.get(node)
      const handlerMarker = markerMaps.handlers.get(node)
      const inputMarker = markerMaps.inputs.get(node)
      if (textMarker !== undefined) attributes['data-hmx-t'] = textMarker
      if (handlerMarker !== undefined) attributes['data-hmx-e'] = handlerMarker
      if (inputMarker !== undefined) {
        attributes['data-hmx-i'] = inputMarker.marker
        attributes.value = String(initialState[inputMarker.name])
      }
      const tag =
        node.name === 'v'
          ? 'span'
          : node.name === 'button'
            ? 'button'
            : node.name === 'input'
              ? 'input'
              : node.type === 'textDirective'
                ? 'span'
                : 'div'
      return { wrappers: [{ tag, attributes }] }
    }
  }
  return { schemas, renderers }
}

function collectState(root, source) {
  const state = Object.create(null)
  let count = 0
  visit(root, (node) => {
    if (node.type !== 'leafDirective' || node.name !== 'state') return
    count += 1
    for (const attribute of node.attributes) {
      if (!isAllowedIdentifier(attribute.name)) {
        fail(`State name "${attribute.name}" is not a valid expression identifier`)
      }
      if (Object.hasOwn(state, attribute.name)) {
        fail(`State variable "${attribute.name}" is declared more than once`)
      }
      state[attribute.name] = stateLiteral(attribute, source)
    }
  })
  return { state, directiveCount: count }
}

/** Compiles one document through the real parser and compiler with prototype AST passes. */
export function compileInteractive(source) {
  const parsed = parse(source)
  const baseline = compileHtml(source)
  let hasState = false
  visit(parsed.root, (node) => {
    if (node.type === 'leafDirective' && node.name === 'state') hasState = true
  })
  if (!hasState) {
    return {
      html: baseline.html,
      page: baseline.html,
      runtime: '',
      bindings: '',
      javascript: '',
      diagnostics: baseline.diagnostics,
      source: baseline.source,
      reactive: false,
    }
  }

  const parserError = parsed.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
  if (parserError !== undefined) fail(`Parser error ${parserError.code}: ${parserError.message}`)

  const root = structuredClone(parsed.root)
  const { state } = collectState(root, parsed.source)
  const declaredNames = new Set(Object.keys(state))
  removeStateDirectives(root)

  const textMarkers = new WeakMap()
  const handlerMarkers = new WeakMap()
  const inputMarkers = new WeakMap()
  const textDependencies = new Map()
  const inputDependencies = new Map()
  const handlers = []
  const featureSets = []
  let textMarkerCount = 0
  let inputMarkerCount = 0

  visit(root, (node) => {
    if (
      node.type === 'containerDirective' &&
      node.name === 'button' &&
      node.label === undefined &&
      node.children.length === 1 &&
      node.children[0].type === 'paragraph'
    ) {
      node.label = node.children[0].children
      node.children = []
    }

    if (node.type === 'textDirective' && node.name === 'v') {
      const name = labelIdentifier(node, ':v')
      if (!declaredNames.has(name)) fail(`Undeclared state variable "${name}" in :v binding`)
      const marker = String(textMarkerCount)
      textMarkerCount += 1
      textMarkers.set(node, marker)
      addDependency(textDependencies, name, marker)
      node.children = [syntheticText(state[name], node.position)]
    }

    if (
      node.type !== 'textDirective' &&
      node.type !== 'leafDirective' &&
      node.type !== 'containerDirective'
    ) {
      return
    }

    const click = getAttributeValue(node.attributes, 'on-click')
    if (click !== undefined) {
      if (click === null) fail(`on-click on "${node.name}" requires an expression`)
      const expression = parseExpression(click)
      assertExpressionScope(expression, declaredNames)
      const marker = String(handlers.length)
      handlerMarkers.set(node, marker)
      handlers.push([marker, expression])
      featureSets.push(expressionFeatures(expression))
    }

    const boundName = getAttributeValue(node.attributes, 'bind')
    if (boundName !== undefined) {
      if (node.name !== 'input') fail('The prototype only supports bind on an input directive')
      if (boundName === null || !isAllowedIdentifier(boundName)) {
        fail('Input bind requires a state identifier')
      }
      if (!declaredNames.has(boundName)) {
        fail(`Undeclared state variable "${boundName}" in input binding`)
      }
      const marker = String(inputMarkerCount)
      inputMarkerCount += 1
      inputMarkers.set(node, { marker, name: boundName })
      addDependency(inputDependencies, boundName, marker)
    }
  })

  const markerMaps = { texts: textMarkers, handlers: handlerMarkers, inputs: inputMarkers }
  const components = makeRegistry(root, markerMaps, state)
  const compiled = compileAst(root, parsed.source, { components })
  const initialState = { ...state }
  const config = { state: initialState }
  if (textDependencies.size > 0) config.texts = mapRecord(textDependencies)
  if (inputDependencies.size > 0) config.inputs = mapRecord(inputDependencies)
  if (handlers.length > 0) config.handlers = handlers

  const runtime = generateRuntime({
    hasTextBindings: textDependencies.size > 0,
    hasInputBindings: inputDependencies.size > 0,
    expressionFeatureSets: featureSets,
  })
  const bindings = generateBindings(config)
  const javascript = runtime + bindings
  const page = `${compiled.html}<script>${javascript}</script>\n`
  return {
    html: compiled.html,
    page,
    runtime,
    bindings,
    javascript,
    diagnostics: [...parsed.diagnostics, ...compiled.diagnostics],
    source: parsed.source,
    reactive: true,
    dependencies: {
      texts: mapRecord(textDependencies),
      inputs: mapRecord(inputDependencies),
    },
  }
}

export { builtinComponents }
