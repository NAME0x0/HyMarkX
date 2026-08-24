/**
 * Draws the compile pipeline: what HyMarkX does to a document, and what it emits.
 *
 * Generated rather than hand-drawn for the same reason as the dependency graph — a diagram
 * nobody regenerates becomes a claim about an older version of the code. This one illustrates
 * output proportionality, which is the project's central claim, so a stale picture would be a
 * stale argument.
 *
 * `tests/assets/pipeline-svg.test.mjs` regenerates it and compares bytes.
 *
 * Drawn to the Diagram Design system: orthogonal connectors with rounded elbows, one bridged
 * crossing, a single accent element, a dashed zone, a bottom legend strip, every coordinate on
 * a 4px grid. Two deliberate departures, both because this ships as a standalone `.svg` served
 * as an image rather than as inline markup:
 *
 *   - Typography is system stacks. An `<img>` does not inherit the page's `@font-face`, so
 *     naming Geist would fall back to whatever the reader happens to have.
 *   - The palette is the site's own ember-on-ink rather than the system's tangerine-on-paper.
 *     A diagram embedded in that page should look like the page.
 *
 *   node scripts/generate-pipeline-svg.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

const PAPER = '#08080c'
const SURFACE = '#101017'
const INK = '#f3f0ea'
const MUTED = '#9c968f'
const SOFT = '#6f6a66'
const RULE = '#23232f'
const ACCENT = '#ff9e5e'
const ACCENT_TINT = 'rgba(255,158,94,0.12)'

const SANS =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
const SERIF = "ui-serif,Georgia,'Times New Roman',serif"
const MONO = "ui-monospace,'Cascadia Mono','SF Mono',Menlo,Consolas,monospace"

/** Every value on the 4px grid, as the system requires. */
const WIDTH = 1120
const HEIGHT = 384
const ROW = 64
const BOX = 64

/**
 * One node.
 *
 * `tag` is the small rectangular type chip; `note` is the technical sublabel in mono. Both are
 * optional, because a node that needs neither should not carry an empty one.
 */
function node({ x, y, w, name, tag, note, fill, stroke, dashed = false }) {
  const cx = x + w / 2
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${BOX}" rx="6" fill="${PAPER}"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${BOX}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dashed ? ' stroke-dasharray="4,3"' : ''}/>`,
  ]
  if (tag !== undefined) {
    const tagWidth = Math.ceil((8 + tag.length * 6) / 8) * 8
    parts.push(
      `<rect x="${x + 8}" y="${y + 8}" width="${tagWidth}" height="12" rx="2" fill="none" stroke="${stroke}" stroke-opacity="0.45" stroke-width="0.8"/>`,
      `<text x="${x + 8 + tagWidth / 2}" y="${y + 16}" fill="${stroke}" fill-opacity="0.85" font-size="7" font-family="${MONO}" text-anchor="middle" letter-spacing="0.08em">${tag}</text>`,
    )
  }
  parts.push(
    `<text x="${cx}" y="${y + (note === undefined ? 40 : 36)}" fill="${INK}" font-size="12" font-weight="600" font-family="${SANS}" text-anchor="middle">${name}</text>`,
  )
  if (note !== undefined) {
    parts.push(
      `<text x="${cx}" y="${y + 52}" fill="${MUTED}" font-size="9" font-family="${MONO}" text-anchor="middle">${note}</text>`,
    )
  }
  return parts.join('\n  ')
}

/** A label with the mandatory opaque mask and a visible gap above its connector. */
function label(text, cx, lineY) {
  const w = Math.ceil((12 + text.length * 6) / 8) * 8
  return [
    `<rect x="${cx - w / 2}" y="${lineY - 20}" width="${w}" height="12" rx="2" fill="${PAPER}"/>`,
    `<text x="${cx}" y="${lineY - 12}" fill="${SOFT}" font-size="8" font-family="${MONO}" text-anchor="middle" letter-spacing="0.06em">${text}</text>`,
  ].join('\n  ')
}

const chain = [
  { x: 32, w: 144, name: 'Document', tag: 'IN', note: '.md / .hmx', fill: 'rgba(156,150,143,0.10)', stroke: SOFT },
  { x: 240, w: 160, name: 'Parser', tag: 'STEP', note: 'micromark ext', fill: SURFACE, stroke: MUTED },
  { x: 464, w: 144, name: 'AST', tag: 'STATE', note: 'every node spanned', fill: 'rgba(243,240,234,0.05)', stroke: MUTED },
  { x: 672, w: 144, name: 'Compiler', tag: 'STEP', fill: SURFACE, stroke: MUTED },
]

