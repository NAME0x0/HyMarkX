import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'
import { format } from '../../packages/formatter/src/index.js'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const conformance = JSON.parse(
  readFileSync(`${repositoryRoot}tests/conformance/commonmark-0.31.2.json`, 'utf8'),
)

const fixturesDirectory = `${repositoryRoot}fixtures/markdown/`
const fixtures = readdirSync(fixturesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    for (const file of ['input.md', 'input.hmx']) {
      try {
        return [
          {
            name: entry.name,
            source: readFileSync(`${fixturesDirectory}${entry.name}/${file}`, 'utf8'),
          },
        ]
      } catch {
        continue
      }
    }
    return []
  })

/** Scope hashes derive from document content, so formatting changes them by design. */
function withoutScopeHashes(html) {
  return html.replaceAll(/data-hmx-s-[a-f0-9]+/g, 'data-hmx-s-X')
}

describe('formatter corpus', () => {
  // The load-bearing property of ADR-0015: a document containing no HMX construct is not a
  // document the formatter has any business touching.
  it('leaves every CommonMark example byte-identical', () => {
    const changed = conformance
      .filter((example) => format(example.markdown).source !== example.markdown)
      .map((example) => example.example)

    expect(changed).toEqual([])
  })

  it.each(fixtures)('is idempotent for fixture $name', ({ source }) => {
    const once = format(source)

    expect(format(once.source).source).toBe(once.source)
  })

  it.each(fixtures)('preserves meaning for fixture $name', ({ source }) => {
    const formatted = format(source).source

    expect(withoutScopeHashes(compile(formatted, { trust: 'app' }).html)).toBe(
      withoutScopeHashes(compile(source, { trust: 'app' }).html),
    )
  })
})
