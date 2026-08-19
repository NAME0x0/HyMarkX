/**
 * Draws the HyMarkX mark as geometry, not as text.
 *
 * The variant sheet used `<text>` with a monospace stack, which was right for judging shapes and
 * wrong for shipping: the logo would have rendered differently on every machine with a different
 * default mono, and a logo whose letterforms move is not a logo. These are monoline strokes on a
 * fixed grid, so the file is self-contained and identical everywhere.
 *
 * Monoline rather than filled outlines because the letters are simple enough that a single
 * stroke width reads as deliberate, and because round caps survive rasterisation at 16px far
 * better than thin outline corners do.
 *
 * This writes the SVGs only. The PNGs in `assets/` — and `editors/vscode/icon.png`, which the
 * Marketplace requires because it rejects SVG icons — are rasterised from these at exact pixel
 * sizes rather than scaled from one large export, and are committed as binaries. Regenerating
 * them needs a rasteriser, so it is a manual step; the SVG is the master and the test below only
 * guards that.
 *
 *   node scripts/generate-logo.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const INK = '#172033'
const BLUE = '#2563eb'
const PAPER = '#f8fafc'

// One grid for all three letters. Baseline, x-height and ascender are shared so the wordmark
// sits on a real typographic rhythm instead of three shapes that happen to be near each other.
const BASELINE = 84
const XHEIGHT = 66
const ASCENDER = 48
const STROKE = 6.5
const ARCH = 8

// Letter origins, right-aligned so the wordmark sits into the bottom-right corner with real
// space around it. Filling the tile edge to edge loses what made this direction work.
// Gaps are 8, not 5. Round caps add half a stroke width at every terminal, so the first pass
// left about one unit of real space between letters and the wordmark read as one blob.
const H = 23
const M = 45
const X = 77

/** `h` — full-height stem, shoulder, short leg. */
const letterH = `M ${H},${ASCENDER} V ${BASELINE} M ${H},${XHEIGHT + ARCH} Q ${H},${XHEIGHT} ${H + 7},${XHEIGHT} Q ${H + 14},${XHEIGHT} ${H + 14},${XHEIGHT + ARCH} V ${BASELINE}`

/** `m` — stem, two shoulders, three legs. */
const letterM = `M ${M},${BASELINE} V ${XHEIGHT + ARCH} Q ${M},${XHEIGHT} ${M + 6},${XHEIGHT} Q ${M + 12},${XHEIGHT} ${M + 12},${XHEIGHT + ARCH} V ${BASELINE} M ${M + 12},${XHEIGHT + ARCH} Q ${M + 12},${XHEIGHT} ${M + 18},${XHEIGHT} Q ${M + 24},${XHEIGHT} ${M + 24},${XHEIGHT + ARCH} V ${BASELINE}`

/** `x` — two crossing diagonals, carrying the accent. */
const letterX = `M ${X},${XHEIGHT} L ${X + 13},${BASELINE} M ${X + 13},${XHEIGHT} L ${X},${BASELINE}`

/**
 * @param {{ radius?: number, background?: string }} [options]
 * `radius` 0 gives the square used for social previews and app icons that get masked anyway;
 * a rounded corner suits the Marketplace tile, which does not round it for you.
 */
export function mark({ radius = 0, background = INK } = {}) {
  return `<rect width="100" height="100" rx="${radius}" fill="${background}"/>
  <g fill="none" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${letterH}" stroke="${PAPER}"/>
    <path d="${letterM}" stroke="${PAPER}"/>
    <path d="${letterX}" stroke="${BLUE}"/>
  </g>`
}

export function svg(inner, size) {
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dimensions} role="img" aria-label="HyMarkX">\n  ${inner}\n</svg>\n`
}

// Only when run as a script, so the drift test can import `mark` without rewriting the files it
// is about to compare against.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const assets = fileURLToPath(new URL('../assets/', import.meta.url))
  writeFileSync(`${assets}logo.svg`, svg(mark()))
  writeFileSync(`${assets}logo-rounded.svg`, svg(mark({ radius: 18 })))
  console.log('wrote assets/logo.svg and assets/logo-rounded.svg')
}
