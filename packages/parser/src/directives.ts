import { createDiagnostic, isForbiddenAttributeName } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Span } from '@hymarkx/ast'
import type { CompileContext, Extension, Handle, Token } from 'mdast-util-from-markdown'
import { directive } from 'micromark-extension-directive'
import { markdownLineEnding } from 'micromark-util-character'
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

      // A directive name is ASCII per SPEC 4.1; upstream would accept Unicode names.
      const rejectsAsDirectiveName = (code: number | null): boolean =>
        code !== null && code > 127 && !/[\p{P}\p{Z}\s]/u.test(String.fromCodePoint(code))

      const guardState = (state: State): State =>
        function (code) {
          // A directive name cannot span lines (SPEC §4.1), so the guard must disarm at the
          // line ending. Leaving it armed made a non-ASCII character on any later line
          // re-enter `nok` from a fresh tokenize call — and with
          // `micromark-extension-gfm-table` present, whose container continuation re-runs the
          // line, that became an infinite loop on untrusted input. Found by the pipeline
          // fuzzer; see SECURITY.md T9.
          if (markdownLineEnding(code)) {
            inDirectiveName = false
            beforeDirectiveName = false
          }

          // `beforeDirectiveName` arms for exactly one code and then disarms, because only the
          // character immediately after `:` can begin a name. It used to stay armed until a name
          // token was entered, which never happens when the attempt fails — so in `: \`&\` → \`x\``
          // the guard was still live at the non-ASCII character, returned `nok` from the middle
          // of the paragraph, and shifted the surrounding code spans by one backtick. Silent
          // wrong output with no diagnostic; found by the CommonMark compatibility corpus.
          if (beforeDirectiveName) {
            beforeDirectiveName = false
            if (rejectsAsDirectiveName(code)) {
              return nok(code)
            }
          }
          if (inDirectiveName && rejectsAsDirectiveName(code)) {
            return nok(code)
          }
          const next = state(code)
          return next === undefined ? undefined : guardState(next)
        }

      return guardState(construct.tokenize.call(this, guardedEffects, ok, nok))
    },
  }
}

/** What a completed content line means to the container scanning it. */
type LineKind =
  | { readonly kind: 'other' }
  | { readonly kind: 'codeFence'; readonly char: number; readonly size: number; readonly bare: boolean }
  | { readonly kind: 'open'; readonly size: number }
  | { readonly kind: 'close'; readonly size: number }

/**
 * Classifies one content line of a container.
 *
 * Only the leading run matters: up to three spaces of indent, then a run of backticks, tildes,
 * or colons. Four spaces would be an indented code block, which is why the prefix stops at
 * three.
 */
function classifyLine(line: string): LineKind {
  let index = 0
  while (index < 3 && line.charCodeAt(index) === 32) {
    index += 1
  }
  const first = line.charCodeAt(index)
  if (first !== 96 && first !== 126 && first !== 58) {
    return { kind: 'other' }
  }

  let size = 0
  while (line.charCodeAt(index + size) === first) {
    size += 1
  }
  if (size < 3) {
    return { kind: 'other' }
  }

  const rest = line.slice(index + size)
  if (first === 96 || first === 126) {
    return { kind: 'codeFence', char: first, size, bare: rest.trim() === '' }
  }
  // A directive opener is followed by its name; a closing fence has nothing but whitespace.
  return rest.trim() === '' ? { kind: 'close', size } : { kind: 'open', size }
}

/**
 * Makes a container's content scan aware of code fences and of nested containers (ADR-0021).
 *
 * The upstream container tests every line for its closing fence before that line reaches the
 * flow tokenizer, so it cannot tell markup from a code sample: a page quoting `:::note` lost
 * everything after the quoted closing fence, silently. The same blindness is why nesting
 * required the outer fence to be longer — the outer scan cannot see that an inner container is
 * open.
 *
 * Both are fixed with state the scan can actually have. The closing-fence attempt for line *n*
 * happens before line *n* is consumed, but it only needs to know about lines *1..n-1*: whether
 * a code fence is still open, and whether an inner container is still open. Observing `consume`
 * gives exactly that, so the attempt is suppressed — the line is content — whenever either is
 * true.
 *
 * Wrapping rather than replacing keeps the opening parse, the label and attribute factories,
 * and the lazy-line handling upstream's, which is where the subtlety lives.
 */