const outputs = [
  { x: 560, w: 144, name: 'HTML', tag: 'OUT', note: 'always', fill: SURFACE, stroke: MUTED },
  { x: 744, w: 144, name: 'CSS', tag: 'OUT', note: 'if styled', fill: 'rgba(243,240,234,0.03)', stroke: RULE, dashed: true },
  { x: 928, w: 144, name: 'JavaScript', tag: 'OUT', note: '0 B unless used', fill: ACCENT_TINT, stroke: ACCENT },
]

export function build() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="pipeline-title pipeline-desc">
  <title id="pipeline-title">How HyMarkX compiles a document</title>
  <desc id="pipeline-desc">A document is parsed by micromark tokenizer extensions into an AST where every node carries a source span, then compiled. HTML is always emitted; CSS is emitted only when the document is styled; JavaScript is zero bytes unless the document uses an interactive construct.</desc>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${MUTED}"/>
    </marker>
    <marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${ACCENT}"/>
    </marker>
  </defs>

  <rect width="100%" height="100%" fill="${PAPER}"/>

  <rect x="544" y="200" width="544" height="112" rx="8" fill="rgba(243,240,234,0.02)" stroke="${RULE}" stroke-width="0.8" stroke-dasharray="4,4"/>
  <rect x="556" y="204" width="104" height="12" rx="2" fill="${PAPER}"/>
  <text x="608" y="212" fill="${SOFT}" font-size="7" font-family="${MONO}" text-anchor="middle" letter-spacing="0.14em">PROPORTIONAL</text>

  <line x1="176" y1="${ROW + 32}" x2="232" y2="${ROW + 32}" stroke="${MUTED}" stroke-width="1.2" marker-end="url(#arrow)"/>
  <line x1="400" y1="${ROW + 32}" x2="456" y2="${ROW + 32}" stroke="${MUTED}" stroke-width="1.2" marker-end="url(#arrow)"/>
  <line x1="608" y1="${ROW + 32}" x2="664" y2="${ROW + 32}" stroke="${MUTED}" stroke-width="1.2" marker-end="url(#arrow)"/>

  <path d="M 708,128 V 172 Q 708,180 700,180 H 640 Q 632,180 632,188 V 224" fill="none" stroke="${MUTED}" stroke-width="1.2" marker-end="url(#arrow)"/>
  <path d="M 744,128 V 172 Q 744,180 752,180 H 808 Q 816,180 816,188 a 8,8 0 0,0 0,16 V 224" fill="none" stroke="${RULE}" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#arrow)"/>
  <path d="M 780,128 V 188 Q 780,196 788,196 H 992 Q 1000,196 1000,204 V 224" fill="none" stroke="${ACCENT}" stroke-width="1.2" marker-end="url(#arrow-accent)"/>

  ${label('ALWAYS', 668, 180)}
  ${label('IF STYLED', 780, 180)}
  ${label('IF INTERACTIVE', 888, 196)}

  ${chain.map((box) => node({ ...box, y: ROW })).join('\n  ')}
  ${outputs.map((box) => node({ ...box, y: 232 })).join('\n  ')}

  <text x="32" y="248" fill="${MUTED}" font-size="14" font-style="italic" font-family="${SERIF}">A document that uses no component</text>
  <text x="32" y="272" fill="${MUTED}" font-size="14" font-style="italic" font-family="${SERIF}">emits no component CSS. One with no</text>
  <text x="32" y="296" fill="${MUTED}" font-size="14" font-style="italic" font-family="${SERIF}">interactive construct emits no script.</text>

  <line x1="32" y1="328" x2="${WIDTH - 32}" y2="328" stroke="${RULE}" stroke-width="0.8"/>
  <text x="32" y="348" fill="${SOFT}" font-size="8" font-family="${MONO}" letter-spacing="0.14em">LEGEND</text>
  <line x1="128" y1="344" x2="160" y2="344" stroke="${MUTED}" stroke-width="1.2"/>
  <text x="168" y="348" fill="${MUTED}" font-size="8" font-family="${MONO}">ALWAYS EMITTED</text>
  <line x1="336" y1="344" x2="368" y2="344" stroke="${RULE}" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="376" y="348" fill="${MUTED}" font-size="8" font-family="${MONO}">EMITTED ONLY WHEN USED</text>
  <line x1="624" y1="344" x2="656" y2="344" stroke="${ACCENT}" stroke-width="1.2"/>
  <text x="664" y="348" fill="${ACCENT}" font-size="8" font-family="${MONO}">ZERO BYTES UNLESS USED</text>
</svg>
`

}

// Only writes when run directly, so the test can import `build()` without touching the disk.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const svg = build()
  writeFileSync(`${repositoryRoot}site/public/pipeline.svg`, svg, 'utf8')
  console.log(`pipeline.svg — ${svg.length} bytes`)
}
