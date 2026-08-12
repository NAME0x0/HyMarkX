import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'

describe('frontmatter compilation', () => {
  it('preserves reserved and custom values in null-prototype mappings', () => {
    const result = compile(`---
title: Example
description: Metadata
layout: article
lang: en
draft: false
tags: [one, two]
custom:
  count: 2
---
# Body
`)

    expect(result.diagnostics).toEqual([])
    expect(result.frontmatter).toEqual({
      title: 'Example',
      description: 'Metadata',
      layout: 'article',
      lang: 'en',
      draft: false,
      tags: ['one', 'two'],
      custom: { count: 2 },
    })
    expect(Object.getPrototypeOf(result.frontmatter)).toBeNull()
    expect(Object.getPrototypeOf(result.frontmatter?.custom)).toBeNull()
    expect(result.html).toBe('<h1>Body</h1>\n')
  })

  it('carries no metadata for an empty block and supports a metadata-only document', () => {
    // `---\n---` is two thematic breaks in CommonMark (example 98) and stays that way.
    const empty = compile('---\n---\n')
    const only = compile('---\ntitle: Only\n---')

    expect(empty.frontmatter).toBeUndefined()
    expect(empty.diagnostics).toEqual([])
    expect(empty.html).toBe('<hr />\n<hr />\n')
    expect(only.frontmatter).toEqual({ title: 'Only' })
    expect(only.html).toBe('')
  })

  it.each([
    ['sequence', '- one'],
    ['scalar', 'plain'],
    ['null', 'null'],
  ])('leaves a %s root to Markdown rather than reporting HMX2020', (_name, value) => {
    // None of these carry a `key:` line, so they are indistinguishable from ordinary
    // Markdown between two thematic breaks. Conformance wins; see SPEC §4.3.
    const result = compile(`---\n${value}\n---`)

    expect(result.frontmatter).toBeUndefined()
    expect(result.diagnostics).toEqual([])
  })

  it('maps YAML syntax errors back into the real document', () => {
    const result = compile('---\ntitle: [\n---\n# Body\n')
    const diagnostic = result.diagnostics[0]

    expect(diagnostic?.code).toBe('HMX2021')
    expect(diagnostic?.span.start).toEqual({ line: 2, column: 9, offset: 12 })
    expect(diagnostic?.span.start.offset).toBeGreaterThan(0)
  })

  it('validates every reserved key type', () => {
    const result = compile(`---
title: 1
description: false
layout: [article]
lang: null
draft: "false"
---`)

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'HMX2022',
      'HMX2022',
      'HMX2022',
      'HMX2022',
      'HMX2022',
    ])
  })

  it('uses YAML 1.2 core values and rejects duplicate or complex keys', () => {
    const core = compile('---\ntitle: yes\n---')
    const duplicate = compile('---\na: 1\na: 2\n---')
    const complex = compile('---\n? [complex]\n: value\n---')

    expect(core.frontmatter).toEqual({ title: 'yes' })
    expect(core.diagnostics).toEqual([])
    // `a: 1` marks this as intended frontmatter, so the duplicate key is reported.
    expect(duplicate.diagnostics.map(({ code }) => code)).toEqual(['HMX2021'])
    // A complex key has no `key:` line, so it is indistinguishable from Markdown and
    // degrades silently. Complex keys are rejected either way: they never become data.
    expect(complex.diagnostics).toEqual([])
    expect(complex.frontmatter).toBeUndefined()
  })

  it('keeps merge keys as ordinary data when merge semantics are disabled', () => {
    const result = compile(`---
base: &base
  inherited: blocked
merged:
  <<: *base
  own: value
---`)

    expect(result.diagnostics).toEqual([])
    expect(result.frontmatter?.merged).toEqual({
      '<<': { inherited: 'blocked' },
      own: 'value',
    })
    expect(result.frontmatter?.merged).not.toHaveProperty('inherited')
  })

  it('omits forbidden keys at every mapping depth without polluting prototypes', () => {
    const result = compile(`---
__proto__: root
constructor: root
prototype: root
nested:
  __proto__: nested
  safe: value
---`)

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'HMX3007',
      'HMX3007',
      'HMX3007',
      'HMX3007',
    ])
    expect(result.frontmatter).toEqual({ nested: { safe: 'value' } })
    expect(Object.getPrototypeOf(result.frontmatter)).toBeNull()
    expect(Object.getPrototypeOf(result.frontmatter?.nested)).toBeNull()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  // `---` is ordinary CommonMark too. A leading block is frontmatter only when it parses
  // as a YAML mapping; otherwise Markdown keeps it, because SPEC §3 outranks frontmatter.
  it.each([
    [
      'a thematic break followed by setext headings',
      '---\nFoo\n---\nBar\n---\nBaz\n',
      '<hr />\n<h2>Foo</h2>\n<h2>Bar</h2>\n<p>Baz</p>\n',
    ],
    ['two thematic breaks', '---\n---\n', '<hr />\n<hr />\n'],
    [
      'a leading emphasis line',
      '---\n*emphasis*\n---\nBody\n',
      '<hr />\n<h2><em>emphasis</em></h2>\n<p>Body</p>\n',
    ],
  ])('treats %s as Markdown, not frontmatter', (_label, source, html) => {
    const result = compile(source, { trust: 'app', gfm: false })

    expect(result.html).toBe(html)
    expect(result.diagnostics).toEqual([])
    expect(result.frontmatter).toBeUndefined()
  })

  it('reports malformed frontmatter instead of silently rendering it as prose', () => {
    // Falling back to Markdown must not swallow the error: the `key:` line shows the
    // author meant this to be frontmatter.
    const result = compile('---\ntitle: [unclosed\n---\n# Body\n', { trust: 'app', gfm: false })

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('HMX2021')
    expect(result.html).toContain('<h1>Body</h1>')
    expect(result.frontmatter).toBeUndefined()
  })

  it('stays silent when a non-mapping block was never meant as frontmatter', () => {
    const result = compile('---\n- a\n- b\n---\nBody\n', { trust: 'app', gfm: false })

    expect(result.diagnostics).toEqual([])
    expect(result.frontmatter).toBeUndefined()
  })

  it.each(['document', 'app'] as const)('never emits frontmatter in %s trust mode', (trust) => {
    const result = compile('---\nsecret: never-render-this\n---\nBody\n', { trust })

    expect(result.html).toBe('<p>Body</p>\n')
    expect(result.html).not.toContain('secret')
    expect(result.html).not.toContain('never-render-this')
  })
})
