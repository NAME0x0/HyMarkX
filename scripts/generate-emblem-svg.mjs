/**
 * Draws the HyMarkX emblem: a container directive, at the size of a signature.
 *
 * The logo is a wordmark and answers "which project is this". This answers "what is this
 * language", and it does it with the one shape nothing else on a page looks like: three colons,
 * three lines of content, three colons. Anyone who has written a fence recognises it, and
 * anyone who has not is looking at a mark rather than at a puzzle.
 *
 * Generated and byte-compared by `tests/assets/emblem-svg.test.mjs`, like every other asset
 * here — a mark that drifts from its generator is two marks.
 *
 * Legibility set the geometry rather than taste: it is drawn on a 4px grid at 120 units and has
 * to survive being an `<img>` at 28px, so there are three weights of element and nothing
 * thinner than 6 units.
 *
 *   node scripts/generate-emblem-svg.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

/** The site's palette. Baked in, because an `<img>` cannot inherit `currentColor`. */
const FENCE = '#9c968f'
const CONTENT = '#4a4a58'
const ACCENT = '#ff9e5e'

const SIZE = 120
const DOT = 6
/** Bar height, on the 4px grid the rest of this project's assets are drawn to. */
const BAR = 8
const DOTS = [20, 40, 60]

/** One row of a fence: the three colons that open or close a container. */
function fence(cy) {
  return DOTS.map((cx) => `<circle cx="${cx}" cy="${cy}" r="${DOT}" fill="${FENCE}"/>`).join('\n  ')
}

/**
 * The content between the fences.
 *
 * Three rules of different lengths, because equal ones read as a hamburger menu. The middle one
 * takes the accent: one accent, on the line that stands for what the document is actually for.
 */
const CONTENT_ROWS = [
  { y: 40, width: 80, fill: CONTENT },
  { y: 56, width: 56, fill: ACCENT },
  { y: 72, width: 72, fill: CONTENT },
]

export function build() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-labelledby="emblem-title emblem-desc">
  <title id="emblem-title">HyMarkX</title>
  <desc id="emblem-desc">A container directive drawn as a mark: three dots for the opening fence, three lines of content, three dots for the closing fence.</desc>
  ${fence(20)}
  ${CONTENT_ROWS.map(
    ({ y, width, fill }) =>
      `<rect x="20" y="${y}" width="${width}" height="${BAR}" rx="4" fill="${fill}"/>`,
  ).join('\n  ')}
  ${fence(100)}
</svg>
`
}

// Only writes when run directly, so the test can import `build()` without touching the disk.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const svg = build()
  writeFileSync(`${repositoryRoot}site/public/emblem.svg`, svg, 'utf8')
  console.log(`emblem.svg — ${svg.length} bytes`)
}
