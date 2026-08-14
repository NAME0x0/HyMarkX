import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
    const expectedCssUrl = new URL('expected.css', fixtureDirectory)
    const result = compile(input, { from: `${fixtureName}/input.md`, trust: 'app' })

    if (fixtureName === 'components-invalid') {
      expect(result.diagnostics.map(({ code, severity }) => ({ code, severity }))).toEqual([
        { code: 'HMX2002', severity: 'warning' },
        { code: 'HMX2001', severity: 'warning' },
        { code: 'HMX2004', severity: 'error' },
        { code: 'HMX2005', severity: 'error' },
        { code: 'HMX2005', severity: 'error' },
      ])
    } else if (fixtureName.startsWith('directives-')) {
      expect(result.diagnostics.length).toBeGreaterThan(0)
      const expectedCode = fixtureName === 'directives-basic' ? 'HMX2001' : 'HMX2002'
      expect(
        result.diagnostics.every(
          (diagnostic) => diagnostic.code === expectedCode && diagnostic.severity === 'warning',
        ),
      ).toBe(true)
    } else {
      expect(result.diagnostics).toEqual([])
    }
    expect(result.html).toBe(expected)
    if (existsSync(expectedCssUrl)) {
      expect(result.css).toBe(readFileSync(expectedCssUrl, 'utf8'))
    }
  })
})
