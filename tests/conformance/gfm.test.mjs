import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const fixturePath = fileURLToPath(new URL('./gfm.json', import.meta.url))
const examples = JSON.parse(readFileSync(fixturePath, 'utf8'))

describe('GFM conformance', () => {
  // Like the CommonMark gate, GFM runs in app mode so only Markdown semantics are tested.
  it.each(examples)('GFM §$section example $example', (example) => {
    const result = compile(example.markdown, { trust: 'app', gfm: true })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(example.html)
  })
})
