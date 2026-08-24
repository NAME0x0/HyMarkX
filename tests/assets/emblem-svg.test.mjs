import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from '../../scripts/generate-emblem-svg.mjs'

/**
 * The emblem, held to its generator.
 *
 * A mark that drifts from the script that draws it is two marks, and the one people have
 * already seen is whichever is committed. Regenerate with
 * `node scripts/generate-emblem-svg.mjs`.
 */
const committed = readFileSync(
  fileURLToPath(new URL('../../site/public/emblem.svg', import.meta.url)),
  'utf8',
)

describe('emblem.svg', () => {
  it('matches the generator byte for byte', () => {
    expect(build()).toBe(committed)
  })

  it('draws a fence, content, and a fence', () => {
    // Six dots and three rules. Fewer of either and it stops being a container directive, which
    // is the entire idea the mark carries.
    expect([...committed.matchAll(/<circle /g)]).toHaveLength(6)
    expect([...committed.matchAll(/<rect /g)]).toHaveLength(3)
  })

  it('accents exactly one element', () => {
    expect([...committed.matchAll(/#ff9e5e/g)]).toHaveLength(1)
  })

  it('keeps every coordinate on the 4px grid', () => {
    const offGrid = [
      ...new Set(
        [...committed.matchAll(/\b(?:x|y|cx|cy|width|height)="(\d+)"/g)]
          .map((match) => Number(match[1]))
          .filter((value) => value % 4 !== 0),
      ),
    ]

    expect(offGrid).toEqual([])
  })

  it('is an accessible image with no script', () => {
    expect(committed).toMatch(/<svg[^>]*role="img"/)
    expect(committed).toMatch(/<svg[^>]*>\s*<title id="emblem-title">/)
    expect(committed).toMatch(/<desc id="emblem-desc">.{40,}<\/desc>/)
    expect(committed).not.toMatch(/<script|javascript:|on[a-z]+=/i)
  })
})
