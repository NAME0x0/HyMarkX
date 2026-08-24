import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from '../../scripts/generate-pipeline-svg.mjs'

/**
 * The committed diagram must match what the generator currently draws.
 *
 * This one illustrates output proportionality, which is the project's central claim, so a
 * picture that drifts from the code is a stale argument rather than merely a stale image.
 *
 * Regenerate with `node scripts/generate-pipeline-svg.mjs`.
 */
const committed = readFileSync(
  fileURLToPath(new URL('../../site/public/pipeline.svg', import.meta.url)),
  'utf8',
)

describe('pipeline.svg', () => {
  it('matches the generator byte for byte', () => {
    expect(build()).toBe(committed)
  })

  /**
   * The Diagram Design system's hard rules, checked rather than trusted.
   *
   * Every coordinate sits on the 4px grid, the accessible-figure contract holds, and the accent
   * marks one node — the moment a second node takes the accent it stops being editorial and
   * becomes a signalling system nobody can read.
   */
  it('keeps every coordinate on the 4px grid', () => {
    const offGrid = [
      ...new Set(
        [...committed.matchAll(/\b(?:x|y|x1|y1|x2|y2)="(\d+)"/g)]
          .map((match) => Number(match[1]))
          .filter((value) => value % 4 !== 0),
      ),
    ]

    expect(offGrid).toEqual([])
  })

  it('is an accessible figure', () => {
    expect(committed).toMatch(/<svg[^>]*role="img"/)
    expect(committed).toMatch(/aria-labelledby="pipeline-title pipeline-desc"/)
    // Assistive technology may ignore a title that is not the first child.
    expect(committed).toMatch(/<svg[^>]*>\s*<title id="pipeline-title">/)
    expect(committed).toMatch(/<desc id="pipeline-desc">.{40,}<\/desc>/)
  })

  it('accents exactly one node', () => {
    // `rx="6"` is the node-box radius. A node's type chip takes the same stroke colour, so
    // counting every accented rect would report two for one accented node.
    const accentedBoxes = [...committed.matchAll(/<rect[^>]*rx="6"[^>]*stroke="#ff9e5e"/g)]

    expect(accentedBoxes).toHaveLength(1)
  })

  // A diagram claiming zero JavaScript while the page around it loads some would be worse than
  // no diagram, so the asset itself must be inert.
  it('contains no script', () => {
    expect(committed).not.toMatch(/<script|javascript:|on[a-z]+=/i)
  })
})
