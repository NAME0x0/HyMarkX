import { describe, expect, it } from 'vitest'
import {
  SYNTHETIC_SPAN,
  containsPoint,
  isSyntheticSpan,
  mergeSpans,
  pointToString,
  spanToString,
} from '../src/index.js'
import type { Point, Span } from '../src/index.js'

const start: Point = { line: 2, column: 3, offset: 10 }
const middle: Point = { line: 2, column: 5, offset: 12 }
const end: Point = { line: 2, column: 8, offset: 15 }
const span: Span = { start, end }

describe('span utilities', () => {
  it('formats points and spans', () => {
    expect(pointToString(start)).toBe('2:3')
    expect(spanToString(span)).toBe('2:3-2:8')
  })

  it('checks points inclusively by source offset', () => {
    expect(containsPoint(span, start)).toBe(true)
    expect(containsPoint(span, middle)).toBe(true)
    expect(containsPoint(span, end)).toBe(true)
    expect(containsPoint(span, { line: 1, column: 1, offset: 9 })).toBe(false)
    expect(containsPoint(span, { line: 3, column: 1, offset: 16 })).toBe(false)
  })

  it('merges overlapping spans regardless of argument order', () => {
    const other: Span = {
      start: { line: 2, column: 6, offset: 13 },
      end: { line: 3, column: 4, offset: 20 },
    }
    const expected: Span = { start, end: other.end }

    expect(mergeSpans(span, other)).toEqual(expected)
    expect(mergeSpans(other, span)).toEqual(expected)
  })

  it('recognizes only an all-zero synthetic span', () => {
    expect(isSyntheticSpan(SYNTHETIC_SPAN)).toBe(true)
    expect(
      isSyntheticSpan({
        start: SYNTHETIC_SPAN.start,
        end: { line: 0, column: 1, offset: 0 },
      }),
    ).toBe(false)
  })
})
