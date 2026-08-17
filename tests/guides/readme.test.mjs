import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile, compileComponents } from '../../packages/compiler/src/index.js'

const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8')

/**
 * Every ```md block in the README, compiled.
 *
 * The README shipped a broken headline example for six phases — `:::grid` wrapping
 * `:::card` at the same fence width, which silently closes the outer container. Nobody
 * noticed because nothing executed it.
 */
const blocks = [...readme.matchAll(/```md\n([\s\S]*?)```/g)].map((match) => match[1])

describe('README examples', () => {
  it('contains the examples this test is meant to guard', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(4)
  })

  it.each(blocks.map((source, index) => ({ index, source })))(
    'example %# compiles without errors',
    ({ source }) => {
      // Component definitions declare props and use ::children, which only make sense when
      // registered; compiling them as a document would report an orphaned ::children.
      const isComponentDefinition = source.includes('::children')
      const result = isComponentDefinition
        ? compileComponents([{ name: 'Example', source }])
        : compile(source, { trust: 'app' })
      const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

      expect(errors.map(({ code, message }) => `${code}: ${message}`)).toEqual([])
    },
  )

  it('keeps the interactive example within the documented runtime budget', () => {
    const interactive = blocks.find((source) => source.includes('::state'))
    const result = compile(interactive ?? '', { trust: 'app' })

    expect(result.js).not.toBe('')
    expect(result.html).not.toContain('<script')
  })
})
