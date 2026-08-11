import type { Point, Span } from '@hymarkx/ast'

/** Indexes normalized source using UTF-16 code units. */
export class SourcePositions {
  readonly source: string
  readonly span: Span
  readonly #lineStarts: readonly number[]

  constructor(source: string) {
    this.source = source

    const lineStarts = [0]
    for (let offset = 0; offset < source.length; offset += 1) {
      if (source.charCodeAt(offset) === 10) {
        lineStarts.push(offset + 1)
      }
    }
    this.#lineStarts = lineStarts
    this.span = {
      start: this.pointAt(0),
      end: this.pointAt(source.length),
    }
  }

  /** Returns a 1-based line/column point for a UTF-16 offset. */
  pointAt(offset: number): Point {
    if (!Number.isInteger(offset) || offset < 0 || offset > this.source.length) {
      throw new RangeError(`Source offset is out of range: ${offset}`)
    }

    let low = 0
    let high = this.#lineStarts.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      const lineStart = this.#lineStarts[middle]
      if (lineStart !== undefined && lineStart <= offset) {
        low = middle + 1
      } else {
        high = middle
      }
    }

    const lineIndex = low - 1
    const lineStart = this.#lineStarts[lineIndex]
    if (lineStart === undefined) {
      throw new RangeError(`Could not locate source offset: ${offset}`)
    }

    return {
      line: lineIndex + 1,
      column: offset - lineStart + 1,
      offset,
    }
  }

  /** Derives an offset when an upstream point omitted it. */
  offsetAt(line: number, column: number): number {
    if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
      throw new RangeError(`Invalid source point: ${line}:${column}`)
    }

    const lineStart = this.#lineStarts[line - 1]
    if (lineStart === undefined) {
      throw new RangeError(`Source line is out of range: ${line}`)
    }

    const offset = lineStart + column - 1
    const nextLineStart = this.#lineStarts[line]
    const maximum = nextLineStart === undefined ? this.source.length : nextLineStart - 1
    if (offset > maximum) {
      throw new RangeError(`Source column is out of range: ${line}:${column}`)
    }

    return offset
  }
}
