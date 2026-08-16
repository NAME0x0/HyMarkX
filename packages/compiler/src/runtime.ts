import type { Interpolation } from '@hymarkx/ast'
import type {
  AnalyzedDocument,
  AnalyzedEvent,
  ReactiveAttribute,
  ReactiveExpression,
} from './analyze/index.js'
import type { DirectiveNode } from './components/types.js'
import type { ExpressionInstruction } from './expression.js'

/** DOM markers and JavaScript produced for one analyzed document tree. */
export interface InteractivityPlan {
  readonly js: string
  readonly textMarkers: ReadonlyMap<AnalyzedDocument, ReadonlyMap<Interpolation, string>>
  readonly attributeMarkers: ReadonlyMap<AnalyzedDocument, ReadonlyMap<DirectiveNode, string>>
  readonly eventMarkers: ReadonlyMap<AnalyzedDocument, ReadonlyMap<DirectiveNode, string>>
  readonly inputValues: ReadonlyMap<AnalyzedDocument, ReadonlyMap<DirectiveNode, string>>
}

type ViewConfig =
  | readonly ['t', string, ExpressionInstruction]
  | readonly ['a', string, string, ExpressionInstruction]
  | readonly ['a', string, string, 1, ExpressionInstruction]

type InputBinding = readonly [string, 's' | 'n' | 'b' | 'l']
type HandlerConfig = readonly [string, string, ExpressionInstruction, InputBinding?]

interface ScopeConfig {
  readonly s: Readonly<Record<string, string | number | boolean | null>>
  readonly d?: Readonly<Record<string, readonly number[]>>
  readonly h: readonly HandlerConfig[]
}

interface PropBinding {
  readonly context: DocumentContext
  readonly expression: ReactiveExpression
}

interface DocumentContext {
  readonly document: AnalyzedDocument
  readonly props: ReadonlyMap<string, PropBinding>
}

interface ResolvedExpression {
  readonly instruction: ExpressionInstruction
  readonly dependencies: readonly (readonly [number, string])[]
}

interface RuntimeFeatures {
  readonly nodes: Set<ExpressionInstruction[0]>
  readonly unary: Set<string>
  readonly binary: Set<string>
  readonly assignment: Set<string>
  hasText: boolean
  hasAttributes: boolean
  hasInput: boolean
  hasSubmit: boolean
  hasUrl: boolean
}

function documentContexts(root: AnalyzedDocument): readonly DocumentContext[] {
  const rootContext: DocumentContext = { document: root, props: new Map() }
  const output: DocumentContext[] = []
  const stack = [rootContext]
  while (stack.length > 0) {
    const context = stack.pop()
    if (context === undefined) continue
    output.push(context)
    const expansions = [...context.document.expansions.values()]
    for (let index = expansions.length - 1; index >= 0; index -= 1) {
      const expansion = expansions[index]
      if (expansion === undefined) continue
      const props = new Map<string, PropBinding>()
      for (const [name, expression] of expansion.propBindings) {
        props.set(name, { context, expression })
      }
      stack.push({ document: expansion.document, props })
    }
  }
  return output
}

function stateType(value: string | number | boolean | null): InputBinding[1] {
  if (value === null) return 'l'
  if (typeof value === 'number') return 'n'
  if (typeof value === 'boolean') return 'b'
  return 's'
}

function mutableNames(events: ReadonlyMap<DirectiveNode, readonly AnalyzedEvent[]>): Set<string> {
  const names = new Set<string>()
  for (const handlers of events.values()) {
    for (const handler of handlers) {
      for (const name of handler.assignments) names.add(name)
      if (handler.inputState !== undefined) names.add(handler.inputState)
    }
  }
  return names
}

function valueInstruction(value: unknown): ExpressionInstruction {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return ['l', value]
  }
  if (Array.isArray(value)) return ['r', value.map(valueInstruction)]
  if (typeof value === 'object') {
    return ['o', Object.entries(value).map(([name, item]) => [name, valueInstruction(item)])]
  }
  return ['l', null]
}

