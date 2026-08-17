import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

/**
 * Regression tests for a parser hang found by the pipeline fuzzer.
 *
 * `:::card{ malformed` followed by any non-ASCII character looped forever. The directive-name
 * guard, which rejects non-ASCII inside a directive name, stayed armed after the line ended;
 * a later non-ASCII character then re-entered `nok` from a fresh tokenize call, and
 * `micromark-extension-gfm-table`'s container continuation re-ran the line indefinitely.
 *
 * Reproducible only with GFM enabled, which is the default — so this was reachable from any
 * untrusted document (SECURITY.md T9). Upstream `micromark-extension-directive` was
 * unaffected; the bug was ours.
 *
 * These cases carry timeouts because the failure mode is a hang, not a wrong answer.
 */
describe('malformed directive followed by non-ASCII', () => {
  it.each([
    ['latin-1', 'é'],
    ['bmp', '中'],
    ['astral', '\u{1F600}'],
    ['musical symbol', '\u{1D11E}'],
    ['lone surrogate', '\ud83d'],
    ['combining mark', '́'],
  ])(
    'terminates for %s after an unterminated attribute block',
    (_label, character) => {
      const result = parse(`:::card{ malformed\n${character}\n`)

      expect(result.root.children[0]?.type).toBe('paragraph')
    },
    5000,
  )

  it('terminates for the original fuzz input', () => {
    const result = parse('\u{1F600}\u{1D11E}\n\n:::card{ malformed\n\u{1F600}\u{1D11E}\n\n')

    expect(result.root.children).not.toEqual([])
  }, 5000)

  it('terminates without a brace at all', () => {
    const result = parse(':::card malformed\n\u{1F600}\n')

    expect(result.root.children[0]?.type).toBe('paragraph')
  }, 5000)

  // The guard still has to do its job: a non-ASCII directive *name* is not a directive.
  it('still rejects a non-ASCII directive name', () => {
    const result = parse(':::cardé\nbody\n:::\n')

    expect(result.root.children[0]?.type).toBe('paragraph')
  })

  it.each([
    [':::note{type=info}\nbody\n:::\n', 'containerDirective'],
    [':::card{title={x}}\nbody\n:::\n', 'containerDirective'],
    ['::children\n', 'leafDirective'],
  ])('still parses %j as %s', (source, type) => {
    expect(parse(source).root.children[0]?.type).toBe(type)
  })

  it('still parses a directive on a line after non-ASCII prose', () => {
    const result = parse('Héllo wörld\n\n:::note{type=info}\nbody\n:::\n')

    expect(result.root.children[1]?.type).toBe('containerDirective')
  })
})
