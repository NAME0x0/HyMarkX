/**
 * The playground.
 *
 * `@hymarkx/compiler` has no Node dependencies — ADR-0005 confines those to the CLI and the
 * language server, and `scripts/check-boundaries.mjs` enforces it — so the actual compiler runs
 * here, in the reader's browser. Nothing is sent anywhere and there is no server involved.
 *
 * It compiles in `document` trust, the mode a host uses for content it did not write, because
 * that is exactly what a playground is handling.
 *
 * Shaped like an editor rather than like a page: a title bar naming the file, a source pane, a
 * tab strip whose tabs carry the size of the artefact behind them, one scroll container per
 * panel, and a status bar with a problems drawer. Two reasons beyond familiarity. A panel that
 * grows with its content pushed the page down every keystroke and stacked a second scrollbar
 * inside the first; and the sizes are the point of this page, so they belong on the tabs where
 * they are read as you switch rather than in a strip below the fold.
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
 * would send. Where it is missing the size is reported as unknown rather than guessed, because
 * a wrong number is worse than a missing one.
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

/**
 * Renders code one element per line so the gutter can number it.
 *
 * A CSS counter does the numbering, which keeps the digits unselectable — copying out of this
 * panel should give back the code, not the code with a number welded onto every line.
 */
function codeLines(target, text) {
  target.replaceChildren(
    ...text.split('\n').map((line) => element('span', 'ide-line', line === '' ? ' ' : line)),
  )
}

