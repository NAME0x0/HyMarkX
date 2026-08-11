import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const fixturesDirectory = fileURLToPath(new URL('../../fixtures/markdown/', import.meta.url))
const fixtureNames = readdirSync(fixturesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('Markdown HTML fixtures', () => {
  it.each(fixtureNames)('%s', (fixtureName) => {
    const fixtureDirectory = new URL(`../../fixtures/markdown/${fixtureName}/`, import.meta.url)
    const input = readFileSync(new URL('input.md', fixtureDirectory), 'utf8')
    const expected = readFileSync(new URL('expected.html', fixtureDirectory), 'utf8')
    const result = compile(input, { from: `${fixtureName}/input.md`, trust: 'app' })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(expected)
  })
})
