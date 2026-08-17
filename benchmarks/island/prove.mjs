/**
 * Proves the foreign-component contract end to end, and measures what it costs.
 *
 * ADR-0016 says HMX emits a reference and a host bundles it. This script is that host: it
 * compiles a document with `hmx`, bundles the adapter with esbuild, mounts the island in a
 * DOM, and interacts with it. esbuild is a development dependency here, never a compiler
 * dependency — the point of the ADR is that `@hymarkx/compiler` is not a bundler.
 *
 *   node benchmarks/island/prove.mjs
 */
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { compile } from '../../packages/compiler/dist/index.js'

const here = fileURLToPath(new URL('./', import.meta.url))

const source = `# Revenue

::island{from="./RevenueChart.tsx" export="RevenueChart" series="monthly" live}

Figures update live.
`

const result = compile(source, { trust: 'app', from: 'island.hmx' })
const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
if (errors.length > 0) {
  throw new Error(`document did not compile: ${errors.map((e) => e.code).join(', ')}`)
}

const bundled = await build({
  entryPoints: [`${here}mount.jsx`],
  bundle: true,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  write: false,
  logLevel: 'silent',
})
const script = bundled.outputFiles[0].text

const dom = new JSDOM(
  `<!doctype html><body>${result.html}<script>${script}</script><script>mountIslands(${JSON.stringify(result.islands)})</script></body>`,
  { runScripts: 'dangerously', pretendToBeVisual: true },
)

await new Promise((resolve) => setTimeout(resolve, 250))
const document = dom.window.document
const figure = document.querySelector('figure')
const before = document.querySelector('figcaption')?.textContent ?? ''
document.querySelector('figcaption button')?.click()
await new Promise((resolve) => setTimeout(resolve, 100))
const after = document.querySelector('figcaption')?.textContent ?? ''
const bars = document.querySelectorAll('svg rect').length
dom.window.close()

const bytes = (value) => new TextEncoder().encode(value).length
const gzip = (value) => gzipSync(Buffer.from(value), { level: 9 }).length

console.log('island manifest      ', JSON.stringify(result.islands))
console.log('placeholder emitted  ', result.html.includes('data-hmx-island="0"'))
console.log('compiler js bytes    ', bytes(result.js), '(the compiler ships no framework)')
console.log('mounted              ', figure !== null, `| bars: ${bars}`)
console.log('caption before       ', JSON.stringify(before.trim()))
console.log('caption after click  ', JSON.stringify(after.trim()))
console.log('')
console.log('host bundle raw      ', bytes(script).toLocaleString(), 'B')
console.log(
  'host bundle gzipped  ',
  gzip(script).toLocaleString(),
  'B  <- the real price of one React island',
)
console.log('hmx page transfer    ', (gzip(result.html) + gzip(result.css)).toLocaleString(), 'B')

if (figure === null || before === after) {
  throw new Error('island did not mount or did not respond to interaction')
}
console.log('\ncontract verified: reference emitted, host bundled, island interactive.')