export function Play(root) {
  // An absent hash decodes to an empty string rather than to undefined, so `??` alone left the
  // editor blank on a first visit — the one case that matters most.
  const shared = location.hash.slice(1)

  const editor = element('textarea', 'ide-editor')
  editor.value = shared === '' ? STARTER : (decode(shared) ?? STARTER)
  editor.spellcheck = false
  editor.setAttribute('aria-label', 'HyMarkX source')

  const preview = element('iframe', 'ide-panel ide-preview')
  // No same-origin, so the compiled document cannot reach this page even if something in it
  // tried. Scripts are allowed because the emitted runtime is the point of the preview.
  preview.setAttribute('sandbox', 'allow-scripts')
  preview.setAttribute('title', 'Rendered output')

  /** Each artefact gets a panel, a tab, and a size that goes on the tab. */
  const outputs = [
    { name: 'Preview', panel: preview },
    { name: 'HTML', code: element('code'), empty: 'Nothing was emitted.' },
    { name: 'CSS', code: element('code'), empty: 'No CSS. Nothing in this document used any.' },
    { name: 'JS', code: element('code'), empty: 'No JavaScript. Nothing in this document needed any.' },
  ]

  const tabs = element('div', 'ide-tabs')
  tabs.setAttribute('role', 'tablist')
  const panels = element('div', 'ide-panels')

  for (const output of outputs) {
    if (output.code !== undefined) {
      output.pre = element('pre', 'ide-code')
      output.pre.append(output.code)
      output.note = element('p', 'ide-empty', output.empty)
      output.panel = element('div', 'ide-panel')
      output.panel.append(output.pre, output.note)
    }
    panels.append(output.panel)

    output.tab = element('button', 'ide-tab')
    output.tab.type = 'button'
    output.tab.setAttribute('role', 'tab')
    output.tab.append(element('span', 'ide-tab-name', output.name))
    output.size = element('span', 'ide-tab-size')
    output.tab.append(output.size)
    output.tab.addEventListener('click', () => select(output.name))
    tabs.append(output.tab)
  }

  // Copies whichever artefact is on screen. Host code, because a document cannot reach the
  // clipboard (ADR-0004) — the same reason the copy buttons on every other page here are.
  const copy = element('button', 'ide-copy', 'Copy')
  copy.type = 'button'
  copy.addEventListener('click', async () => {
    const active = outputs.find((output) => output.tab.dataset.active === 'true')
    if (active?.code === undefined) {
      return
    }
    try {
      await navigator.clipboard.writeText(active.code.textContent)
      copy.textContent = 'Copied'
      setTimeout(() => (copy.textContent = 'Copy'), 1400)
    } catch {
      copy.textContent = 'Select and copy'
      setTimeout(() => (copy.textContent = 'Copy'), 1400)
    }
  })
  // Emitted HTML is one long line per block, so the choice between reading a line and reading
  // the shape of the output is a real one. The gutter survives either way: a wrapped line is
  // still one element, so it still gets one number.
  const wrap = element('button', 'ide-copy', 'Wrap')
  wrap.type = 'button'
  wrap.setAttribute('aria-pressed', 'false')
  wrap.addEventListener('click', () => {
    const on = wrap.getAttribute('aria-pressed') !== 'true'
    wrap.setAttribute('aria-pressed', String(on))
    for (const output of outputs) {
      if (output.pre !== undefined) {
        output.pre.dataset.wrap = String(on)
      }
    }
  })

  tabs.append(wrap, copy)

  function select(name) {
    for (const output of outputs) {
      const active = output.name === name
      output.tab.dataset.active = String(active)
      output.tab.setAttribute('aria-selected', String(active))
      output.panel.dataset.active = String(active)
    }
    // Neither applies to an iframe you can already interact with.
    copy.hidden = name === 'Preview'
    wrap.hidden = name === 'Preview'
  }
  select('Preview')

  const total = element('span', 'ide-total')
  const problems = element('button', 'ide-problems')
  problems.type = 'button'
  const diagnostics = element('pre', 'ide-diagnostics')
  const drawer = element('div', 'ide-drawer')
  drawer.append(diagnostics)
  drawer.hidden = true
  problems.addEventListener('click', () => {
    drawer.hidden = !drawer.hidden
    problems.dataset.open = String(!drawer.hidden)
  })

  let queued
  let hadProblems = false
  async function run() {
    const text = editor.value
    let result
    try {
      result = compile(text, { trust: 'document', from: 'playground.hmx' })
    } catch (error) {
      diagnostics.textContent = `The compiler threw: ${error instanceof Error ? error.message : String(error)}`
      drawer.hidden = false
      problems.dataset.state = 'error'
      problems.textContent = 'Compiler error'
      return
    }

    const artefacts = { HTML: result.html, CSS: result.css, JS: result.js }
    for (const output of outputs) {
      const source = artefacts[output.name]
      if (source === undefined) {
        continue
      }
      // An empty artefact is a claim, not a blank: it gets a sentence rather than an empty box.
      output.pre.hidden = source === ''
      output.note.hidden = source !== ''
      if (source !== '') {
        codeLines(output.code, source)
      }
    }

    // The runtime and styles are inlined so the preview is one self-contained document.
    preview.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;color:#f3f0ea;background:#101017;margin:0;padding:20px}${result.css}</style>${result.html}<script>${result.js}<\/script>`

    const errors = result.diagnostics.filter(({ severity }) => severity === 'error')
    if (result.diagnostics.length === 0) {
      diagnostics.textContent = 'No diagnostics.'
      drawer.hidden = true
      hadProblems = false
      delete problems.dataset.state
      delete problems.dataset.open
      problems.textContent = 'No problems'
    } else {
      // Opens itself the first time something goes wrong and then stays as the reader left it:
      // a drawer that reopens on every keystroke is impossible to close while typing.
      if (!hadProblems) {
        drawer.hidden = false
        problems.dataset.open = 'true'
      }
      hadProblems = true
      // The compiler's own renderer, not a summary of it: the frame here is character for
      // character what `hmx check` prints in a terminal, which is the point of having one.
      diagnostics.textContent = renderDiagnostics(result.diagnostics, text, {
        from: 'playground.hmx',
      })
      problems.dataset.state = errors.length > 0 ? 'error' : 'warning'
      const count = result.diagnostics.length
      problems.textContent = `${count} problem${count === 1 ? '' : 's'}`
    }

    const [html, css, js] = await Promise.all([
      gzipSize(result.html),
      gzipSize(result.css),
      gzipSize(result.js),
    ])
    const sizes = { HTML: html, CSS: css, JS: js }
    for (const output of outputs) {
      if (output.name in sizes) {
        output.size.textContent = bytes(sizes[output.name])
      }
    }
    total.textContent = `${bytes([html, css, js].reduce((sum, part) => sum + (part ?? 0), 0))} gzipped`

    // Replace rather than push: a playground should not fill the back button with keystrokes.
    history.replaceState(null, '', `#${encode(text)}`)
  }

  editor.addEventListener('input', () => {
    clearTimeout(queued)
    queued = setTimeout(run, 160)
  })

  // Tab indents rather than leaving the editor. Trapping focus is normally wrong, so Escape
  // then Tab still moves on — the pane says so.
  let escaped = false
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      escaped = true
      return
    }
    if (event.key !== 'Tab' || escaped) {
      escaped = false
      return
    }
    event.preventDefault()
    const { selectionStart: start, selectionEnd: end, value } = editor
    editor.value = `${value.slice(0, start)}  ${value.slice(end)}`
    editor.selectionStart = editor.selectionEnd = start + 2
    clearTimeout(queued)
    queued = setTimeout(run, 160)
  })

  const file = element('div', 'ide-file')
  file.append(element('span', 'ide-file-name', 'playground.hmx'), element('span', 'ide-trust', 'document trust'))

  const reset = element('button', 'ide-action', 'Reset')
  reset.type = 'button'
  reset.addEventListener('click', () => {
    editor.value = STARTER
    void run()
  })

  // Host code, because a document cannot reach the clipboard (ADR-0004) — the same reason the
  // copy buttons on every other page here are host code.
  const share = element('button', 'ide-action', 'Copy link')
  share.type = 'button'
  share.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      share.textContent = 'Link copied'
      setTimeout(() => (share.textContent = 'Copy link'), 1600)
    } catch {
      share.textContent = 'Press ⌘C'
      setTimeout(() => (share.textContent = 'Copy link'), 1600)
    }
  })

  const actions = element('div', 'ide-actions')
  actions.append(reset, share)

  const bar = element('div', 'ide-bar')
  bar.append(file, actions)

  const source = element('section', 'ide-source')
  source.append(element('div', 'ide-pane-title', 'You write'), editor)

  const output = element('section', 'ide-output')
  output.append(tabs, panels)

  const body = element('div', 'ide-body')
  body.append(source, output)

  const status = element('div', 'ide-status')
  status.append(element('span', 'ide-status-label', 'gzipped, as a server would send it'), total, problems)

  root.append(bar, body, status, drawer)
  void run()

  return () => {
    clearTimeout(queued)
    root.replaceChildren()
  }
}
