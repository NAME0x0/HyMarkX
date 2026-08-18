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
   * `check-boundaries.mjs` enforces the rule in the code; this checks the picture tells the
   * same story. Exactly one box may be labelled as carrying engine dependencies, and the
   * boundary drawn around it has to name the ADR, or it is decoration.
   */
  it('marks exactly one package as reaching the engine, and names the rule', () => {
    const engineLabels = [...committed.matchAll(/>(\d+) engine deps</g)]

    expect(engineLabels).toHaveLength(1)
    expect(Number(engineLabels[0][1])).toBeGreaterThan(0)
    expect(committed).toContain('ADR-0005')
  })

  /**
   * The accent is the diagram's only emphasis, so it has to land on the thing being emphasised.
   *
   * Spending it on a second colour would leave the reader with two focal points and no idea
   * which one the picture is about.
   */
  it('spends the accent colour only on the engine boundary', () => {
    const accentFills = [...committed.matchAll(/fill="#2563eb"/g)]
    const parserBlock = committed.slice(
      committed.indexOf('>parser</text>') - 400,
      committed.indexOf('>parser</text>') + 200,
    )

    expect(parserBlock).toContain('#2563eb')
    // Markers, zone, parser box and its sublabel — not scattered across every node.
    expect(accentFills.length).toBeLessThanOrEqual(4)
  })

  // GitHub serves this file raw. A non-ASCII character rendered as mojibake the first time this
  // was generated, so the text stays ASCII and the encoding is declared rather than assumed.
  it('is ASCII with a declared encoding, so GitHub cannot mis-render it', () => {
    expect(committed.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(committed)).toBe(false)
  })
})
