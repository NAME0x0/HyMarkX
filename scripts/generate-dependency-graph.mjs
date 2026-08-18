/**
 * Draws the workspace dependency graph from the manifests, not from a hand-kept diagram.
 *
 * A diagram nobody regenerates becomes a claim about an older version of the code, and this one
 * illustrates ADR-0005 — only `@hymarkx/parser` may reach the Markdown engine — so a stale
 * picture would misrepresent the architecture's load-bearing rule.
 *
 * `tests/assets/dependency-graph-svg.test.mjs` regenerates it and compares bytes, so adding a
 * dependency without redrawing fails the build.
 *
 *   node scripts/generate-dependency-graph.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packagesDirectory = `${repositoryRoot}packages/`

/** Packages allowed to import the Markdown engine — the point ADR-0005 makes. */
const ENGINE = /^(?:micromark|mdast|hast|unist|remark|unified)/

function manifests() {
  return readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifest = JSON.parse(
        readFileSync(`${packagesDirectory}${entry.name}/package.json`, 'utf8'),
      )
      const dependencies = Object.keys(manifest.dependencies ?? {})
      return {
        id: entry.name,
        name: manifest.name,
        internal: dependencies.filter((dependency) => dependency.startsWith('@hymarkx/')),
        external: dependencies.filter((dependency) => !dependency.startsWith('@hymarkx/')),
        engine: dependencies.filter((dependency) => ENGINE.test(dependency)).length,
      }
    })
}

/**
 * Assigns each package to a row: one deeper than its deepest dependency.
 *
 * Computed rather than hardcoded so a new package lands in the right row without anyone
 * editing this file, and so a dependency that would create a cycle shows up as a thrown error
 * instead of a drawing that quietly loops.
 */
function layers(packages) {
  const byName = new Map(packages.map((entry) => [entry.name, entry]))
  const depth = new Map()

  const resolve = (entry, seen = new Set()) => {
    if (depth.has(entry.name)) {
      return depth.get(entry.name)
    }
    if (seen.has(entry.name)) {
      throw new Error(`Dependency cycle through ${entry.name}`)
    }
    seen.add(entry.name)
    const value = entry.internal.length
      ? 1 + Math.max(...entry.internal.map((name) => resolve(byName.get(name), seen)))
      : 0
    depth.set(entry.name, value)
    return value
  }

  for (const entry of packages) {
    resolve(entry)
  }

  const rows = []
  for (const entry of packages) {
    const row = depth.get(entry.name)
    rows[row] ??= []
    rows[row].push(entry)
  }
  // Stable order inside a row, so regenerating an unchanged tree produces identical bytes.
  return rows.map((row) => [...row].sort((left, right) => left.id.localeCompare(right.id)))
}

const BOX_WIDTH = 190
const BOX_HEIGHT = 54
const GAP_X = 26
const GAP_Y = 58
const PADDING = 24

function build() {
  const packages = manifests()
  const rows = layers(packages)
  const columns = Math.max(...rows.map((row) => row.length))
  const width = PADDING * 2 + columns * BOX_WIDTH + (columns - 1) * GAP_X
  const height = PADDING * 2 + rows.length * BOX_HEIGHT + (rows.length - 1) * GAP_Y + 40

  const position = new Map()
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.length * BOX_WIDTH + (row.length - 1) * GAP_X
    const startX = (width - rowWidth) / 2
    row.forEach((entry, columnIndex) => {
      position.set(entry.name, {
        x: startX + columnIndex * (BOX_WIDTH + GAP_X),
        y: PADDING + rowIndex * (BOX_HEIGHT + GAP_Y),
      })
    })
  })

  const edges = []
  for (const entry of packages) {
    const to = position.get(entry.name)
    for (const dependency of entry.internal) {
      const from = position.get(dependency)
      const x1 = from.x + BOX_WIDTH / 2
      const y1 = from.y + BOX_HEIGHT
      const x2 = to.x + BOX_WIDTH / 2
      const y2 = to.y
      const midpoint = (y1 + y2) / 2
      edges.push(
        `    <path d="M ${x1} ${y1} C ${x1} ${midpoint}, ${x2} ${midpoint}, ${x2} ${y2 - 7}" />`,
      )
    }
  }

  const boxes = packages
    .map((entry) => {
      const { x, y } = position.get(entry.name)
      const label = entry.name.replace('@hymarkx/', '')
      // Always the external count, never "no dependencies": these packages depend on each
      // other, which is what the arrows show, so "no dependencies" on a box with an arrow into
      // it reads as a contradiction. The engine count is called out separately because exactly
      // one box is allowed to carry it, which is the point of the diagram.
      const note = entry.engine
        ? `${entry.engine} engine deps`
        : `${entry.external.length} external`
      return [
        `    <g class="${entry.engine ? 'node engine' : 'node'}">`,
        `      <rect x="${x}" y="${y}" width="${BOX_WIDTH}" height="${BOX_HEIGHT}" rx="8" />`,
        `      <text class="name" x="${x + BOX_WIDTH / 2}" y="${y + 22}">${label}</text>`,
        `      <text class="note" x="${x + BOX_WIDTH / 2}" y="${y + 40}">${note}</text>`,
        '    </g>',
      ].join('\n')
    })
    .join('\n')

  // ASCII only. The SVG is served as a raw file by GitHub and by anything embedding it, and a
  // UTF-8 em dash rendered as mojibake when the encoding was not honoured. The XML declaration
  // below states the encoding; keeping the text ASCII means it does not have to be believed.
  const caption = [
    'Arrows point to the packages that depend on each box.',
    'Only @hymarkx/parser may reach the Markdown engine (ADR-0005).',
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="HyMarkX workspace dependency graph">
  <title>HyMarkX workspace dependency graph</title>
  <desc>${packages.length} packages. ${caption.join(' ')}</desc>
  <style>
    .node rect { fill: #ffffff; stroke: #d0d7de; stroke-width: 1.5; }
    .node.engine rect { stroke: #8250df; stroke-width: 2.5; }
    .name { font: 600 14px ui-monospace, SFMono-Regular, Menlo, monospace; fill: #1f2328; text-anchor: middle; }
    .note { font: 400 11px ui-sans-serif, system-ui, sans-serif; fill: #656d76; text-anchor: middle; }
    .edge { fill: none; stroke: #8c959f; stroke-width: 1.5; marker-end: url(#arrow); }
    .caption { font: 400 11px ui-sans-serif, system-ui, sans-serif; fill: #656d76; text-anchor: middle; }
    @media (prefers-color-scheme: dark) {
      .node rect { fill: #161b22; stroke: #30363d; }
      .node.engine rect { stroke: #a371f7; }
      .name { fill: #e6edf3; }
      .note, .caption { fill: #8b949e; }
      .edge { stroke: #6e7681; }
    }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8c959f" />
    </marker>
  </defs>
  <g class="edge">
${edges.join('\n')}
  </g>
${boxes}
  <text class="caption" x="${width / 2}" y="${height - 22}">${caption[0]}</text>
  <text class="caption" x="${width / 2}" y="${height - 8}">${caption[1]}</text>
</svg>
`
}

export { build }

// Only when run as a script. The drift test imports `build`, and a module-scope write would
// rewrite the committed file before the test read it — the comparison would then always pass,
// which is the failure mode this test exists to prevent.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const svg = build()
  const path = fileURLToPath(new URL('../assets/dependency-graph.svg', import.meta.url))
  writeFileSync(path, svg, 'utf8')
  console.log(`wrote ${path} (${Buffer.byteLength(svg)} bytes)`)
}
