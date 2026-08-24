/**
 * The playground.
 *
 * `@hymarkx/compiler` has no Node dependencies — ADR-0005 confines those to the CLI and the
 * language server, and `scripts/check-boundaries.mjs` enforces it — so the actual compiler runs
 * here, in the reader's browser. Nothing is sent anywhere and there is no server involved.
 *
 * It compiles in `document` trust, the mode a host uses for content it did not write, because
 * that is exactly what a playground is handling.
 */
import { compile, renderDiagnostics } from '@hymarkx/compiler'

const STARTER = `---
title: Release notes
quarter: Q3
---

# {{ title }}

:::note[Heads up]{type=warning}
Deployment starts at 8 PM UTC.
:::

Shipping in **{{ quarter }}**.

::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Clicked {{ count }} times.
`

/** Base64url, so a document survives a URL without needing escaping. */
function encode(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decode(value) {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

/**
 * Real gzip sizes, measured rather than estimated.
 *
 * `CompressionStream` is what the browser itself uses, so the number matches what a server
 * would send. Where it is missing the raw byte count is shown instead and labelled as such,
 * because a wrong number is worse than a coarser one.
 */
async function gzipSize(text) {
  // Zero is the answer, not a missing one. "JS — " reads as "unknown"; "JS 0 B" is the claim
  // this page exists to make, so an empty output must say so.
  if (text === '') {
    return 0
  }
  if (typeof CompressionStream === 'undefined') {
    return undefined
  }
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(stream).arrayBuffer()
  return buffer.byteLength
}

function bytes(value) {
  if (value === undefined) {
    return '—'
  }
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} kB`
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function Play(root) {
  // An absent hash decodes to an empty string rather than to undefined, so `??` alone left the
  // editor blank on a first visit — the one case that matters most.
  const shared = location.hash.slice(1)
  const source = shared === '' ? STARTER : (decode(shared) ?? STARTER)

  const editor = element('textarea', 'play-editor')
  editor.value = source
  editor.spellcheck = false
  editor.setAttribute('aria-label', 'HyMarkX source')

  const tabs = element('div', 'play-tabs')
  tabs.setAttribute('role', 'tablist')
  const output = element('div', 'play-output')
  const diagnostics = element('div', 'play-diagnostics')
  const meter = element('div', 'play-meter')

  const panels = {
    Preview: element('iframe', 'play-preview'),
    HTML: element('pre', 'play-code'),
    CSS: element('pre', 'play-code'),
    JS: element('pre', 'play-code'),
  }
  // No same-origin, so the compiled document cannot reach this page even if something in it
  // tried. Scripts are allowed because the emitted runtime is the point of the preview.
  panels.Preview.setAttribute('sandbox', 'allow-scripts')
  panels.Preview.setAttribute('title', 'Rendered output')

  let active = 'Preview'
  const buttons = new Map()
  for (const name of Object.keys(panels)) {
    const button = element('button', 'play-tab', name)
    button.type = 'button'
    button.setAttribute('role', 'tab')
    button.addEventListener('click', () => select(name))
    buttons.set(name, button)
    tabs.append(button)
    output.append(panels[name])
  }

  function select(name) {
    active = name
    for (const [key, button] of buttons) {
      button.dataset.active = String(key === name)
      button.setAttribute('aria-selected', String(key === name))
      panels[key].hidden = key !== name
    }
  }
  select(active)

  let queued
  async function run() {
    const text = editor.value
    let result
    try {
      result = compile(text, { trust: 'document', from: 'playground.hmx' })
    } catch (error) {
      diagnostics.textContent = `The compiler threw: ${error instanceof Error ? error.message : String(error)}`
      diagnostics.dataset.state = 'error'
      return
    }

    panels.HTML.textContent = result.html || '(nothing)'
    panels.CSS.textContent = result.css || '(no CSS — nothing used one)'
    panels.JS.textContent = result.js || '(no JavaScript — nothing needed any)'

    // The runtime and styles are inlined so the preview is one self-contained document.
    panels.Preview.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;color:#f3f0ea;background:#101017;margin:0;padding:20px}${result.css}</style>${result.html}<script>${result.js}<\/script>`

    const errors = result.diagnostics.filter(({ severity }) => severity === 'error')
    if (result.diagnostics.length === 0) {
      diagnostics.textContent = 'No diagnostics.'
      delete diagnostics.dataset.state
    } else {
      // The compiler's own renderer, not a summary of it: the frame here is character for
      // character what `hmx check` prints in a terminal, which is the point of having one.
      diagnostics.textContent = renderDiagnostics(result.diagnostics, text, {
        from: 'playground.hmx',
      })
      diagnostics.dataset.state = errors.length > 0 ? 'error' : 'warning'
    }

    const [html, css, js] = await Promise.all([
      gzipSize(result.html),
      gzipSize(result.css),
      gzipSize(result.js),
    ])
    meter.replaceChildren(
      measure('HTML', html),
      measure('CSS', css),
      measure('JS', js),
      measure('Total', [html, css, js].reduce((sum, part) => sum + (part ?? 0), 0)),
    )

    // Replace rather than push: a playground should not fill the back button with keystrokes.
    history.replaceState(null, '', `#${encode(text)}`)
  }

  function measure(label, value) {
    const cell = element('div', 'play-measure')
    cell.append(element('span', 'play-measure-label', label), element('strong', undefined, bytes(value)))
    return cell
  }

  editor.addEventListener('input', () => {
    clearTimeout(queued)
    queued = setTimeout(run, 160)
  })

  const left = element('div', 'play-pane')
  left.append(element('div', 'play-pane-title', 'You write'), editor)
  const right = element('div', 'play-pane')
  right.append(element('div', 'play-pane-title', 'HyMarkX emits'), tabs, output, meter, diagnostics)

  root.append(left, right)
  void run()

  return () => {
    clearTimeout(queued)
    root.replaceChildren()
  }
}
