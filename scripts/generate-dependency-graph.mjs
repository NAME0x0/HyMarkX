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
 * Drawn to the Diagram Design system: orthogonal connectors with rounded elbows, bridged
 * crossings, one accent element, a dashed boundary zone, a bottom legend strip, every
 * coordinate on a 4px grid. Two deliberate departures from that system, both because this SVG
 * is embedded in a GitHub README rather than served as its own page:
 *
 *   - Typography is system stacks, not Geist and Instrument Serif. GitHub sanitizes embedded
 *     SVG and will not fetch a webfont, so naming those families would quietly fall back to
 *     whatever the reader happens to have.
 *   - The palette is HyMarkX's own — the ink, slate and blue the compiler ships in its
 *     component styles — rather than the system's default tangerine. A diagram in this README
 *     should look like the thing it documents.
 *
 *   node scripts/generate-dependency-graph.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packagesDirectory = `${repositoryRoot}packages/`

/** Packages allowed to import the Markdown engine — the point ADR-0005 makes. */
const ENGINE = /^(?:micromark|mdast|hast|unist|remark|unified)/

const INK = '#172033'
const MUTED = '#526176'
const SOFT = '#7c8798'
const PAPER = '#f8fafc'
const RULE = '#cbd5e1'
const ACCENT = '#2563eb'
const ACCENT_TINT = '#eef4ff'

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const NODE_WIDTH = 160
const NODE_HEIGHT = 56
const COLUMN_GAP = 40
const ROW_GAP = 56
const PADDING = 32
const RADIUS = 8
// The diagram itself is narrower than its own legend and caption. Widening the canvas and
// centring the rows beats shrinking the type until the explanation stops being readable.
const MIN_WIDTH = 640
// 8px mono with 0.12em tracking. Used to size label masks from their text, because a mask
// narrower than its label lets the zone border show through the gap.
const MONO_CHAR = 5.6

/** Keeps every coordinate on the 4px grid the design system requires. */
function grid(value) {
  return Math.round(value / 4) * 4
}

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
        label: manifest.name.replace('@hymarkx/', ''),
        internal: dependencies.filter((dependency) => dependency.startsWith('@hymarkx/')),
        external: dependencies.filter((dependency) => !dependency.startsWith('@hymarkx/')),
        engine: dependencies.filter((dependency) => ENGINE.test(dependency)).length,
      }
    })
}

/**
 * Assigns each package to a row: one deeper than its deepest dependency.
 *
 * Computed rather than hardcoded so a new package lands in the right row without anyone editing
 * this file, and so a dependency that would create a cycle throws instead of drawing a loop.
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

/**
 * Drops edges another path already implies.
 *
 * `compiler` depends on `parser` and on `ast`, but `parser` depends on `ast` too — so drawing
 * `ast -> compiler` adds a line and no information. Eleven edges become eight and the picture
 * stops being a hairball. The caption says the reduction happened, because a reader would
 * otherwise fairly read a missing line as a missing dependency.
 */
function transitiveReduction(packages) {
  const byName = new Map(packages.map((entry) => [entry.name, entry]))

  const reachesWithoutDirectEdge = (from, target) => {
    const stack = byName.get(from).internal.filter((name) => name !== target)
    const seen = new Set()
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === target) {
        return true
      }
      if (seen.has(current)) {
        continue
      }
      seen.add(current)
      stack.push(...byName.get(current).internal)
    }
    return false
  }

  const edges = []
  for (const entry of packages) {
    for (const dependency of entry.internal) {
      if (!reachesWithoutDirectEdge(entry.name, dependency)) {
        edges.push({ from: dependency, to: entry.name })
      }
    }
  }
  return edges
}

/**
 * Routes one connector: down out of the source, across, and down into the destination.
 *
 * Rounded right-angle elbows only — a diagonal between two boxes that share neither an x nor a
 * y is the single clearest tell of a diagram that was generated rather than drawn. Where the
 * horizontal run crosses another connector's vertical drop, it hops over it, so no two lines
 * are ever laid on top of each other and every arrow stays traceable end to end.
 */
function connector(x1, y1, x2, y2, dropY, crossings) {
  if (x1 === x2) {
    return `M ${x1},${y1} V ${y2}`
  }

  const direction = x2 > x1 ? 1 : -1
  const step = direction * RADIUS
  const hops = crossings
    .filter((x) => Math.min(x1, x2) + RADIUS * 2 < x && x < Math.max(x1, x2) - RADIUS * 2)
    .sort((left, right) => (direction > 0 ? left - right : right - left))

  const segments = [
    `M ${x1},${y1}`,
    `V ${dropY - RADIUS}`,
    `Q ${x1},${dropY} ${x1 + step},${dropY}`,
  ]
  for (const crossing of hops) {
    segments.push(`H ${crossing - step}`)
    // rx=ry=8 semicircle advancing 16px along the run: a visible bump, not a kink.
    segments.push(`a ${RADIUS},${RADIUS} 0 0,${direction > 0 ? 1 : 0} ${direction * 16},0`)
  }
  segments.push(`H ${x2 - step}`, `Q ${x2},${dropY} ${x2},${dropY + RADIUS}`, `V ${y2}`)
  return segments.join(' ')
}

