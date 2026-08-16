import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { format } from '../../packages/formatter/src/index.js'

const guide = readFileSync(
  fileURLToPath(new URL('../../docs/guides/formatting.md', import.meta.url)),
  'utf8',
)

/** The guide shows before/after pairs; every even block formats into the one after it. */
const blocks = [...guide.matchAll(/```md\n([\s\S]*?)```/g)].map((match) => match[1])

describe('formatting guide', () => {
  it('shows at least one before/after pair', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks.length % 2).toBe(0)
  })

  // A guide whose examples are wrong is worse than no guide, so the examples are executed
  // rather than trusted.
  it.each(blocks.filter((_, index) => index % 2 === 0).map((before, pair) => ({ pair, before })))(
    'example pair $pair formats as documented',
    ({ pair, before }) => {
      expect(format(before).source.trim()).toBe(blocks[pair * 2 + 1]?.trim())
    },
  )
})