function guardContainerNesting(construct: Construct): Construct {
  return {
    ...construct,
    tokenize(effects, ok, nok) {
      let inContent = false
      let line = ''
      let codeFence: { char: number; size: number } | undefined
      const inner: number[] = []

      /** Applies a finished line to the scan state. */
      function endLine(): void {
        const classified = classifyLine(line)
        line = ''
        if (codeFence !== undefined) {
          if (
            classified.kind === 'codeFence' &&
            classified.char === codeFence.char &&
            classified.size >= codeFence.size &&
            classified.bare
          ) {
            codeFence = undefined
          }
          // Everything else inside a fence is literal, including directive syntax.
          return
        }
        if (classified.kind === 'codeFence') {
          codeFence = { char: classified.char, size: classified.size }
          return
        }
        if (classified.kind === 'open') {
          inner.push(classified.size)
          return
        }
        if (classified.kind === 'close') {
          // Closes the innermost container this scan has seen opened with no more colons than
          // the fence carries, and with it anything still open inside that one.
          for (let index = inner.length - 1; index >= 0; index -= 1) {
            if ((inner[index] as number) <= classified.size) {
              inner.length = index
              return
            }
          }
        }
      }

      const guardedEffects: Effects = {
        ...effects,
        enter(type, fields) {
          if (type === 'directiveContainerContent') {
            inContent = true
          }
          return effects.enter(type, fields)
        },
        consume(code) {
          // Only the container's content is scanned. Its own opening line runs through here
          // first, and counting that as a nested opener left the stack permanently non-empty —
          // which suppressed every closing fence and made each container run to end of file.
          if (inContent) {
            if (markdownLineEnding(code)) {
              endLine()
            } else if (code !== null) {
              line += String.fromCodePoint(code)
            }
          }
          return effects.consume(code)
        },
        attempt(candidate, attemptOk, attemptNok) {
          // The only attempt made at the start of a content line is the closing fence. Label and
          // attribute attempts happen on the opening line, before content begins, and the
          // lazy-line test is a `check` rather than an attempt.
          if (
            inContent &&
            line === '' &&
            attemptNok !== undefined &&
            (codeFence !== undefined || inner.length > 0)
          ) {
            return attemptNok
          }
          return effects.attempt(candidate, attemptOk, attemptNok)
        },
      }

      return construct.tokenize.call(this, guardedEffects, ok, nok)
    },
  }
}

/**
 * ASCII letters and digits only.
 *
 * Deliberately not `\w` (which admits `_`) and not a Unicode property (which would make
 * `café:badge[x]` behave differently from `cafe:badge[x]`). The rule exists to stop a colon
 * gluing itself to a word, and directive names are ASCII anyway.
 */
function isAlphanumeric(code: number | null): boolean {
  return (
    code !== null &&
    ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122))
  )
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
        index === 0
          ? guardContainerNesting(guardDirectiveName(construct, 'containerDirective'))
          : guardDirectiveName(construct, 'leafDirective'),
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

          // A text directive may not follow an alphanumeric character (SPEC §4.1, ADR-0017).
          //
          // Without this, `12:30` parses `:30` as a directive. It matches no component, and a
          // bare text directive has no label to fall back on, so the time is deleted — which
          // breaks the compatibility guarantee for an author who wrote no HMX at all.
          //
          // A flanking rule rather than a syntax restriction: `:name` stays legal everywhere a
          // colon is not already attached to a word, which is everywhere anyone would write one.
          // CommonMark reasons the same way about emphasis delimiters.
          if (isAlphanumeric(code)) {
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

/**
 * Resolves ADR-0018 escapes in a quoted attribute value.
 *
 * Only a backslash, a double quote and a single quote are escapable. A backslash before anything
 * else is literal, which is what keeps a Windows path working in an attribute — the alternative,
 * a general rule where a backslash before any character yields that character, would have
 * silently rewritten every such path.
 *
 * Runs before `decodeString`, so character references are still resolved afterwards and this
 * rule stays independent of them.
 */
function resolveValueEscapes(value: string): string {
  return value.replace(/\\([\\"'])/g, '$1')
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
      pending.value = decodeString(pending.quoted ? resolveValueEscapes(serialized) : serialized)
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