function resolveExpression(
  expression: ExpressionInstruction,
  context: DocumentContext,
  scopeIndexes: ReadonlyMap<AnalyzedDocument, number>,
  mutable: ReadonlyMap<AnalyzedDocument, ReadonlySet<string>>,
): ResolvedExpression {
  if (expression[0] === 'l') return { instruction: expression, dependencies: [] }
  if (expression[0] === 'i') {
    if (expression.length === 3) {
      return {
        instruction: expression,
        dependencies: [[expression[1], expression[2]]],
      }
    }
    const name = expression[1]
    if (Object.hasOwn(context.document.reactivity.state, name)) {
      const index = scopeIndexes.get(context.document)
      if (index !== undefined && mutable.get(context.document)?.has(name) === true) {
        return { instruction: ['i', index, name], dependencies: [[index, name]] }
      }
      return {
        instruction: valueInstruction(context.document.reactivity.state[name]),
        dependencies: [],
      }
    }
    const prop = context.props.get(name)
    if (prop !== undefined) {
      return resolveExpression(prop.expression.instruction, prop.context, scopeIndexes, mutable)
    }
    return {
      instruction: valueInstruction(context.document.reactivity.scope[name]),
      dependencies: [],
    }
  }

  const resolve = (child: ExpressionInstruction): ResolvedExpression =>
    resolveExpression(child, context, scopeIndexes, mutable)
  const combine = (
    instruction: ExpressionInstruction,
    children: readonly ResolvedExpression[],
  ): ResolvedExpression => ({
    instruction,
    dependencies: children.flatMap(({ dependencies }) => dependencies),
  })

  if (expression[0] === 'u') {
    const child = resolve(expression[2])
    return combine(['u', expression[1], child.instruction], [child])
  }
  if (expression[0] === 'b') {
    const left = resolve(expression[2])
    const right = resolve(expression[3])
    return combine(['b', expression[1], left.instruction, right.instruction], [left, right])
  }
  if (expression[0] === 'c') {
    const test = resolve(expression[1])
    const consequent = resolve(expression[2])
    const alternate = resolve(expression[3])
    return combine(
      ['c', test.instruction, consequent.instruction, alternate.instruction],
      [test, consequent, alternate],
    )
  }
  if (expression[0] === 'm') {
    const object = resolve(expression[1])
    const property =
      expression[3] === 1 ? resolve(expression[2] as ExpressionInstruction) : undefined
    return combine(
      [
        'm',
        object.instruction,
        property?.instruction ?? expression[2],
        expression[3],
        expression[4],
      ],
      property === undefined ? [object] : [object, property],
    )
  }
  if (expression[0] === 'r') {
    const elements = expression[1].map(resolve)
    return combine(['r', elements.map(({ instruction }) => instruction)], elements)
  }
  if (expression[0] === 'o') {
    const properties = expression[1].map(([name, value]) => [name, resolve(value)] as const)
    return combine(
      ['o', properties.map(([name, value]) => [name, value.instruction])],
      properties.map(([, value]) => value),
    )
  }
  const value = resolve(expression[3])
  return combine(['a', expression[1], expression[2], value.instruction], [value])
}

function addDependencies(
  scopes: readonly { readonly dependencies: Map<string, number[]> }[],
  dependencies: readonly (readonly [number, string])[],
  viewIndex: number,
): void {
  for (const [scope, name] of new Map(
    dependencies.map((item) => [`${item[0]}:${item[1]}`, item]),
  ).values()) {
    const indexes = scopes[scope]?.dependencies.get(name) ?? []
    indexes.push(viewIndex)
    scopes[scope]?.dependencies.set(name, indexes)
  }
}

function reactiveAttributes(
  document: AnalyzedDocument,
  node: DirectiveNode,
  events: readonly AnalyzedEvent[],
): readonly ReactiveAttribute[] {
  const attributes = [...(document.reactivity.attributes.get(node) ?? [])]
  for (const event of events) {
    const name = event.inputState
    if (name === undefined || attributes.some((attribute) => attribute.name === 'value')) continue
    attributes.push({
      name: 'value',
      expression: { instruction: ['i', name], identifiers: [name], stateNames: [name] },
      url: false,
    })
  }
  return attributes
}

