/**
 * Generates assets/evolution.svg from real compiler output.
 *
 * Every string, colour and byte count in the finished graphic comes from compiling the
 * documents below with the actual toolchain. Nothing is drawn from imagination: if the
 * compiler changes, re-running this script changes the picture.
 *
 *   node scripts/generate-evolution-svg.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compile } from '../packages/compiler/dist/index.js'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

/** The progression the language is trying to make possible, one document per step. */
const STAGES = [
  {
    title: 'Plain text',
    caption: 'Just words. Already a valid document.',
    source: 'Quarterly revenue reached $42,500.\nUsers grew to 14,302.\n',
  },
  {
    title: 'Markdown',
    caption: 'Structure, with nothing new to learn.',
    source:
      '# Dashboard\n\n## Revenue\n\n$42,500 this month.\n\n- Users: 14,302\n- Growth: +18.4%\n',
  },
  {
    title: '+ Components',
    caption: 'Directives, not JSX. Still no JavaScript.',
    source:
      '::::grid{columns=2}\n\n:::metric[Revenue]\n$42,500\n:::\n\n:::metric[Users]\n14,302\n:::\n\n::::\n\n:::note[Heads up]{type=warning}\nFigures are preliminary.\n:::\n',
  },
  {
    title: '+ Styling',
    caption: 'Scoped CSS. Emitted only for what you used.',
    source:
      '<style scoped>\n.hmx-metric { border-block-start: 3px solid #2563eb; }\n</style>\n\n::::grid{columns=2}\n\n:::metric[Revenue]\n$42,500\n:::\n\n:::metric[Users]\n14,302\n:::\n\n::::\n',
  },
  {
    title: '+ Interactivity',
    caption: 'Native state and events. A working page.',
    source:
      '::state{count=14302}\n\n:::metric[Users]\n{{ count }}\n:::\n\n:::button{on-click="count = count + 1"}\nAdd user\n:::\n',
  },
]

