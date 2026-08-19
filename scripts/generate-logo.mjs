/**
 * Draws the HyMarkX mark: an ink tile with a lowercase `hmx` wordmark set into the bottom-right
 * corner, the `x` carrying the blue accent.
 *
 * The letters are the real outlines of **Cascadia Mono Bold**, extracted from the font with
 * fontTools and embedded here as paths. Two reasons they are not `<text>` and not hand-drawn:
 *
 *   - `<text>` with a font stack renders differently on every machine, because the viewer's
 *     default monospace decides the letterforms. A logo whose shapes move is not a logo.
 *   - Redrawing them as monoline strokes — which is what the first version of this file did —
 *     produces a different logo wearing the same letters. It shipped in 0.0.2 and was wrong:
 *     the approved design was set in bold monospace, not in geometric strokes.
 *
 * Embedded rather than read from the font at build time, so the output does not depend on which
 * fonts happen to be installed on the machine running it.
 *
 * Cascadia Code/Mono is © Microsoft Corporation, licensed under the SIL Open Font License 1.1,
 * which permits use of its outlines in artwork like this.
 *
 *   node scripts/generate-logo.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const INK = '#172033'
const BLUE = '#2563eb'
const PAPER = '#f8fafc'

/** Font units per em, and the monospace advance every glyph shares. */
const UPEM = 2048
const ADVANCE = 1200

/** Glyph outlines in font space, y-up. Coordinates rounded to 0.1 units. */
const LETTERS = [
  {
    char: 'h',
    path: 'M778 0V640Q778 729 738.5 777Q699 825 625.7 825Q422 825 422 546L360 868H448Q463 975 521 1027.5Q579 1080 697 1080Q865 1080 957 978Q1049 876 1049 690V0ZM151 0V1500H422V0Z',
  },
  {
    char: 'm',
    path: 'M839 0V718Q839 828 775 828Q703 828 703 709L631 928H721Q730 999 776.5 1039.5Q823 1080 899 1080Q1006 1080 1055.5 1021Q1105 962 1105 830V0ZM95 0V1060H338L362 836V0ZM502 0V738Q502 828 438 828Q362 828 362 709L300 928H376Q398 1080 537 1080Q614.4 1080 658.7 1023Q703 966 703 850V0Z',
  },
  {
    char: 'x',
    path: 'M81 0 520 592 796 1060H1119L664 450L404 0ZM796 0 524 450 81 1060H404L680 592L1119 0Z',
  },
]

// The metrics the approved variant was rendered at: 34/100 type, right edge 93, baseline 88.
const FONT_SIZE = 34
const RIGHT = 93
const BASELINE = 88

/**
 * @param {{ radius?: number }} [options] `radius` 0 is the square used for social previews and
 * for icons the host masks itself; a rounded tile suits surfaces that do not round it for you.
 */
export function mark({ radius = 0 } = {}) {
  const scale = FONT_SIZE / UPEM
  const advance = ADVANCE * scale
  const start = RIGHT - advance * LETTERS.length

  const glyphs = LETTERS.map((letter, index) => {
    const x = (start + advance * index).toFixed(2)
    const colour = letter.char === 'x' ? BLUE : PAPER
    // Glyph space is y-up; the negative y scale flips it onto the SVG baseline.
    return `  <path transform="translate(${x} ${BASELINE}) scale(${scale.toFixed(5)} -${scale.toFixed(5)})" d="${letter.path}" fill="${colour}"/>`
  }).join('\n')

  return `<rect width="100" height="100" rx="${radius}" fill="${INK}"/>\n${glyphs}`
}

export function svg(inner, size) {
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dimensions} role="img" aria-label="HyMarkX">\n${inner}\n</svg>\n`
}

// Only when run as a script, so the drift test can import `mark` without rewriting the files it
// is about to compare against.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const assets = fileURLToPath(new URL('../assets/', import.meta.url))
  writeFileSync(`${assets}logo.svg`, svg(mark()))
  writeFileSync(`${assets}logo-rounded.svg`, svg(mark({ radius: 18 })))
  console.log('wrote assets/logo.svg and assets/logo-rounded.svg')
}
