import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from './build.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const { minify } = require('terser')

const project = new URL('../', import.meta.url)
const output = new URL('dist/', project)
const comparisons = new URL('comparisons/', project)
const documents = new URL('documents/', project)

function bytes(value) {
  return Buffer.byteLength(value)
}

function gzippedBytes(value) {
  return gzipSync(value, { level: 9 }).byteLength
}

async function minifyJavaScript(value) {
  const result = await minify(value, {
    compress: true,
    mangle: true,
    format: { comments: false },
  })
  if (result.code === undefined) throw new Error('Terser returned no output')
  return result.code
}

async function javascriptStats(value) {
  const minified = await minifyJavaScript(value)
  return {
    raw: bytes(value),
    minified: bytes(minified),
    gzipped: gzippedBytes(minified),
    minifiedSource: minified,
  }
}

function unchangedStats(value) {
  return {
    raw: bytes(value),
    minified: bytes(value),
    gzipped: gzippedBytes(value),
    minifiedSource: value,
  }
}

function summedStats(parts) {
  return {
    raw: parts.reduce((total, part) => total + part.raw, 0),
    minified: parts.reduce((total, part) => total + part.minified, 0),
    gzipped: parts.reduce((total, part) => total + part.gzipped, 0),
  }
}

function oneResponseStats(raw, minified) {
  return {
    raw: bytes(raw),
    minified: bytes(minified),
    gzipped: gzippedBytes(minified),
  }
}

function sourceStats(value) {
  const withoutFinalNewline = value.endsWith('\n') ? value.slice(0, -1) : value
  return {
    lines: withoutFinalNewline.length === 0 ? 0 : withoutFinalNewline.split('\n').length,
    characters: value.length,
  }
}

function sizeRow(name, values, note = '') {
  return `| ${name} | ${values.raw} | ${values.minified} | ${values.gzipped} | ${note} |`
}

function sourceRow(name, values) {
  return `| ${name} | ${values.lines} | ${values.characters} |`
}

const results = await build()
const counter = results.counter
const inputBinding = results['input-binding']

const counterRuntime = await javascriptStats(counter.runtime)
const counterBindings = await javascriptStats(counter.bindings)
const counterHtml = unchangedStats(counter.html)
const counterMinifiedPage = `${counter.html}<script>${counterRuntime.minifiedSource}${counterBindings.minifiedSource}</script>\n`
const counterPage = oneResponseStats(counter.page, counterMinifiedPage)

const inputRuntime = await javascriptStats(inputBinding.runtime)
const inputBindings = await javascriptStats(inputBinding.bindings)
const inputHtml = unchangedStats(inputBinding.html)
const inputMinifiedPage = `${inputBinding.html}<script>${inputRuntime.minifiedSource}${inputBindings.minifiedSource}</script>\n`
const inputPage = oneResponseStats(inputBinding.page, inputMinifiedPage)

await writeFile(new URL('counter.runtime.min.js', output), counterRuntime.minifiedSource)
await writeFile(new URL('counter.bindings.min.js', output), counterBindings.minifiedSource)
await writeFile(new URL('counter.min.html', output), counterMinifiedPage)
await writeFile(new URL('input-binding.runtime.min.js', output), inputRuntime.minifiedSource)
await writeFile(new URL('input-binding.bindings.min.js', output), inputBindings.minifiedSource)
await writeFile(new URL('input-binding.min.html', output), inputMinifiedPage)

const vanillaHtmlSource = await readFile(new URL('vanilla-counter.html', comparisons), 'utf8')
const vanillaAppSource = await readFile(new URL('vanilla-counter.js', comparisons), 'utf8')
const vanillaHtml = unchangedStats(vanillaHtmlSource)
const vanillaApp = await javascriptStats(vanillaAppSource)
const zeroRuntime = { raw: 0, minified: 0, gzipped: 0 }
const vanillaTotal = summedStats([vanillaHtml, vanillaApp])

