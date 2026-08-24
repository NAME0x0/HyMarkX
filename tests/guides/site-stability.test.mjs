import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(`${repositoryRoot}${path}`, 'utf8').replaceAll('\r\n', '\n')

const docs = read('site/docs.hmx')
const spec = read('SPEC.md')
const stability = docs.slice(docs.indexOf('#stability'), docs.indexOf('#next'))

/**
 * The stability page makes promises about other files, so it is checked against them.
 *
 * A page that says what is stable is the most expensive thing on a site to get wrong: a reader
 * plans around it. Every claim here that can be mechanically tied to the thing it describes is
 * tied to it, so the page fails the build rather than quietly becoming a lie.
 */
describe('the stability page', () => {
  it('is on the page at all', () => {
    expect(stability).toContain('## Stability')
  })

  it('cites architecture decisions that exist', () => {
    // Filenames carry a slug after the number, so the number is the prefix to match on.
    const records = readdirSync(`${repositoryRoot}docs/adr`)
    const cited = [...new Set([...stability.matchAll(/ADR-(\d{4})/g)].map((match) => match[1]))]

    expect(cited.length).toBeGreaterThan(0)
    const missing = cited.filter((number) => !records.some((name) => name.startsWith(`${number}-`)))

    expect(missing).toEqual([])
  })

  /**
   * The two "not specified at this version" claims are quotes from the specification. If the
   * specification grows either feature, this fails and the page has to be rewritten — which is
   * the point, because that is exactly the promise a reader would have planned around.
   */
  it('only claims something is unspecified while the specification says so', () => {
    if (stability.includes('Named slots are not specified')) {
      expect(spec).toContain('Named slots are not specified at this version')
    }
    if (stability.includes('Named derived state is not specified')) {
      expect(spec).toContain('Named derived state is **not** specified at this version')
    }
  })

  /**
   * Every frontmatter key the page calls reserved is one the compiler actually reserves.
   *
   * Checked through behaviour rather than through an export: a reserved key with a value of the
   * wrong type is `HMX2022`, and an ordinary key with the same value is not.
   */
  it('lists exactly the frontmatter keys the compiler reserves', () => {
    const row = stability.split('\n').find((line) => line.startsWith('| Frontmatter'))
    const keys = [...row.matchAll(/`([a-zA-Z]+)`/g)].map((match) => match[1])

    expect(keys.length).toBeGreaterThanOrEqual(10)
    for (const key of keys) {
      const result = compile(`---\n${key}: [1]\n---\n`, { trust: 'document' })
      const reserved = result.diagnostics.some(
        ({ code, message }) => code === 'HMX2022' && message.includes(`"${key}"`),
      )

      expect(reserved, `${key} is listed as reserved`).toBe(true)
    }
  })

  it('does not call a key reserved that is not', () => {
    const result = compile('---\nnotreserved: [1]\n---\n', { trust: 'document' })

    expect(result.diagnostics.some(({ code }) => code === 'HMX2022')).toBe(false)
  })
})
