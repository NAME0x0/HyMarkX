import { createDiagnostic, isForbiddenAttributeName } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Span } from '@hymarkx/ast'
import type { CompileContext, Extension, Handle, Token } from 'mdast-util-from-markdown'
import { directive } from 'micromark-extension-directive'
import { decodeString } from 'micromark-util-decode-string'
import type { Construct, Effects, State } from 'micromark-util-types'
import { directiveAttributes, directiveAttributeTokenTypes } from './directive-attributes.js'
import { SourcePositions } from './positions.js'

type MdastCompatibleNode = Parameters<CompileContext['enter']>[0]
type DirectiveType = 'containerDirective' | 'leafDirective' | 'textDirective'

interface DirectiveDraft {
  type: DirectiveType
  name: string
  attributes: Attribute[]
  children: MdastCompatibleNode[]
  label?: MdastCompatibleNode[]
}

interface LabelDraft {
  type: 'paragraph'
  children: MdastCompatibleNode[]
}

interface PendingAttribute {
  name?: string
  value?: string
  nameSpan?: Span
  valueSpan?: Span
  hasInitializer: boolean
  quoted: boolean
}

interface AttributeCapture {
  readonly attributes: Attribute[]
  current?: PendingAttribute
}

interface ContainerCapture {
  fenceCount: number
  openingSequence?: Span
}

const directiveNameToken = /^directive(?:Container|Leaf|Text)Name$/
const directiveNamePrefixToken = /^directive(?:ContainerSequence|LeafSequence|TextMarker)$/

function guardDirectiveName(construct: Construct, type: DirectiveType): Construct {
  const expressionAttributes = directiveAttributes(
    directiveAttributeTokenTypes(type),
    type !== 'textDirective',
  )
  return {
    ...construct,
    tokenize(effects, ok, nok) {
      let inDirectiveName = false
      let beforeDirectiveName = false
      const guardedEffects: Effects = {
        ...effects,
        attempt(candidate, attemptOk, attemptNok) {
          const original = effects.attempt(candidate, attemptOk, attemptNok)
          return (code) =>
            code === 123
              ? effects.attempt(expressionAttributes, attemptOk, attemptNok)(code)
              : original(code)
        },
        enter(type, fields) {
          if (directiveNameToken.test(type)) {
            inDirectiveName = true
            beforeDirectiveName = false
          }
          return effects.enter(type, fields)
        },
        exit(type) {
          const token = effects.exit(type)
          if (directiveNameToken.test(type)) {
            inDirectiveName = false
          } else if (directiveNamePrefixToken.test(type)) {
            beforeDirectiveName = true
          }
          return token
        },
      }

      const guardState = (state: State): State =>
        function (code) {
          if (
            (beforeDirectiveName || inDirectiveName) &&
            code !== null &&
            code > 127 &&
            !/[\p{P}\p{Z}\s]/u.test(String.fromCodePoint(code))
          ) {
            return nok(code)
          }
          const next = state(code)
          return next === undefined ? undefined : guardState(next)
        }

      return guardState(construct.tokenize.call(this, guardedEffects, ok, nok))
    },
  }
}

/** Creates the upstream directive tokenizer with CommonMark angle-bracket precedence. */
export function directiveTokenizer(): ReturnType<typeof directive> {
  const extension = directive()
  const textColon = extension.text?.[58]
  const flowColon = extension.flow?.[58]
  if (
    textColon === undefined ||
    Array.isArray(textColon) ||
    flowColon === undefined ||
    !Array.isArray(flowColon)
  ) {
    throw new TypeError('Unexpected micromark directive text tokenizer shape')
  }

  const guardedTextColon = guardDirectiveName(textColon, 'textDirective')

  return {
    ...extension,
    flow: {
      ...extension.flow,
      58: flowColon.map((construct, index) =>
        guardDirectiveName(construct, index === 0 ? 'containerDirective' : 'leafDirective'),
      ),
    },
    text: {
      ...extension.text,
      58: {
        ...guardedTextColon,
        previous(code) {
          if (guardedTextColon.previous?.call(this, code) === false) {
            return false
          }

          const now = this.now()
          let cursor = now.offset
          let prefix = ''
          for (let index = this.events.length - 1; index >= 0; index -= 1) {
            const event = this.events[index]
            if (event?.[0] !== 'enter') {
              continue
            }
            const end = event[1].end?.offset ?? now.offset
            if (end < cursor) {
              break
            }
            if (end !== cursor) {
              continue
            }
            prefix =
              this.sliceSerialize({ start: event[1].start, end: event[1].end ?? now }) + prefix
            cursor = event[1].start.offset
            if (event[1].start.line < now.line) {
              break
            }
          }
          prefix = prefix.slice(prefix.lastIndexOf('\n') + 1)
          return prefix.lastIndexOf('<') <= prefix.lastIndexOf('>')
        },
      },
    },
  }
}

declare module 'mdast-util-from-markdown' {
  interface CompileData {
    hmxDirectiveAttributes?: AttributeCapture
    hmxDirectiveContainers?: ContainerCapture[]
  }
}