const reactHtmlSource = await readFile(new URL('react-counter.html', comparisons), 'utf8')
const reactAppSource = await readFile(new URL('react-counter.js', comparisons), 'utf8')
const reactSource = await readFile(
  new URL('node_modules/react/umd/react.production.min.js', project),
)
const reactDomSource = await readFile(
  new URL('node_modules/react-dom/umd/react-dom.production.min.js', project),
)
const reactHtml = unchangedStats(reactHtmlSource)
const reactApp = await javascriptStats(reactAppSource)
const reactRuntime = summedStats([unchangedStats(reactSource), unchangedStats(reactDomSource)])
const reactTotal = summedStats([reactHtml, reactApp, reactRuntime])

const rawRuntimeFile = new URL('counter.runtime.js', output)
const runtimeFileBytes = (await stat(rawRuntimeFile)).size
assert.equal(runtimeFileBytes, counterRuntime.raw)

const minifiedCounterDom = new JSDOM(counterMinifiedPage, { runScripts: 'dangerously' })
minifiedCounterDom.window.document.querySelector('[data-hmx-e="0"]').click()
assert.equal(minifiedCounterDom.window.document.querySelector('[data-hmx-t="0"]').textContent, '1')
minifiedCounterDom.window.close()

const minifiedInputDom = new JSDOM(inputMinifiedPage, { runScripts: 'dangerously' })
const measuredInput = minifiedInputDom.window.document.querySelector('[data-hmx-i="0"]')
measuredInput.value = 'Grace'
measuredInput.dispatchEvent(new minifiedInputDom.window.Event('input', { bubbles: true }))
assert.equal(
  minifiedInputDom.window.document.querySelector('[data-hmx-t="0"]').textContent,
  'Grace',
)
minifiedInputDom.window.document.querySelector('[data-hmx-e="0"]').click()
assert.equal(
  minifiedInputDom.window.document.querySelector('[data-hmx-t="1"]').textContent,
  'Byron',
)
minifiedInputDom.window.close()

const counterSource = await readFile(new URL('counter.hmx', documents), 'utf8')
const sourceMeasurements = {
  'HMX counter document': sourceStats(counterSource),
  'React counter HTML + app JS': {
    lines: sourceStats(reactHtmlSource).lines + sourceStats(reactAppSource).lines,
    characters: reactHtmlSource.length + reactAppSource.length,
  },
  'Vanilla counter HTML + app JS': {
    lines: sourceStats(vanillaHtmlSource).lines + sourceStats(vanillaAppSource).lines,
    characters: vanillaHtmlSource.length + vanillaAppSource.length,
  },
}

const sizeRows = [
  sizeRow('HMX counter runtime', counterRuntime, 'one inline response'),
  sizeRow('HMX counter generated bindings/glue', counterBindings),
  sizeRow('HMX counter HTML (script excluded)', counterHtml, 'HTML was not minified'),
  sizeRow('HMX counter total page', counterPage, 'HTML and inline script; one response'),
  sizeRow('HMX two-way runtime', inputRuntime, 'includes input-binding support'),
  sizeRow('HMX two-way generated bindings/glue', inputBindings),
  sizeRow('HMX two-way HTML (script excluded)', inputHtml, 'HTML was not minified'),
  sizeRow('HMX two-way total page', inputPage, 'HTML and inline script; one response'),
  sizeRow('Vanilla counter runtime', zeroRuntime, 'no framework/runtime'),
  sizeRow('Vanilla counter app/glue JS', vanillaApp),
  sizeRow('Vanilla counter HTML shell', vanillaHtml, 'HTML was not minified'),
  sizeRow('Vanilla counter total payload', vanillaTotal, 'HTML + JS; two responses summed'),
  sizeRow(
    'React 18.3.1 runtime',
    reactRuntime,
    'React + ReactDOM production UMD CDN files; two responses summed',
  ),
  sizeRow('React counter app/glue JS', reactApp),
  sizeRow('React counter HTML shell', reactHtml, 'HTML was not minified'),
  sizeRow('React counter total payload', reactTotal, 'HTML + app + two CDN files'),
  '| Svelte compiled counter | not measured | not measured | not measured | optional comparison dependency was not added |',
]

const sourceRows = Object.entries(sourceMeasurements).map(([name, values]) =>
  sourceRow(name, values),
)

