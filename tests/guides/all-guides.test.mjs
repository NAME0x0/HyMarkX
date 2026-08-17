import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile, compileComponents } from '../../packages/compiler/src/index.js'

const guidesDirectory = fileURLToPath(new URL('../../docs/guides/', import.meta.url))

/**
 * Every ```md block across every guide, compiled.
 *
 * Documentation that is never executed drifts silently — the README carried a broken
 * headline example for six phases. This makes a wrong example a failing build.
 */
const examples = readdirSync(guidesDirectory)
  .filter((name) => name.endsWith('.md'))
  .flatMap((name) => {
    const text = readFileSync(`${guidesDirectory}${name}`, 'utf8')
    return [...text.matchAll(/```md\n([\s\S]*?)```/g)].map((match, index) => ({
      id: `${name}#${index}`,
      source: match[1],
    }))
  })

describe('guide examples', () => {
  it('finds examples to check', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  it.each(examples)('$id compiles without errors', ({ source }) => {
    // A block using ::children is a component definition, not a document: compiling it
    // standalone would correctly report an orphaned children marker.
    const result = source.includes('::children')
      ? compileComponents([{ name: 'Example', source }])
      : compile(source, { trust: 'app' })
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

    expect(errors.map(({ code, message }) => `${code}: ${message}`)).toEqual([])
  })
})
