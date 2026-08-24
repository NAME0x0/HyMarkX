import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const siteDirectory = fileURLToPath(new URL('../../site/', import.meta.url))
const index = readFileSync(`${siteDirectory}index.hmx`, 'utf8').replaceAll('\r\n', '\n')

/**
 * The landing page says every number on it comes from something that regenerates it. This is
 * that something for the one number nothing else covers: a font file's size is a fact on disk,
 * and a claim about it is wrong the moment the file is resubset.
 */
function metric(label) {
  const match = index.match(new RegExp(`:::metric\\[${label}\\]\\n(.+)\\n:::`))
  return match?.[1]
}

describe("the landing page's cost strip", () => {
  it('states the display face at its size on disk', () => {
    const bytes = statSync(`${siteDirectory}public/fonts/instrument-serif-latin.woff2`).size

    expect(metric('display face, subset to Latin')).toBe(`${Math.round(bytes / 1024)} kB`)
  })

  it('ships the licence the font is used under', () => {
    const licence = readFileSync(`${siteDirectory}public/fonts/instrument-serif-OFL.txt`, 'utf8')

    expect(licence).toContain('SIL Open Font License')
  })
})
