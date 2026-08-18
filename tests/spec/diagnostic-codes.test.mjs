import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Keeps SPEC.md Appendix B and the implementation in agreement.
 *
 * Both directions matter, and for different reasons. An emitted code that is not documented
 * leaves a user searching for a string with no explanation behind it. A documented code that is
 * never emitted is worse: it describes behaviour the processor does not have, and someone will
 * write a test, a handler, or an editor integration against it.
 *
 * When this was first written 30 of the 50 emitted codes were undocumented — everything from
 * frontmatter, expressions, interactivity, islands, and the CLI, which is to say everything
 * added after Phase 2 shipped its table and nothing extended it.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const CODE = /HMX\d{4}/g

/**
 * Source files that emit diagnostics: `packages/`, excluding tests.
 *
 * Tests are excluded because they contain codes as *expectations*. Including them would let a
 * test asserting a code that no longer exists keep this suite green, which is the exact drift
 * being guarded against.
 */
function emittingSources() {
  return execFileSync('git', ['ls-files', 'packages'], { cwd: repositoryRoot, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((path) => path.endsWith('.ts') && !path.split('/').includes('test'))
}

const emitted = new Set()
for (const path of emittingSources()) {
  for (const match of readFileSync(`${repositoryRoot}${path}`, 'utf8').matchAll(CODE)) {
    emitted.add(match[0])
  }
}

const spec = readFileSync(`${repositoryRoot}SPEC.md`, 'utf8')
const appendix = spec.slice(spec.indexOf('## Appendix B'))
const documented = new Set([...appendix.matchAll(CODE)].map((match) => match[0]))

describe('diagnostic codes', () => {
  // Guards the extraction itself. If the appendix heading were renamed or `git ls-files`
  // returned nothing, both sets would be empty and every assertion below would pass vacuously.
  it('found both sets', () => {
    expect(emitted.size).toBeGreaterThan(40)
    expect(documented.size).toBeGreaterThan(40)
  })

  it('documents every code the implementation emits', () => {
    const undocumented = [...emitted].filter((code) => !documented.has(code)).sort()

    expect(undocumented).toEqual([])
  })

  it('emits every code the specification documents', () => {
    const phantom = [...documented].filter((code) => !emitted.has(code)).sort()

    expect(phantom).toEqual([])
  })

  // The range is part of the contract, so a code has to be filed under the heading that
  // matches its number — a security diagnostic numbered 2xxx would be documented but misfiled.
  it.each([
    ['### `HMX1xxx`', '1'],
    ['### `HMX2xxx`', '2'],
    ['### `HMX3xxx`', '3'],
    ['### `HMX5xxx`', '5'],
  ])('lists only %s codes under its heading', (heading, digit) => {
    const start = appendix.indexOf(heading)
    expect(start).toBeGreaterThan(-1)
    const nextHeading = appendix.indexOf('### ', start + heading.length)
    const section = appendix.slice(
      start + heading.length,
      nextHeading === -1 ? undefined : nextHeading,
    )
    const misfiled = [...section.matchAll(CODE)]
      .map((match) => match[0])
      .filter((code) => code[3] !== digit)

    expect(misfiled).toEqual([])
  })
})