const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Reads a design token out of the stylesheet the compiler actually emitted. */
function token(css, name, fallback) {
  return new RegExp(`--hmx-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? fallback
}

/**
 * Turns emitted HTML into drawable blocks.
 *
 * Regex over our own deterministic output rather than a DOM library: the shapes we need are
 * headings, paragraphs, list items, metrics, notes and buttons, and every one of them is
 * emitted by code in this repository.
 */
function blocksFrom(html) {
  const blocks = []
  const push = (kind, text, tone) =>
    blocks.push({ kind, text: text.replace(/<[^>]+>/g, '').trim(), tone })

  // Every pattern tolerates extra attributes: scoped styling adds `data-hmx-s-…` to each
  // element, which silently emptied the styled frame when these were written as `<p>`.
  const lastParagraph = (fragment) =>
    ([...fragment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].at(-1)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .trim()

  for (const match of html.matchAll(
    /<(h1|h2|li)\b[^>]*>([\s\S]*?)<\/\1>|<div class="hmx-metric"[^>]*>([\s\S]*?)<\/div>|<aside class="hmx-note hmx-note-(\w+)"[^>]*>([\s\S]*?)<\/aside>|<button\b[^>]*>([\s\S]*?)<\/button>|<p\b[^>]*>([\s\S]*?)<\/p>/g,
  )) {
    const [, tag, tagged, metric, tone, note, button, paragraph] = match
    if (tag !== undefined) {
      push(tag, tagged ?? '')
    } else if (metric !== undefined) {
      const label = /class="hmx-metric-label"[^>]*>([\s\S]*?)</.exec(metric)?.[1] ?? ''
      blocks.push({ kind: 'metric', text: lastParagraph(metric), label: label.trim() })
    } else if (note !== undefined) {
      const title = /class="hmx-note-title"[^>]*>([\s\S]*?)</.exec(note)?.[1] ?? ''
      blocks.push({ kind: 'note', text: lastParagraph(note), label: title.trim(), tone })
    } else if (button !== undefined) {
      push('button', button)
    } else if (paragraph !== undefined) {
      push('p', paragraph)
    }
  }
  return blocks
}

/** Draws one preview block as SVG, using colours from the emitted stylesheet. */
function drawBlock(block, y, palette) {
  const x = 476
  switch (block.kind) {
    case 'h1':
      return {
        svg: `<text x="${x}" y="${y + 16}" class="r-h1">${escapeXml(block.text)}</text>`,
        height: 34,
      }
    case 'h2':
      return {
        svg: `<text x="${x}" y="${y + 13}" class="r-h2">${escapeXml(block.text)}</text>`,
        height: 26,
      }
    case 'li':
      return {
        svg: `<circle cx="${x + 4}" cy="${y + 7}" r="2" class="r-dot"/><text x="${x + 14}" y="${y + 11}" class="r-p">${escapeXml(block.text)}</text>`,
        height: 20,
      }
    case 'metric':
      return {
        svg: `<rect x="${x}" y="${y}" width="180" height="52" rx="6" class="r-card"/>
      <text x="${x + 12}" y="${y + 20}" class="r-label">${escapeXml(block.label ?? '')}</text>
      <text x="${x + 12}" y="${y + 40}" class="r-value">${escapeXml(block.text)}</text>`,
        height: 60,
        inline: true,
      }
    case 'note':
      return {
        svg: `<rect x="${x}" y="${y}" width="376" height="50" rx="6" class="r-card"/>
      <rect x="${x}" y="${y}" width="376" height="3" rx="1.5" fill="${palette.warning}"/>
      <text x="${x + 12}" y="${y + 22}" class="r-label" fill="${palette.warning}">${escapeXml(block.label ?? '')}</text>
      <text x="${x + 12}" y="${y + 39}" class="r-p">${escapeXml(block.text)}</text>`,
        height: 58,
      }
    case 'button': {
      // Sized to its label rather than fixed at 104px, which left "Add user" floating in 27px of
      // padding on each side and reading as a stretched box rather than a button.
      //
      // 6.4px per character approximates 12px system sans — measured against the real glyph run,
      // which came out at 6.2. Erring high keeps a longer label off the edges, and the 72px floor
      // stops a two-letter label collapsing into a square.
      const width = Math.max(72, Math.round((block.text.length * 6.4 + 32) / 4) * 4)
      return {
        svg: `<rect x="${x}" y="${y}" width="${width}" height="28" rx="6" fill="${palette.info}"/>
      <text x="${x + width / 2}" y="${y + 18}" class="r-btn" text-anchor="middle">${escapeXml(block.text)}</text>`,
        height: 38,
      }
    }
    default:
      return {
        svg: `<text x="${x}" y="${y + 11}" class="r-p">${escapeXml(block.text)}</text>`,
        height: 22,
      }
  }
}

function renderPreview(blocks, palette) {
  let y = 96
  let inlineX = 0
  const parts = []
  for (const block of blocks) {
    let drawn = drawBlock(block, y, palette)
    // Closing an inline row moves `y` down, so anything that follows has to be drawn again at
    // the new position. Drawing first and advancing afterwards put the button on top of the
    // metric card it should have sat below.
    if (drawn.inline !== true && inlineX > 0) {
      inlineX = 0
      y += 60
      drawn = drawBlock(block, y, palette)
    }
    if (drawn.inline === true) {
      parts.push(
        drawn.svg
          .replaceAll(`x="476"`, `x="${476 + inlineX}"`)
          .replaceAll(`x="488"`, `x="${488 + inlineX}"`),
      )
      inlineX += 196
      if (inlineX >= 392) {
        inlineX = 0
        y += drawn.height
      }
      continue
    }
    parts.push(drawn.svg)
    y += drawn.height
  }
  return parts.join('\n      ')
}

function renderSource(source) {
  return source
    .split('\n')
    .slice(0, 14)
    .map((line, index) => {
      const y = 100 + index * 17
      const classed = line
        .replace(/^(:{2,}[A-Za-z0-9_-]*)/, '<tspan class="s-dir">$1</tspan>')
        .replace(/(\{[^}]*\})/g, '<tspan class="s-attr">$1</tspan>')
        .replace(/(\{\{[^}]*\}\})/g, '<tspan class="s-expr">$1</tspan>')
        .replace(/^(#{1,6} .*)$/, '<tspan class="s-head">$1</tspan>')
        .replace(/^(&lt;style scoped&gt;|&lt;\/style&gt;)/, '<tspan class="s-tag">$1</tspan>')
      return `<text x="44" y="${y}" class="src">${
        classed === line
          ? escapeXml(line)
          : classed
              .replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;')
              .replaceAll('<style', '&lt;style')
              .replaceAll('</style>', '&lt;/style&gt;')
      }</text>`
    })
    .join('\n      ')
}

const compiled = STAGES.map((stage) => {
  const result = compile(stage.source, { trust: 'app' })
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`${stage.title} does not compile: ${errors.map((e) => e.code).join(', ')}`)
  }
  return { ...stage, result }
})

const palette = {
  surface: token(compiled.at(-1).result.css, 'color-surface', '#f8fafc'),
  text: token(compiled.at(-1).result.css, 'color-text', '#172033'),
  muted: token(compiled.at(-1).result.css, 'color-muted', '#526176'),
  border: token(compiled.at(-1).result.css, 'color-border', '#cbd5e1'),
  info: token(compiled.at(-1).result.css, 'color-info', '#2563eb'),
  warning: token(compiled.at(-1).result.css, 'color-warning', '#b45309'),
}

const SECONDS = 3.4
const total = (SECONDS * compiled.length).toFixed(1)

const frames = compiled
  .map((stage, index) => {
    const bytes = (value) => new TextEncoder().encode(value).length
    const html = bytes(stage.result.html)
    const css = bytes(stage.result.css)
    const js = bytes(stage.result.js)
    return `  <g class="stage" style="animation-delay:${(index * SECONDS).toFixed(1)}s">
      <text x="44" y="58" class="title">${escapeXml(stage.title)}</text>
      <text x="44" y="78" class="caption">${escapeXml(stage.caption)}</text>
      ${renderSource(stage.source)}
      ${renderPreview(blocksFrom(stage.result.html), palette)}
      <text x="44" y="470" class="meter">HTML ${html} B</text>
      <text x="150" y="470" class="meter">CSS ${css} B</text>
      <text x="240" y="470" class="meter ${js === 0 ? 'zero' : 'live'}">JS ${js} B</text>
    </g>`
  })
  .join('\n')

// The XML declaration is not decoration. Without it a browser handed this file raw — which is
// exactly how GitHub serves an image referenced from a README — may fall back to latin-1 and
// render any non-ASCII character as mojibake. The middle dot in the strapline did precisely
// that, arriving as "Å·".
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 500" width="900" height="500" role="img" aria-label="HyMarkX: the same document from plain text to a working page">
  <title>HyMarkX — plain text to a working page</title>
  <desc>Generated from real compiler output by scripts/generate-evolution-svg.mjs. Source, rendered preview and byte counts all come from compiling each document with the HyMarkX toolchain.</desc>
  <style>
    .bg { fill: #0b1120; }
    .panel { fill: #111a2e; }
    .preview { fill: ${palette.surface}; }
    .chrome { fill: #1e293b; }
    .dot1 { fill: #f87171; } .dot2 { fill: #fbbf24; } .dot3 { fill: #4ade80; }
    text { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
    .title { fill: #e2e8f0; font-size: 17px; font-weight: 600; font-family: ui-sans-serif, system-ui, sans-serif; }
    .caption { fill: #64748b; font-size: 12px; font-family: ui-sans-serif, system-ui, sans-serif; }
    .src { fill: #94a3b8; font-size: 12.5px; white-space: pre; }
    .s-dir { fill: #f472b6; } .s-attr { fill: #fbbf24; } .s-expr { fill: #4ade80; }
    .s-head { fill: #93c5fd; } .s-tag { fill: #c084fc; }
    .r-h1 { fill: ${palette.text}; font-size: 19px; font-weight: 700; font-family: ui-sans-serif, system-ui, sans-serif; }
    .r-h2 { fill: ${palette.text}; font-size: 14px; font-weight: 600; font-family: ui-sans-serif, system-ui, sans-serif; }
    .r-p { fill: ${palette.text}; font-size: 12px; font-family: ui-sans-serif, system-ui, sans-serif; }
    .r-label { fill: ${palette.muted}; font-size: 10.5px; font-family: ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; }
    .r-value { fill: ${palette.text}; font-size: 17px; font-weight: 700; font-family: ui-sans-serif, system-ui, sans-serif; }
    .r-btn { fill: #ffffff; font-size: 12px; font-family: ui-sans-serif, system-ui, sans-serif; }
    .r-dot { fill: ${palette.muted}; }
    .r-card { fill: #ffffff; stroke: ${palette.border}; stroke-width: 1; }
    .meter { fill: #475569; font-size: 11px; }
    .meter.zero { fill: #4ade80; }
    .meter.live { fill: #fbbf24; }
    .footer { fill: #334155; font-size: 11px; font-family: ui-sans-serif, system-ui, sans-serif; }
    .stage { opacity: 0; animation: cycle ${total}s infinite; }
    @keyframes cycle {
      0%      { opacity: 0; transform: translateY(6px); }
      2%, 18% { opacity: 1; transform: translateY(0); }
      20%     { opacity: 0; transform: translateY(-6px); }
      100%    { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .stage { animation: none; }
      .stage:last-of-type { opacity: 1; }
    }
  </style>

  <rect class="bg" width="900" height="500" rx="12"/>
  <rect class="panel" x="24" y="34" width="404" height="424" rx="10"/>
  <rect class="preview" x="452" y="34" width="424" height="424" rx="10"/>
  <rect class="chrome" x="452" y="34" width="424" height="26" rx="10"/>
  <rect class="chrome" x="452" y="48" width="424" height="12"/>
  <circle class="dot1" cx="470" cy="47" r="4"/>
  <circle class="dot2" cx="484" cy="47" r="4"/>
  <circle class="dot3" cx="498" cy="47" r="4"/>

${frames}

  <text x="24" y="20" class="title" style="font-size:14px">HyMarkX</text>
  <text x="110" y="20" class="footer">start writing · add capability only when you need it</text>
  <text x="876" y="20" class="footer" text-anchor="end">every frame generated from real compiler output</text>
</svg>
`

mkdirSync(`${repositoryRoot}assets`, { recursive: true })
writeFileSync(`${repositoryRoot}assets/evolution.svg`, svg)

for (const stage of compiled) {
  const bytes = (value) => new TextEncoder().encode(value).length
  console.log(
    `${stage.title.padEnd(16)} html ${String(bytes(stage.result.html)).padStart(4)} B  css ${String(bytes(stage.result.css)).padStart(5)} B  js ${String(bytes(stage.result.js)).padStart(4)} B`,
  )
}
console.log(`\nwrote assets/evolution.svg (${(svg.length / 1024).toFixed(1)} KB)`)
