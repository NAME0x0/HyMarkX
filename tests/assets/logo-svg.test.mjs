import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mark, svg } from '../../scripts/generate-logo.mjs'

/**
 * The committed logo must match its generator, and the rasters must not go missing.
 *
 * A logo is the one asset most likely to be edited by hand in a vector editor and then diverge
 * from the source that claims to produce it. Regenerate with `node scripts/generate-logo.mjs`.
 */
const assets = fileURLToPath(new URL('../../assets/', import.meta.url))
const read = (name) => readFileSync(`${assets}${name}`, 'utf8')

describe('logo', () => {
  it('matches its generator byte for byte', () => {
    expect(read('logo.svg')).toBe(svg(mark()))
    expect(read('logo-rounded.svg')).toBe(svg(mark({ radius: 18 })))
  })

  /**
   * The letters are strokes on a fixed grid, not `<text>`.
   *
   * The variant sheet used a monospace font stack, which was fine for choosing a direction and
   * would have shipped a logo whose letterforms changed with whatever mono the viewer had
   * installed.
   */
  it('carries no text elements, so the letterforms cannot shift', () => {
    const source = read('logo.svg')

    expect(source).not.toContain('<text')
    expect(source).not.toContain('font-family')
    expect(source.match(/<path /g)).toHaveLength(3)
  })

  // GitHub and npm serve these raw; a declared encoding costs nothing and prevents mojibake.
  it('declares its encoding', () => {
    expect(read('logo.svg').startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  /**
   * The rasters are committed binaries because rasterising needs a browser, which CI does not
   * have for this step. So the check is that they exist and are plausibly sized — a truncated or
   * zero-byte icon would otherwise reach the Marketplace, which rejects SVG and would have
   * nothing else to show.
   */
  it.each([
    ['logo-32.png', 200],
    ['logo-128.png', 800],
    ['logo-256.png', 1500],
    ['logo-512.png', 3000],
    ['social-preview.png', 10_000],
  ])('ships %s', (name, minimumBytes) => {
    expect(statSync(`${assets}${name}`).size).toBeGreaterThan(minimumBytes)
  })

  // The Marketplace requires a PNG icon of at least 128x128 and refuses SVG outright.
  it('gives the VS Code extension a PNG icon', () => {
    const extension = fileURLToPath(new URL('../../editors/vscode/', import.meta.url))
    const manifest = JSON.parse(readFileSync(`${extension}package.json`, 'utf8'))

    expect(manifest.icon).toBe('icon.png')
    expect(statSync(`${extension}icon.png`).size).toBeGreaterThan(1500)
  })
})
