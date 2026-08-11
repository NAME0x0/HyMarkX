import type { Point, Span } from './types.js'

/** A zero-length span for builders and tests that do not have source text. */
export const SYNTHETIC_SPAN: Span = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
}

/** Formats a source point as `line:column`. */
export function pointToString(point: Point): string {
  return `${point.line}:${point.column}`
}

/** Formats a source span as `startLine:startColumn-endLine:endColumn`. */
export function spanToString(span: Span): string {
  return `${pointToString(span.start)}-${pointToString(span.end)}`
}

/** Reports whether a point's offset lies within a span, including both boundaries. */
export function containsPoint(span: Span, point: Point): boolean {
  return point.offset >= span.start.offset && point.offset <= span.end.offset
}

/** Returns the smallest span containing both input spans. */
export function mergeSpans(a: Span, b: Span): Span {
  return {
    start: a.start.offset <= b.start.offset ? a.start : b.start,
    end: a.end.offset >= b.end.offset ? a.end : b.end,
  }
}

/** Reports whether every coordinate in a span is zero. */
export function isSyntheticSpan(span: Span): boolean {
  return (
    span.start.line === 0 &&
    span.start.column === 0 &&
    span.start.offset === 0 &&
    span.end.line === 0 &&
    span.end.column === 0 &&
    span.end.offset === 0
  )
}
