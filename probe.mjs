import { compile } from './packages/compiler/src/index.js'
const cases = [
  ['12:30 tonight', 'time'],
  ['Ratio 3:4 here', 'ratio'],
  ['a:b c', 'word:word'],
  ['**Text escaping:** `&` \u2192 `x`', 'the CONTRIBUTING case'],
  [':badge[ok]{kind=success}', 'text directive at line start'],
  ['Status: :badge[ok]{kind=success}', 'text directive after space'],
  ['see :mark[this] now', 'inline directive mid-sentence'],
  ['(:mark[x])', 'after punctuation'],
  [':::note{type=info}\nbody\n:::', 'container unaffected'],
  ['::children', 'leaf unaffected'],
  ['https://example.com/a', 'url'],
]
for (const [src, label] of cases) {
  const r = compile(src + '\n', { trust: 'app' })
  const codes = r.diagnostics.map((d) => d.code).join(',') || '-'
  console.log(`${label.padEnd(32)} ${JSON.stringify(r.html.trim().slice(0, 72))}  [${codes}]`)
}
