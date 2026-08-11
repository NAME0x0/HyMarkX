import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'
import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

const fixturesDirectory = fileURLToPath(new URL('../../../fixtures/markdown/', import.meta.url))
const fixtureNames = readdirSync(fixturesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe('Markdown AST fixtures', () => {
  it.each(fixtureNames)('%s', async (fixtureName) => {
    const fixtureDirectory = new URL(`../../../fixtures/markdown/${fixtureName}/`, import.meta.url)
    const input = readFileSync(new URL('input.md', fixtureDirectory), 'utf8')
    const expectedPath = new URL('expected.ast.json', fixtureDirectory)
    const result = parse(input, { from: `${fixtureName}/input.md` })
    const serialized = await format(JSON.stringify(result.root), {
      parser: 'json',
      tabWidth: 2,
      printWidth: 100,
      endOfLine: 'lf',
    })

    expect(result.diagnostics).toEqual([])
    if (process.env.UPDATE_FIXTURES === '1') {
      writeFileSync(expectedPath, serialized)
    }

    expect(serialized).toBe(readFileSync(expectedPath, 'utf8'))
  })
})