function tokenSpan(token: Token, positions: SourcePositions): Span {
  return {
    start: positions.pointAt(token.start.offset),
    end: positions.pointAt(token.end.offset),
  }
}

function offsetSpan(start: number, end: number, positions: SourcePositions): Span {
  return {
    start: positions.pointAt(start),
    end: positions.pointAt(end),
  }
}

function attributeSpan(token: Token, positions: SourcePositions): Span {
  let end = token.end.offset
  while (end > token.start.offset) {
    const code = positions.source.charCodeAt(end - 1)
    if (code !== 9 && code !== 32) {
      break
    }
    end -= 1
  }
  return offsetSpan(token.start.offset, end, positions)
}

function directiveNode(context: CompileContext): DirectiveDraft {
  const node = context.stack[context.stack.length - 1] as Partial<DirectiveDraft> | undefined
  if (
    node?.type !== 'containerDirective' &&
    node?.type !== 'leafDirective' &&
    node?.type !== 'textDirective'
  ) {
    throw new TypeError('Expected an open directive node')
  }
  return node as unknown as DirectiveDraft
}

function attributeCapture(context: CompileContext): AttributeCapture {
  const capture = context.data.hmxDirectiveAttributes
  if (capture === undefined) {
    throw new TypeError('Expected an open directive attribute list')
  }
  return capture
}

function pendingAttribute(context: CompileContext): PendingAttribute {
  const pending = attributeCapture(context).current
  if (pending === undefined) {
    throw new TypeError('Expected an open directive attribute')
  }
  return pending
}

function containerCapture(context: CompileContext): ContainerCapture {
  const captures = context.data.hmxDirectiveContainers
  const capture = captures?.[captures.length - 1]
  if (capture === undefined) {
    throw new TypeError('Expected an open container directive')
  }
  return capture
}

function forbiddenAttributeDiagnostic(name: string, span: Span): Diagnostic {
  return createDiagnostic({
    code: 'HMX3005',
    severity: 'error',
    message: `Directive attribute "${name}" is forbidden because it can modify object prototypes.`,
    span,
  })
}

/**
 * Creates HMX-owned mdast handlers for the directive tokenizer.
 *
 * Attribute order, duplicates, and exact source spans are retained for the HMX
 * conversion boundary instead of being collapsed into an mdast attribute record.
 */
