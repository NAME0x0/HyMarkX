import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from '../../scripts/generate-dependency-graph.mjs'

/**
 * The committed diagram must match what the manifests currently say.
 *
 * A architecture diagram that nobody regenerates becomes a claim about an older version of the
 * code, and this one illustrates the rule the whole dependency boundary rests on — only
 * `@hymarkx/parser` may reach the Markdown engine. A picture showing that when it is no longer
 * true would be worse than no picture, because a reader would believe it.
 *
 * Regenerate with `node scripts/generate-dependency-graph.mjs`.
 */
const committed = readFileSync(
  fileURLToPath(new URL('../../assets/dependency-graph.svg', import.meta.url)),
  'utf8',
)

describe('dependency-graph.svg', () => {
  it('matches the workspace manifests byte for byte', () => {
    expect(build()).toBe(committed)
  })

  // The generator would happily draw an empty graph if the manifests could not be read, and an
  // empty graph would satisfy the comparison above as long as the committed file were empty too.
  it('actually drew every package', () => {
    for (const name of [
      'ast',
      'parser',
      'compiler',
      'formatter',
      'language-server',
      'cli',
      'hymarkx',
    ]) {
      expect(committed).toContain(`>${name}</text>`)
    }
  })

  /**
   * The claim the diagram exists to make, asserted rather than drawn on trust.
   *
   * `check-boundaries.mjs` enforces the rule in the code; this checks the picture is telling
   * the same story — exactly one box carries the engine marker, and it is the parser.
   */
  it('marks the parser, and only the parser, as reaching the engine', () => {
    const engineBoxes = [...committed.matchAll(/class="node engine">[\s\S]*?<\/g>/g)]

    expect(engineBoxes).toHaveLength(1)
    expect(engineBoxes[0][0]).toContain('>parser</text>')
  })

  // GitHub serves this file raw. A non-ASCII character rendered as mojibake the first time this
  // was generated, so the text stays ASCII and the encoding is declared rather than assumed.
  it('is ASCII with a declared encoding, so GitHub cannot mis-render it', () => {
    expect(committed.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(committed)).toBe(false)
  })
})
