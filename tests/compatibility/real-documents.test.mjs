import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'
import { normalize, referenceHtml } from './reference-renderer.mjs'

/**
 * Invariant 1, checked against real documents instead of spec examples.
 *
 * The CommonMark and GFM conformance suites check 692 examples, each exercising one construct
 * in isolation. This compiles every Markdown file in the repository — READMEs, ADRs, task
 * briefs, guides — and requires byte-identical output to a bare micromark + GFM render.
 *
 * It earned its place immediately. On its first run it found that `: ` followed by a code span
 * and a non-ASCII character produced silently mangled code spans — `` `&` → `x` `` came out
 * with the code span boundaries shifted by one backtick, no diagnostic, in ordinary prose. The
 * spec suites had no example combining those three things, because each of them individually
 * works. Real documents combine things.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

/** Anything that would legitimately render differently: an HMX construct is not CommonMark. */
const HMX_CONSTRUCT = /^:{2,}[A-Za-z0-9]|^---$|\{\{|::[A-Za-z0-9]|^\s*:[A-Za-z0-9]+\[/m

/**
 * The one document excluded, and the only case where the reference is the one that is wrong.
 *
 * When a link reference definition precedes a raw HTML block, micromark drops the newlines
 * inside the block: `<div>\n  <span>x</span>\n</div>` comes back as
 * `<div>  <span>x</span></div>`. CommonMark says an HTML block's content is passed through
 * literally, so HMX — which preserves it — is right and the reference is not.
 *
 * Excluded by name rather than by loosening the comparison, and paired with a positive test
 * below so the exclusion cannot hide a regression in our own behaviour.
 */
const REFERENCE_RENDERER_DEFECTS = new Set(['fixtures/markdown/references-html/input.md'])

function trackedMarkdown() {
  const output = execFileSync('git', ['ls-files', '*.md'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  return output.trim().split('\n').filter(Boolean)
}

const documents = trackedMarkdown()
  .map((path) => ({ path, source: readFileSync(`${repositoryRoot}${path}`, 'utf8') }))
  .filter(
    ({ path, source }) => !HMX_CONSTRUCT.test(source) && !REFERENCE_RENDERER_DEFECTS.has(path),
  )

describe('real documents render as CommonMark', () => {
  // Without this the suite could quietly shrink to nothing — a broadened skip pattern, or a
  // `git ls-files` that returned empty, would leave every assertion below unrun and green.
  it('has a corpus to check', () => {
    expect(documents.length).toBeGreaterThan(15)
  })

  it.each(documents.map(({ path }) => path))('%s renders identically to micromark', (path) => {
    const { source } = documents.find((document) => document.path === path)
    const result = compile(source, { trust: 'app' })

    expect(normalize(result.html)).toBe(normalize(referenceHtml(source)))
  })
})

/**
 * The minimised cases behind the corruption the corpus found, kept as their own tests.
 *
 * A corpus test proves a fix works today. These say what the bug *was*, so a future change that
 * reintroduces it fails with a two-line input instead of a diff of CONTRIBUTING.md.
 *
 * Root cause: the guard that rejects non-ASCII directive names armed itself when the `:` marker
 * was consumed and stayed armed for the rest of the line when the directive attempt failed. A
 * later non-ASCII character then returned `nok` from the middle of a paragraph. It now arms for
 * exactly one character, which is the only one that can begin a name.
 */
describe('a failed directive attempt leaves the rest of the line alone', () => {
  it.each([
    [': `&` → `x`\n', 'a bare colon before code spans and a non-ASCII character'],
    ['**a:** `&` → `x`\n', 'a colon inside strong emphasis'],
    ['*a:* `&` → `x`\n', 'a colon inside emphasis'],
    ['**:** `&` → `x`\n', 'a colon that is the entire emphasis'],
    [
      '- **Text escaping:** `&` → `&amp;`, `<` → `&lt;`.\n',
      'the original case, from CONTRIBUTING.md',
    ],
    ['a: → → →\n', 'several non-ASCII characters after a colon'],
    ['# Heading: → `code`\n', 'a colon in a heading'],
    ['> quote: → `code`\n', 'a colon in a block quote'],
  ])('renders %j identically to micromark — %s', (source) => {
    const result = compile(source, { trust: 'app' })

    expect(normalize(result.html)).toBe(normalize(referenceHtml(source)))
    expect(result.diagnostics).toEqual([])
  })

  // The behaviour excluded from the corpus above, asserted directly. HTML block content is
  // literal in CommonMark, so the newlines survive — whatever the reference renderer does.
  it('preserves newlines in a raw HTML block that follows a link definition', () => {
    const source = ['[a]: /t "T"', '', '<div>', '  <span>x</span>', '</div>', ''].join('\n')
    const result = compile(source, { trust: 'app' })

    expect(result.html.trim()).toBe(['<div>', '  <span>x</span>', '</div>'].join('\n'))
  })

  // The guard still has a job: SPEC §4.1 restricts directive names to ASCII, and upstream
  // would happily accept a Unicode one.
  it.each([':néme[x]\n', ':::cardé\nbody\n:::\n', '::leaƒ\n'])(
    'still refuses the non-ASCII directive name in %j',
    (source) => {
      const result = compile(source, { trust: 'app' })

      expect(result.html).not.toContain('hmx-')
    },
  )
})

/**
 * ADR-0017: a text directive may not follow an alphanumeric character.
 *
 * `12:30` used to parse `:30` as a directive, match no component, and — having no label to
 * render — delete the time. The author had written no HMX at all, which made it a breach of the
 * compatibility guarantee rather than a surprising-but-defensible parse.
 */
describe('a colon attached to a word is not a directive', () => {
  it.each([
    ['The meeting is at 12:30 tonight.\n', 'a time'],
    ['Ratio 3:4 across the board.\n', 'a ratio'],
    ['Use a:b as the key.\n', 'a namespaced key'],
    ['Trains leave at 09:15, 12:30 and 18:45.\n', 'several times in one line'],
    ['Scores were 3:4, 5:2 and 1:0.\n', 'several ratios'],
  ])('leaves %j alone — %s', (source) => {
    const result = compile(source, { trust: 'app' })

    expect(normalize(result.html)).toBe(normalize(referenceHtml(source)))
    // The old behaviour reported an unknown component the author never referenced.
    expect(result.diagnostics).toEqual([])
  })

  // The rule is about what the colon is attached to, not about forbidding the bare form.
  it.each([
    [':badge[ok]{kind=success}\n', 'at the start of a line'],
    ['Status: :badge[ok]{kind=success}\n', 'after a space'],
    ['(:badge[ok]{kind=success})\n', 'after punctuation'],
    ['- :badge[ok]{kind=success}\n', 'after a list marker'],
  ])('still recognises a text directive %s', (source) => {
    const result = compile(source, { trust: 'app' })

    expect(result.html).toContain('hmx-badge')
    expect(result.diagnostics).toEqual([])
  })

  // Block directives begin a line, so there is never a preceding character to test.
  it('leaves leaf and container directives untouched', () => {
    const container = compile(':::note{type=info}\nbody\n:::\n', { trust: 'app' })

    expect(container.html).toContain('hmx-note')
    expect(container.diagnostics).toEqual([])
  })
})