function expressionValue(value: unknown): ReactiveExpression {
  return {
    instruction: valueInstruction(value),
    identifiers: [],
    stateNames: [],
  }
}

function concatenateExpressions(expressions: readonly ReactiveExpression[]): ReactiveExpression {
  const [first, ...rest] = expressions
  const initial = first ?? expressionValue('')
  return {
    instruction: rest.reduce<ExpressionInstruction>(
      (left, right) => ['b', '+', left, right.instruction],
      initial.instruction,
    ),
    identifiers: [...new Set(expressions.flatMap(({ identifiers }) => identifiers))],
    stateNames: [...new Set(expressions.flatMap(({ stateNames }) => stateNames))],
  }
}

function emittedReactiveAttributes(
  document: AnalyzedDocument,
  node: DirectiveNode,
  events: readonly AnalyzedEvent[],
): readonly ReactiveAttribute[] {
  const source = reactiveAttributes(document, node, events)
  const component = document.components.get(node)
  if (component === undefined) return source

  const plan = component.renderer(node, component.attributes)
  const outer = plan.wrappers[0]
  const byName = new Map(source.map((attribute) => [attribute.name, attribute]))
  const boundNames = new Set<string>()
  const output: ReactiveAttribute[] = []

  for (const binding of plan.attributeBindings ?? []) {
    const references = binding.segments.filter(
      (segment): segment is { readonly attribute: string } => typeof segment !== 'string',
    )
    const reactive = references.flatMap(({ attribute }) => {
      const value = byName.get(attribute)
      return value === undefined ? [] : [value]
    })
    if (reactive.length === 0) continue
    for (const { attribute } of references) boundNames.add(attribute)
    output.push({
      name: binding.name,
      expression: concatenateExpressions(
        binding.segments.map((segment) =>
          typeof segment === 'string'
            ? expressionValue(segment)
            : (byName.get(segment.attribute)?.expression ??
              expressionValue(component.attributes[segment.attribute])),
        ),
      ),
      url: reactive.some(({ url }) => url),
    })
  }

  for (const attribute of source) {
    if (boundNames.has(attribute.name)) continue
    if (
      attribute.name === 'id' ||
      attribute.name === 'class' ||
      attribute.name === 'title' ||
      (outer !== undefined && Object.hasOwn(outer.attributes, attribute.name))
    ) {
      output.push(attribute)
    }
  }
  return output
}

function addInstructionFeatures(
  instruction: ExpressionInstruction,
  features: RuntimeFeatures,
): void {
  const stack = [instruction]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) continue
    features.nodes.add(node[0])
    if (node[0] === 'u') {
      features.unary.add(node[1])
      stack.push(node[2])
    } else if (node[0] === 'b') {
      features.binary.add(node[1])
      stack.push(node[2], node[3])
    } else if (node[0] === 'c') {
      stack.push(node[1], node[2], node[3])
    } else if (node[0] === 'm') {
      stack.push(node[1])
      if (node[3] === 1) stack.push(node[2] as ExpressionInstruction)
    } else if (node[0] === 'r') {
      stack.push(...node[1])
    } else if (node[0] === 'o') {
      stack.push(...node[1].map((entry) => entry[1]))
    } else if (node[0] === 'a') {
      features.assignment.add(node[2])
      stack.push(node[3])
    }
  }
}

function eagerOperator(operator: string): string {
  const cases: Readonly<Record<string, string>> = {
    '+': 'case"+":return l+z;',
    '-': 'case"-":return l-z;',
    '*': 'case"*":return l*z;',
    '/': 'case"/":return l/z;',
    '%': 'case"%":return l%z;',
    '==': 'case"==":return l==z;',
    '!=': 'case"!=":return l!=z;',
    '<': 'case"<":return l<z;',
    '<=': 'case"<=":return l<=z;',
    '>': 'case">":return l>z;',
    '>=': 'case">=":return l>=z;',
  }
  return cases[operator] ?? ''
}

