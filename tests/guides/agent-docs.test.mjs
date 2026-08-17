import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtinComponents, compile, compileComponents } from '../../packages/compiler/src/index.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(`${root}${path}`, 'utf8')

const AGENT_DOCS = ['llms.txt', '.claude/skills/hymarkx/SKILL.md', '.cursor/rules/hymarkx.mdc']

const examples = AGENT_DOCS.flatMap((path) => {
  const text = read(path)
  return [...text.matchAll(/```md\n([\s\S]*?)```/g)].map((match, index) => ({
    id: `${path}#${index}`,
    source: match[1],
  }))
})

describe('agent-facing documentation', () => {
  it('has examples to verify', () => {
    expect(examples.length).toBeGreaterThanOrEqual(5)
  })

  // These files exist to stop a model producing invalid HMX. An example that does not
  // compile would do the opposite of its job.
  it.each(examples)('$id compiles without errors', ({ source }) => {
    const result = source.includes('::children')
      ? compileComponents([{ name: 'Example', source }])
      : compile(source, { trust: 'app' })
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

    expect(errors.map(({ code, message }) => `${code}: ${message}`)).toEqual([])
  })
})

describe('llms.txt accuracy', () => {
  const llms = read('llms.txt')

  // A component table that drifts from the registry would teach models to emit attributes
  // the compiler rejects — the exact failure this file is meant to prevent.
  it.each(Object.keys(builtinComponents.schemas))('documents the %s component', (name) => {
    expect(llms).toContain(`\`${name}\``)
  })

  it('documents every declared attribute of every built-in', () => {
    const missing = Object.values(builtinComponents.schemas).flatMap((schema) =>
      Object.keys(schema.attributes)
        .filter((attribute) => !llms.includes(`\`${attribute}\``))
        .map((attribute) => `${schema.name}.${attribute}`),
    )

    expect(missing).toEqual([])
  })

  it('warns about the fence-width mistake, which is the most common failure', () => {
    expect(llms).toContain('::::grid')
    expect(llms).toContain('HMX1001')
  })

  it('states that the rejected @ syntax does not exist', () => {
    expect(llms).toMatch(/@state.*do not exist|do not exist.*@state/s)
  })
})
