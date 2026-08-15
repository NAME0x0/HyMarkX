import { createDiagnostic } from '@hymarkx/ast'
import type { Diagnostic, Span } from '@hymarkx/ast'
import type { CompileContext, Extension, Handle, Token } from 'mdast-util-from-markdown'
import type { Code, Construct, State } from 'micromark-util-types'
import { SourcePositions } from './positions.js'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    hmxInterpolation: 'hmxInterpolation'
    hmxInterpolationMarker: 'hmxInterpolationMarker'
    hmxInterpolationUnterminated: 'hmxInterpolationUnterminated'
    hmxInterpolationValue: 'hmxInterpolationValue'
  }
}

type MdastCompatibleNode = Parameters<CompileContext['enter']>[0]

interface InterpolationDraft {
  type: 'interpolation' | 'text'
  value: string
  openingSpan: Span
}

function isLineEnding(code: Code): boolean {
  return code === -5 || code === -4 || code === -3
}

function interpolationNode(context: CompileContext): InterpolationDraft {
  for (let index = context.stack.length - 1; index >= 0; index -= 1) {
    const node = context.stack[index] as Partial<InterpolationDraft> | undefined
    if (node?.type === 'interpolation' || node?.type === 'text') {
      return node as InterpolationDraft
    }
  }
  throw new TypeError('Expected an open interpolation node')
}

const interpolationConstruct: Construct = {
  tokenize(effects, ok, nok) {
    let interpolationToken: Token | undefined
    let braceDepth = 0
    let quote: 34 | 39 | undefined
    let escaped = false

    const finishUnterminated = (code: Code): State | undefined => {
      if (interpolationToken === undefined) {
        return nok(code)
      }
      interpolationToken.type = 'hmxInterpolationUnterminated'
      effects.exit('hmxInterpolationUnterminated')
      return ok(code)
    }

    const unterminated = (code: Code): State | undefined => {
      effects.exit('hmxInterpolationValue')
      return finishUnterminated(code)
    }

    const inside: State = (code) => {
      if (code === null || isLineEnding(code)) {
        return unterminated(code)
      }

      if (quote !== undefined) {
        effects.consume(code)
        if (escaped) {
          escaped = false
        } else if (code === 92) {
          escaped = true
        } else if (code === quote) {
          quote = undefined
        }
        return inside
      }

      if (code === 34 || code === 39) {
        quote = code
        effects.consume(code)
        return inside
      }
      if (code === 123) {
        braceDepth += 1
        effects.consume(code)
        return inside
      }
      if (code === 125 && braceDepth > 0) {
        braceDepth -= 1
        effects.consume(code)
        return inside
      }
      if (code === 125) {
        effects.exit('hmxInterpolationValue')
        effects.enter('hmxInterpolationMarker')
        effects.consume(code)
        return close
      }

      effects.consume(code)
      return inside
    }

    const close: State = (code) => {
      if (code === 125) {
        effects.consume(code)
        effects.exit('hmxInterpolationMarker')
        effects.exit('hmxInterpolation')
        return ok
      }
      if (code === null || isLineEnding(code)) {
        effects.exit('hmxInterpolationMarker')
        return finishUnterminated(code)
      }

      effects.exit('hmxInterpolationMarker')
      effects.enter('hmxInterpolationValue')
      return inside(code)
    }

    const secondOpening: State = (code) => {
      if (code !== 123) {
        return nok(code)
      }
      effects.consume(code)
      effects.exit('hmxInterpolationMarker')
      effects.enter('hmxInterpolationValue')
      return inside
    }

    return (code) => {
      if (code !== 123) {
        return nok(code)
      }
      interpolationToken = effects.enter('hmxInterpolation')
      effects.enter('hmxInterpolationMarker')
      effects.consume(code)
      return secondOpening
    }
  },
}

/** Creates the text-only interpolation tokenizer. */
export function interpolationTokenizer(): { readonly text: Readonly<Record<123, Construct>> } {
  return { text: { 123: interpolationConstruct } }
}

/** Creates mdast handlers for raw interpolation nodes and unterminated recovery. */
export function interpolationFromMarkdown(
  diagnostics: Diagnostic[],
  positions: SourcePositions,
): Extension {
  const enterInterpolation: Handle = function (token) {
    const openingSpan = {
      start: positions.pointAt(token.start.offset),
      end: positions.pointAt(Math.min(token.start.offset + 2, positions.source.length)),
    }
    const node: InterpolationDraft = { type: 'interpolation', value: '', openingSpan }
    this.enter(node as unknown as MdastCompatibleNode, token)
    this.buffer()
  }

  const exitUnterminated: Handle = function (token) {
    const node = interpolationNode(this)
    node.type = 'text'
    diagnostics.push(
      createDiagnostic({
        code: 'HMX1020',
        severity: 'error',
        message: 'Interpolation is not closed.',
        span: node.openingSpan,
        expected: 'a closing }} before the end of the line',
      }),
    )
    this.resume()
    node.value = positions.source.slice(token.start.offset, token.end.offset)
    delete (node as Partial<InterpolationDraft>).openingSpan
    this.exit(token)
  }

  const exitInterpolation: Handle = function (token) {
    const node = interpolationNode(this)
    this.resume()
    const raw = positions.source.slice(token.start.offset, token.end.offset)
    node.value = node.type === 'interpolation' ? raw.slice(2, -2).trim() : raw
    delete (node as Partial<InterpolationDraft>).openingSpan
    this.exit(token)
  }

  return {
    enter: {
      hmxInterpolation: enterInterpolation,
      hmxInterpolationUnterminated: enterInterpolation,
    },
    exit: {
      hmxInterpolation: exitInterpolation,
      hmxInterpolationUnterminated: exitUnterminated,
    },
  }
}