function assignmentOperator(operator: string): string {
  const cases: Readonly<Record<string, string>> = {
    '+=': 'case"+=":x=l+x;break;',
    '-=': 'case"-=":x=l-x;break;',
    '*=': 'case"*=":x=l*x;break;',
    '/=': 'case"/=":x=l/x;break;',
    '%=': 'case"%=":x=l%x;break;',
  }
  return cases[operator] ?? ''
}

function runtime(
  config: readonly ScopeConfig[],
  views: readonly ViewConfig[],
  features: RuntimeFeatures,
): string {
  const data = JSON.stringify([config, views]).replaceAll('<', '\\u003c')
  const lines = [
    `(()=>{const[C,W]=${data},q=(k,i)=>document.querySelector('[data-hmx-'+k+'="'+i+'"]'),V=W.map(v=>[v,q(v[0],v[1])]);`,
    'function r(n,j){const s=C[j].s;switch(n[0]){',
  ]
  if (features.nodes.has('l')) lines.push('case"l":return n[1];')
  if (features.nodes.has('i')) {
    lines.push('case"i":return n.length>2?C[n[1]].s[n[2]]:s[n[1]];')
  }
  if (features.nodes.has('u')) {
    lines.push('case"u":{const x=r(n[2],j);switch(n[1]){')
    if (features.unary.has('!')) lines.push('case"!":return !x;')
    if (features.unary.has('-')) lines.push('case"-":return -x;')
    if (features.unary.has('+')) lines.push('case"+":return +x;')
    lines.push('}}')
  }
  if (features.nodes.has('b')) {
    lines.push('case"b":{')
    if (features.binary.has('&&')) {
      lines.push('if(n[1]==="&&")return r(n[2],j)&&r(n[3],j);')
    }
    if (features.binary.has('||')) {
      lines.push('if(n[1]==="||")return r(n[2],j)||r(n[3],j);')
    }
    if (features.binary.has('??')) {
      lines.push('if(n[1]==="??"){const x=r(n[2],j);return x===null?r(n[3],j):x;}')
    }
    const eager = [...features.binary].filter(
      (operator) => operator !== '&&' && operator !== '||' && operator !== '??',
    )
    if (eager.length > 0) {
      lines.push('const l=r(n[2],j),z=r(n[3],j);switch(n[1]){')
      for (const operator of eager) lines.push(eagerOperator(operator))
      lines.push('}')
    }
    lines.push('}')
  }
  if (features.nodes.has('c')) {
    lines.push('case"c":return r(n[1],j)?r(n[2],j):r(n[3],j);')
  }
  if (features.nodes.has('m')) {
    lines.push(
      'case"m":{const o=r(n[1],j);if(o===null){if(n[4])return null;throw 0}const k=n[3]?r(n[2],j):n[2];if(k==="__proto__"||k==="prototype"||k==="constructor")throw 0;if(typeof o==="string"&&k==="length")return o.length;if(!Object.hasOwn(Object(o),k)){if(n[4])return null;throw 0}return o[k]}',
    )
  }
  if (features.nodes.has('r')) lines.push('case"r":return n[1].map(x=>r(x,j));')
  if (features.nodes.has('o')) {
    lines.push(
      'case"o":{const o=Object.create(null);for(const e of n[1])o[e[0]]=r(e[1],j);return o}',
    )
  }
  if (features.nodes.has('a')) {
    lines.push('case"a":{const k=n[1],o=n[2],l=s[k];')
    if (features.assignment.has('&&=')) lines.push('if(o==="&&="&&!l)return l;')
    if (features.assignment.has('||=')) lines.push('if(o==="||="&&l)return l;')
    if (features.assignment.has('??=')) lines.push('if(o==="??="&&l!==null)return l;')
    lines.push('let x=r(n[3],j);')
    const eagerAssignments = [...features.assignment].filter((operator) =>
      ['+=', '-=', '*=', '/=', '%='].includes(operator),
    )
    if (eagerAssignments.length > 0) {
      lines.push('switch(o){')
      for (const operator of eagerAssignments) lines.push(assignmentOperator(operator))
      lines.push('}')
    }
    lines.push('return w(j,k,x)}')
  }
  lines.push('}throw 0}')
  if (features.nodes.has('a') || features.hasInput) {
    lines.push(
      'function w(j,k,x){const c=C[j],s=c.s;if((x!==null&&typeof x==="object")||(typeof x==="number"&&!Number.isFinite(x)))throw 0;if(Object.is(s[k],x))return x;s[k]=x;',
    )
    if (features.hasText || features.hasAttributes) {
      lines.push(
        'for(const i of(c.d[k]||[])){const z=V[i],v=z[0],e=z[1];if(!e)continue;const x=r(v[v.length-1],j),t=x===null?"":String(x);',
      )
      if (features.hasText)
        lines.push('if(v[0]==="t"){if(e.textContent!==t)e.textContent=t;continue}')
      if (features.hasAttributes) {
        if (features.hasUrl) {
          lines.push(
            'if(v[3]===1){const u=t.replace(/[\\0-\\x20\\x7f]/g,""),p=u.indexOf(":"),s=u.slice(0,p);if(p>0&&/^[a-z][a-z0-9+.-]*$/i.test(s)&&!/^(https?|mailto)$/i.test(s))continue}',
          )
        }
        lines.push(
          'if(v[2]==="value"&&e.value!==t)e.value=t;if(e.getAttribute(v[2])!==t)e.setAttribute(v[2],t);',
        )
      }
      lines.push('}')
    }
    lines.push('return x}')
  }
  lines.push(
    features.hasSubmit
      ? 'for(let j=0;j<C.length;j++)for(const h of C[j].h){const e=q("e",h[1]);if(!e)continue;e.addEventListener(h[0],z=>{if(h[0]==="submit")z.preventDefault();'
      : 'for(let j=0;j<C.length;j++)for(const h of C[j].h){const e=q("e",h[1]);if(!e)continue;e.addEventListener(h[0],()=>{',
  )
  if (features.hasInput) {
    lines.push(
      'if(h[3]){const k=h[3][0],t=h[3][1],x=e.value;if(t==="n"){const n=Number(x);if(Number.isFinite(n))w(j,k,n)}else if(t==="b")w(j,k,x==="true");else if(t==="l"){if(x==="null")w(j,k,null)}else w(j,k,x)}',
    )
  }
  lines.push('r(h[2],j)})}})();')
  return lines.join('')
}