const terserPackage = JSON.parse(
  await readFile(new URL('node_modules/terser/package.json', project), 'utf8'),
)
const minifierLabel =
  typeof terserPackage.version === 'string'
    ? `Terser ${terserPackage.version}`
    : 'the Terser bundle shipped with Next.js 16.2.4 (version metadata unavailable)'
const report = `# HMX-P01 measurements

All values below were generated locally from the files in this directory. JavaScript was
minified with ${minifierLabel}. The gzip column is Node's \`gzipSync\` at
level 9 over the minified bytes. Multi-file comparison totals sum separately compressed
responses; HMX totals compress the single HTML response containing its inline script.

## Artifact sizes

| Implementation / artifact | Raw bytes | Minified bytes | Gzipped bytes | Notes |
|---|---:|---:|---:|---|
${sizeRows.join('\n')}

## Author source size

Lines are physical lines excluding a final empty line. Characters are JavaScript string
code units; every compared source is ASCII, so this also equals its UTF-8 byte count.

| Source | Lines | Characters |
|---|---:|---:|
${sourceRows.join('\n')}

## Measurement checks

- The raw counter runtime was independently checked with filesystem metadata:
  \`dist/counter.runtime.js\` is ${runtimeFileBytes} bytes, matching \`Buffer.byteLength\`.
- Both minified HMX pages were driven with JSDOM 21.1.2 after measurement; the counter,
  input-to-state update, and rename event all produced the expected bound text.
- Registry access was unavailable in this environment. DOM verification used a complete
  pre-existing JSDOM installation, and minification used the pre-existing Next.js Terser
  bundle named above. These are measurement tools and are not included in any payload row.
- React uses the installed React 18.3.1 production UMD files corresponding exactly to the
  pinned unpkg CDN URLs in \`comparisons/react-counter.html\`.
- Svelte is explicitly not measured; adding and configuring a compiler only for an optional
  row would broaden this experiment without strengthening its core verdict.

## Findings and verdict

The counter and the two-way input probe both work with static dependency tables and targeted
DOM writes. A state mutation updates only the cached text nodes and input elements listed for
that state name. There is no virtual DOM, tree diff, or node replacement. Static documents
take the exact existing compiler path and emit no script.

The harder probe exposed one concrete compiler-model mismatch: component render plans only
describe paired wrappers, so the real compiler emits \`<input ...></input>\`. HTML parsers
normalize that to a working input element, and two-way behavior is clean after normalization,
but the serialized HTML is invalid for a void element. A production design needs a void-tag
render-plan capability rather than preserving this compromise.

The second document also does not parse verbatim as printed in HMX-P01: a backslash-escaped
double quote inside the double-quoted \`on-click\` value makes the current parser treat the
button block as prose and report \`HMX1011\`. The working probe changes only the outer
attribute delimiter to a single quote. \`documents/input-binding-as-brief.hmx\` and an
automated test preserve this negative result.

The AST also retains decoded attribute values but not an explicit quoted/unquoted flag. This
prototype distinguishes \`value=1\` from \`value="1"\` by following the attribute's real AST
source spans into the parser-normalized source. That remains AST-driven and uses no source
preprocessing, but a semantic literal-kind field would make the eventual expression phase
cleaner.

Verdict: compiled small-runtime interactivity is achievable in HyMarkX's current design for
the tested state, event, text-binding, and two-way-input semantics. Nothing fundamental in
the parser AST or restricted expression model blocks it. The current compiler render-plan
shape blocks clean void-element emission, and the AST makes literal-kind recovery awkward;
both are bounded design gaps, not reasons to reject the interactivity thesis. This prototype
does not establish production security, general attribute expressions, SSR, hydration, or
component scoping.
`

await writeFile(new URL('MEASUREMENTS.md', project), report)
await writeFile(
  new URL('measurements.json', output),
  `${JSON.stringify(
    {
      sizes: {
        counterRuntime,
        counterBindings,
        counterHtml,
        counterPage,
        inputRuntime,
        inputBindings,
        inputHtml,
        inputPage,
        vanillaApp,
        vanillaHtml,
        vanillaTotal,
        reactRuntime,
        reactApp,
        reactHtml,
        reactTotal,
      },
      sources: sourceMeasurements,
      sanity: { runtimeFileBytes },
    },
    null,
    2,
  )}\n`,
)

console.log(report)
