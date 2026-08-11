import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const fixturePath = fileURLToPath(new URL('./commonmark-0.31.2.json', import.meta.url))
const examples = JSON.parse(readFileSync(fixturePath, 'utf8'))

describe('CommonMark 0.31.2 conformance', () => {
  // App trust mode is intentional: this suite verifies Markdown semantics. The
  // document-mode trust boundary has its own tests under tests/security/.
  it.each(examples)('CommonMark §$section example $example', (example) => {
    const result = compile(example.markdown, { trust: 'app', gfm: false })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(example.html)
  })
})