export function build() {
  const packages = manifests()
  const rows = layers(packages)
  const edges = transitiveReduction(packages)

  const columns = Math.max(...rows.map((row) => row.length))
  const width = Math.max(MIN_WIDTH, PADDING * 2 + columns * NODE_WIDTH + (columns - 1) * COLUMN_GAP)
  const diagramBottom = PADDING + rows.length * NODE_HEIGHT + (rows.length - 1) * ROW_GAP
  const legendY = diagramBottom + 44
  const height = legendY + 56

  const position = new Map()
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.length * NODE_WIDTH + (row.length - 1) * COLUMN_GAP
    const startX = grid((width - rowWidth) / 2)
    row.forEach((entry, columnIndex) => {
      position.set(entry.name, {
        x: startX + columnIndex * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + rowIndex * (NODE_HEIGHT + ROW_GAP),
        row: rowIndex,
      })
    })
  })

  const key = (edge) => `${edge.from}>${edge.to}`

  /**
   * Spreads attach points along a node edge instead of stacking them on the midpoint.
   *
   * Two connectors sharing one point on a box is the anti-pattern that makes a diagram
   * unreadable at the exact moment a reader is trying to follow a specific dependency: both
   * lines emerge from the same pixel and there is no way to tell which is which.
   */
  const fan = (groups) => {
    const points = new Map()
    for (const [, list] of groups) {
      list.forEach((edge, index) => {
        points.set(key(edge), (NODE_WIDTH * (index + 1)) / (list.length + 1))
      })
    }
    return points
  }

  const groupBy = (selector) => {
    const groups = new Map()
    for (const edge of edges) {
      const id = selector(edge)
      groups.set(id, [...(groups.get(id) ?? []), edge])
    }
    return groups
  }

  const exitOffsets = fan(groupBy((edge) => edge.from))
  const entryOffsets = fan(groupBy((edge) => edge.to))

  /**
   * Every connector leaving a row drops on its own y, spread evenly through the gap.
   *
   * The previous version stepped down 12px at a time from a fixed offset, which put the third
   * connector 8px above the next row — exactly the corner radius. The closing arc then consumed
   * the whole remaining drop, leaving a zero-length final segment. SVG orients `marker-end` off
   * the last segment with length, so the arrowhead pointed sideways along the horizontal run
   * instead of down into the box, and the elbow read as a hook.
   */
  const drops = new Map()
  for (const [row, list] of groupBy((edge) => position.get(edge.from).row)) {
    const bandTop = PADDING + row * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT
    list.forEach((edge, index) => {
      drops.set(key(edge), bandTop + grid((ROW_GAP * (index + 1)) / (list.length + 1)))
    })
  }

  // Both halves of every connector, so a horizontal run knows what it has to hop over: the
  // drop into a destination and the initial descent out of a source.
  const verticalRuns = edges.flatMap((edge) => {
    const from = position.get(edge.from)
    const to = position.get(edge.to)
    const dropY = drops.get(key(edge))
    return [
      { x: grid(to.x + entryOffsets.get(key(edge))), top: dropY, bottom: to.y },
      { x: grid(from.x + exitOffsets.get(key(edge))), top: from.y + NODE_HEIGHT, bottom: dropY },
    ]
  })

  const drawnEdges = edges
    .map((edge) => {
      const from = position.get(edge.from)
      const to = position.get(edge.to)
      const x1 = grid(from.x + exitOffsets.get(key(edge)))
      const x2 = grid(to.x + entryOffsets.get(key(edge)))
      const dropY = drops.get(key(edge))
      const crossings = verticalRuns
        .filter((run) => run.x !== x1 && run.x !== x2 && run.top < dropY && run.bottom > dropY)
        .map((run) => run.x)
      // The engine boundary is the diagram's one idea, so the edges touching the parser carry
      // the accent and everything else stays quiet.
      const focal = edge.from.endsWith('/parser') || edge.to.endsWith('/parser')
      const path = connector(x1, from.y + NODE_HEIGHT, x2, to.y, dropY, crossings)
      return (
        `    <path d="${path}" fill="none" stroke="${focal ? ACCENT : MUTED}" ` +
        `stroke-width="1.2" stroke-opacity="${focal ? '0.85' : '0.55'}" ` +
        `marker-end="url(#${focal ? 'arrow-accent' : 'arrow'})"/>`
      )
    })
    .join('\n')

  const parser = packages.find((entry) => entry.engine > 0)
  const anchor = position.get(parser.name)
  const zone = {
    x: anchor.x - 24,
    y: anchor.y - 32,
    width: NODE_WIDTH + 48,
    // Deliberately 8px shy of the first connector band below, which used to land exactly on
    // this border and read as the zone having a line through it.
    height: NODE_HEIGHT + 40,
  }

  const boxes = packages
    .map((entry) => {
      const { x, y } = position.get(entry.name)
      const focal = entry.engine > 0
      const centre = x + NODE_WIDTH / 2
      const note = focal ? `${entry.engine} engine deps` : `${entry.external.length} external`
      return [
        // Opaque mask first: without it a connector shows through the box fill.
        `    <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6" fill="${PAPER}"/>`,
        `    <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6" fill="${focal ? ACCENT_TINT : '#ffffff'}" stroke="${focal ? ACCENT : RULE}" stroke-width="${focal ? '1.6' : '1'}"/>`,
        `    <text x="${centre}" y="${y + 26}" fill="${INK}" font-size="13" font-weight="600" font-family="${SANS}" text-anchor="middle">${entry.label}</text>`,
        `    <text x="${centre}" y="${y + 42}" fill="${focal ? ACCENT : SOFT}" font-size="9" font-family="${MONO}" text-anchor="middle">${note}</text>`,
      ].join('\n')
    })
    .join('\n')

  const legendItems = [
    { label: 'REACHES THE ENGINE', swatch: 'zone' },
    { label: 'DEPENDS ON', swatch: 'line' },
    { label: 'IMPLIED, NOT DRAWN', swatch: 'dashed' },
  ]
  const legend = legendItems
    .map((item, index) => {
      const x = PADDING + index * 192
      const swatch =
        item.swatch === 'zone'
          ? `<rect x="${x}" y="${legendY - 9}" width="14" height="10" rx="2" fill="${ACCENT_TINT}" stroke="${ACCENT}" stroke-width="1.2"/>`
          : `<line x1="${x}" y1="${legendY - 4}" x2="${x + 14}" y2="${legendY - 4}" stroke="${MUTED}" stroke-width="1.2"${item.swatch === 'dashed' ? ' stroke-dasharray="3,3"' : ''}/>`
      return [
        `    ${swatch}`,
        `    <text x="${x + 22}" y="${legendY}" fill="${MUTED}" font-size="8" font-family="${MONO}" letter-spacing="0.1em">${item.label}</text>`,
      ].join('\n')
    })
    .join('\n')

  const zoneLabel = 'MARKDOWN ENGINE / ADR-0005'

  const description =
    `Dependency graph of the ${packages.length} HyMarkX packages in ${rows.length} layers, from ` +
    'ast at the top through parser, compiler and formatter to the hymarkx installer at the ' +
    'bottom. Only the parser package carries Markdown engine dependencies, and it sits inside a ' +
    'boundary marking that rule.'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="hmx-deps-title hmx-deps-desc">
  <title id="hmx-deps-title">HyMarkX package dependencies</title>
  <desc id="hmx-deps-desc">${description}</desc>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${MUTED}" fill-opacity="0.55"/>
    </marker>
    <marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${ACCENT}" fill-opacity="0.85"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${PAPER}"/>

  <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}" rx="8" fill="${ACCENT}" fill-opacity="0.04" stroke="${ACCENT}" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="4,4"/>
  <rect x="${zone.x + 12}" y="${zone.y - 7}" width="${grid(zoneLabel.length * MONO_CHAR + 12)}" height="14" fill="${PAPER}"/>
  <text x="${zone.x + 18}" y="${zone.y + 4}" fill="${ACCENT}" font-size="8" font-family="${MONO}" letter-spacing="0.12em">${zoneLabel}</text>

  <g>
${drawnEdges}
  </g>

${boxes}

  <line x1="${PADDING}" y1="${legendY - 24}" x2="${width - PADDING}" y2="${legendY - 24}" stroke="${RULE}" stroke-width="0.8"/>
${legend}
  <text x="${PADDING}" y="${legendY + 22}" fill="${SOFT}" font-size="9" font-family="${SANS}">Arrows point to the packages that depend on each box.</text>
  <text x="${PADDING}" y="${legendY + 36}" fill="${SOFT}" font-size="9" font-family="${SANS}">Dependencies another path already implies are left out, so every line carries information.</text>
</svg>
`
}

// Only when run as a script. The drift test imports `build`, and a module-scope write would
// rewrite the committed file before the test read it — the comparison would then always pass,
// which is the failure mode that test exists to prevent.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const svg = build()
  const path = fileURLToPath(new URL('../assets/dependency-graph.svg', import.meta.url))
  writeFileSync(path, svg, 'utf8')
  console.log(`wrote ${path} (${Buffer.byteLength(svg)} bytes)`)
}