export function directiveFromMarkdown(
  diagnostics: Diagnostic[],
  positions: SourcePositions,
): Extension {
  const enter: Record<string, Handle> = {}
  const exit: Record<string, Handle> = {}

  const enterDirective = (type: DirectiveType): Handle =>
    function (token) {
      if (type === 'containerDirective') {
        const captures = this.data.hmxDirectiveContainers ?? []
        captures.push({ fenceCount: 0 })
        this.data.hmxDirectiveContainers = captures
      }

      const node: DirectiveDraft = {
        type,
        name: '',
        attributes: [],
        children: [],
      }
      this.enter(node as unknown as MdastCompatibleNode, token)
    }

  const exitDirective: Handle = function (token) {
    const node = directiveNode(this)

    if (node.type === 'containerDirective') {
      const captures = this.data.hmxDirectiveContainers
      const capture = captures?.pop()
      if (capture === undefined) {
        throw new TypeError('Expected container directive capture state')
      }
      if (capture.fenceCount < 2) {
        const eof = positions.pointAt(positions.source.length)
        diagnostics.push(
          createDiagnostic({
            code: 'HMX1001',
            severity: 'error',
            message: `Container directive "${node.name}" is not closed.`,
            span: capture.openingSequence ?? tokenSpan(token, positions),
            expected: 'a closing fence with at least as many colons as the opening fence',
            related: [
              {
                message: 'The document ended before a matching closing fence.',
                span: { start: eof, end: eof },
              },
            ],
          }),
        )
      }
      if (captures?.length === 0) {
        delete this.data.hmxDirectiveContainers
      }
    }

    this.exit(token)
  }

  const exitName: Handle = function (token) {
    directiveNode(this).name = this.sliceSerialize(token)
  }

  const enterBlockLabel: Handle = function (token) {
    const label: LabelDraft = { type: 'paragraph', children: [] }
    this.enter(label as unknown as MdastCompatibleNode, token)
  }

  const exitBlockLabel: Handle = function (token) {
    const label = this.stack[this.stack.length - 1] as unknown as LabelDraft | undefined
    if (label?.type !== 'paragraph') {
      throw new TypeError('Expected an open block directive label')
    }

    this.exit(token)
    const node = directiveNode(this)
    const attachedLabel = node.children.pop()
    if (attachedLabel !== (label as unknown as MdastCompatibleNode)) {
      throw new TypeError('Container directive label was attached out of order')
    }
    node.label = label.children
  }

  const enterAttributes: Handle = function () {
    if (this.data.hmxDirectiveAttributes !== undefined) {
      throw new TypeError('Directive attribute lists cannot overlap')
    }
    this.data.hmxDirectiveAttributes = { attributes: [] }
    this.buffer()
  }

  const exitAttributes: Handle = function () {
    const capture = attributeCapture(this)
    if (capture.current !== undefined) {
      throw new TypeError('Directive attribute list ended with an open attribute')
    }
    this.resume()
    directiveNode(this).attributes = capture.attributes
    delete this.data.hmxDirectiveAttributes
  }

  const enterAttribute: Handle = function () {
    const capture = attributeCapture(this)
    if (capture.current !== undefined) {
      throw new TypeError('Directive attributes cannot overlap')
    }
    capture.current = { hasInitializer: false, quoted: false }
  }

  const exitAttribute: Handle = function (token) {
    const capture = attributeCapture(this)
    const pending = pendingAttribute(this)
    if (pending.name === undefined || pending.nameSpan === undefined) {
      throw new TypeError('Directive attribute has no name')
    }

    const position = attributeSpan(token, positions)
    const value = pending.value ?? (pending.hasInitializer ? '' : null)
    if (isForbiddenAttributeName(pending.name)) {
      diagnostics.push(forbiddenAttributeDiagnostic(pending.name, pending.nameSpan))
    } else {
      capture.attributes.push({
        name: pending.name,
        value,
        position,
        nameSpan: pending.nameSpan,
        ...(pending.valueSpan === undefined ? {} : { valueSpan: pending.valueSpan }),
      })
    }

    delete capture.current
  }

  const exitAttributeName: Handle = function (token) {
    const pending = pendingAttribute(this)
    pending.name = this.sliceSerialize(token)
    pending.nameSpan = tokenSpan(token, positions)
  }

  const exitInitializer: Handle = function () {
    pendingAttribute(this).hasInitializer = true
  }

  const exitShorthand = (name: 'class' | 'id'): Handle =>
    function (token) {
      const pending = pendingAttribute(this)
      const serialized = this.sliceSerialize(token)
      pending.name = name
      pending.value = decodeString(serialized.slice(1))
      pending.nameSpan = tokenSpan(token, positions)
      pending.valueSpan = offsetSpan(token.start.offset + 1, token.end.offset, positions)
    }

  const enterValueLiteral: Handle = function () {
    pendingAttribute(this).quoted = true
  }

  const exitValueLiteral: Handle = function (token) {
    const pending = pendingAttribute(this)
    if (pending.value === undefined) {
      pending.value = ''
      pending.valueSpan = offsetSpan(token.start.offset + 1, token.end.offset - 1, positions)
    }
  }

  const exitValue: Handle = function (token) {
    const pending = pendingAttribute(this)
    const serialized = this.sliceSerialize(token)
    if (!pending.quoted && serialized.startsWith('{') && serialized.endsWith('}')) {
      pending.value = serialized.slice(1, -1).trim()
      pending.valueSpan = offsetSpan(token.start.offset + 1, token.end.offset - 1, positions)
    } else {
      pending.value = decodeString(serialized)
      pending.valueSpan = tokenSpan(token, positions)
    }
  }

  const enterContainerFence: Handle = function () {
    containerCapture(this).fenceCount += 1
  }

  const exitContainerSequence: Handle = function (token) {
    const capture = containerCapture(this)
    if (capture.openingSequence === undefined) {
      capture.openingSequence = tokenSpan(token, positions)
    }
  }

  const configurations = [
    { token: 'directiveContainer', type: 'containerDirective' },
    { token: 'directiveLeaf', type: 'leafDirective' },
    { token: 'directiveText', type: 'textDirective' },
  ] as const

  for (const configuration of configurations) {
    const prefix = configuration.token
    enter[prefix] = enterDirective(configuration.type)
    exit[prefix] = exitDirective
    exit[`${prefix}Name`] = exitName
    enter[`${prefix}Attributes`] = enterAttributes
    exit[`${prefix}Attributes`] = exitAttributes
    enter[`${prefix}Attribute`] = enterAttribute
    exit[`${prefix}Attribute`] = exitAttribute
    exit[`${prefix}AttributeId`] = exitShorthand('id')
    exit[`${prefix}AttributeClass`] = exitShorthand('class')
    exit[`${prefix}AttributeName`] = exitAttributeName
    exit[`${prefix}AttributeInitializerMarker`] = exitInitializer
    enter[`${prefix}AttributeValueLiteral`] = enterValueLiteral
    exit[`${prefix}AttributeValueLiteral`] = exitValueLiteral
    exit[`${prefix}AttributeValue`] = exitValue
  }

  enter.directiveContainerLabel = enterBlockLabel
  exit.directiveContainerLabel = exitBlockLabel
  enter.directiveLeafLabel = enterBlockLabel
  exit.directiveLeafLabel = exitBlockLabel
  enter.directiveContainerFence = enterContainerFence
  exit.directiveContainerSequence = exitContainerSequence

  return { canContainEols: ['textDirective'], enter, exit }
}