/** Builds per-expansion bindings and one feature-shaped runtime for an analyzed document. */
export function prepareInteractivity(root: AnalyzedDocument): InteractivityPlan {
  const textMarkers = new Map<AnalyzedDocument, Map<Interpolation, string>>()
  const attributeMarkers = new Map<AnalyzedDocument, Map<DirectiveNode, string>>()
  const eventMarkers = new Map<AnalyzedDocument, Map<DirectiveNode, string>>()
  const inputValues = new Map<AnalyzedDocument, Map<DirectiveNode, string>>()
  const contexts = documentContexts(root)
  const mutable = new Map(
    contexts.map(({ document }) => [document, mutableNames(document.reactivity.events)]),
  )
  const interactive = contexts.filter(({ document }) => document.reactivity.events.size > 0)
  const scopeIndexes = new Map(interactive.map(({ document }, index) => [document, index]))
  const scopeBuilds = interactive.map(({ document }) => ({
    document,
    dependencies: new Map<string, number[]>(),
    handlers: [] as HandlerConfig[],
  }))
  const views: ViewConfig[] = []
  const features: RuntimeFeatures = {
    nodes: new Set(),
    unary: new Set(),
    binary: new Set(),
    assignment: new Set(),
    hasText: false,
    hasAttributes: false,
    hasInput: false,
    hasSubmit: false,
    hasUrl: false,
  }
  let textId = 0
  let attributeId = 0
  let eventId = 0

  for (const context of contexts) {
    const { document } = context
    const documentTexts = new Map<Interpolation, string>()
    const documentAttributes = new Map<DirectiveNode, string>()
    const documentEvents = new Map<DirectiveNode, string>()
    const documentInputs = new Map<DirectiveNode, string>()
    const scopeIndex = scopeIndexes.get(document)
    const handlers = scopeIndex === undefined ? undefined : scopeBuilds[scopeIndex]?.handlers

    for (const [node, expression] of document.reactivity.interpolations) {
      const resolved = resolveExpression(expression.instruction, context, scopeIndexes, mutable)
      if (resolved.dependencies.length === 0) continue
      const id = String(textId++)
      documentTexts.set(node, id)
      const index = views.length
      views.push(['t', id, resolved.instruction])
      addDependencies(scopeBuilds, resolved.dependencies, index)
      addInstructionFeatures(resolved.instruction, features)
      features.hasText = true
    }

    const attributeNodes = new Set([
      ...document.reactivity.attributes.keys(),
      ...[...document.reactivity.events].flatMap(([node, nodeEvents]) =>
        nodeEvents.some((event) => event.inputState !== undefined) ? [node] : [],
      ),
    ])
    for (const node of attributeNodes) {
      const expansion = document.expansions.get(node)
      const attributes = emittedReactiveAttributes(
        document,
        node,
        document.reactivity.events.get(node) ?? [],
      )
        .filter(
          ({ name }) =>
            expansion?.propBindings.has(name) !== true ||
            name === 'id' ||
            name === 'class' ||
            name === 'title',
        )
        .map((attribute) => ({
          attribute,
          resolved: resolveExpression(
            attribute.expression.instruction,
            context,
            scopeIndexes,
            mutable,
          ),
        }))
        .filter(({ resolved }) => resolved.dependencies.length > 0)
      if (attributes.length > 0) {
        const id = String(attributeId++)
        documentAttributes.set(node, id)
        for (const { attribute, resolved } of attributes) {
          const index = views.length
          views.push(
            attribute.url
              ? ['a', id, attribute.name, 1, resolved.instruction]
              : ['a', id, attribute.name, resolved.instruction],
          )
          addDependencies(scopeBuilds, resolved.dependencies, index)
          addInstructionFeatures(resolved.instruction, features)
          features.hasAttributes = true
          features.hasUrl ||= attribute.url
        }
      }
    }

    for (const [node, nodeHandlers] of document.reactivity.events) {
      const id = String(eventId++)
      documentEvents.set(node, id)
      for (const handler of nodeHandlers) {
        if (handler.name === 'submit') features.hasSubmit = true
        const input =
          handler.inputState === undefined
            ? undefined
            : ([
                handler.inputState,
                stateType(document.reactivity.state[handler.inputState] ?? null),
              ] as const)
        if (input !== undefined) {
          documentInputs.set(node, String(document.reactivity.state[input[0]] ?? ''))
          features.hasInput = true
        }
        handlers?.push(
          input === undefined
            ? [handler.name, id, handler.instruction]
            : [handler.name, id, handler.instruction, input],
        )
        addInstructionFeatures(handler.instruction, features)
      }
    }

    textMarkers.set(document, documentTexts)
    attributeMarkers.set(document, documentAttributes)
    eventMarkers.set(document, documentEvents)
    inputValues.set(document, documentInputs)
  }

  const scopes: ScopeConfig[] = scopeBuilds.map(({ document, dependencies, handlers }) => ({
    s: document.reactivity.state,
    ...(dependencies.size === 0 ? {} : { d: Object.fromEntries(dependencies) }),
    h: handlers,
  }))

  return {
    js: scopes.length === 0 ? '' : runtime(scopes, views, features),
    textMarkers,
    attributeMarkers,
    eventMarkers,
    inputValues,
  }
}
