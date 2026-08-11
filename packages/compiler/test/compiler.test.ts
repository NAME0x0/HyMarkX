import { blockquote, paragraph, root, text } from '@hymarkx/ast'
import type { BlockContent } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import { compile, compileAst } from '../src/index.js'

describe('compile', () => {
  it('handles empty, CRLF, and astral-character documents', () => {
    expect(compile('').html).toBe('')
    expect(compile('# 😀\r\n').html).toBe('<h1>😀</h1>\n')
  })

  it('emits CommonMark constructs without an HMX runtime', () => {
    const result = compile('# Hello\n\nA [link](/docs "Docs") and `code`.\n', { trust: 'app' })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(
      '<h1>Hello</h1>\n<p>A <a href="/docs" title="Docs">link</a> and <code>code</code>.</p>\n',
    )
    expect(result.html).not.toContain('<script')
  })

  it('resolves first definitions and emits no definition nodes', () => {
    const result = compile('[label][id]\n\n[id]: /first "One"\n[id]: /second\n', { trust: 'app' })

    expect(result.html).toBe('<p><a href="/first" title="One">label</a></p>\n')
  })

  it('degrades unknown directives transparently without emitting their attributes', () => {
    const source = [
      ':::card[**Title**]{onclick="alert(1)" data-secret=hidden}',
      'Body :mark[hot]{style="display:none"}',
      ':::',
      '',
      '::note[*Leaf*]{onclick="alert(2)"}',
      '',
    ].join('\n')
    const result = compile(source, { trust: 'app' })

    expect(result.html).toBe('<strong>Title</strong><p>Body hot</p>\n<em>Leaf</em>')
    expect(result.html).not.toContain('onclick')
    expect(result.html).not.toContain('data-secret')
    expect(result.html).not.toContain('style=')
    expect(
      result.diagnostics.map(({ code, severity, message }) => ({ code, severity, message })),
    ).toEqual([
      {
        code: 'HMX2002',
        severity: 'warning',
        message: 'Unknown directive "card"; rendering its content without a wrapper.',
      },
      {
        code: 'HMX2002',
        severity: 'warning',
        message: 'Unknown directive "mark"; rendering its content without a wrapper.',
      },
      {
        code: 'HMX2002',
        severity: 'warning',
        message: 'Unknown directive "note"; rendering its content without a wrapper.',
      },
    ])
  })

  it('emits a 10,000-deep AST without overflowing the call stack', () => {
    let nested: BlockContent = paragraph([text('deep')])
    for (let depth = 0; depth < 10_000; depth += 1) {
      nested = blockquote([nested])
    }

    const result = compileAst(root('0.0.0', [nested]), 'deep')
    expect(result.diagnostics).toEqual([])
    expect(result.html.startsWith('<blockquote>\n'.repeat(10_000))).toBe(true)
    expect(result.html.endsWith('</blockquote>\n'.repeat(10_000))).toBe(true)
  })

  it.each([
    [':::card{ bad\nx\n:::\n', 'a malformed attribute block'],
    [':::card{title={user.name}}\nx\n:::\n', 'an expression-valued attribute'],
    ['::leaf{a={b}}\n', 'a leaf directive with an expression value'],
  ])('warns HMX1011 when a line looks like a directive but has %#: %s', (source) => {
    // The tokenizer declines to open these, so they fall through to ordinary Markdown.
    // Rendering the source verbatim while saying nothing is the worst possible failure.
    const codes = compile(source).diagnostics.map((diagnostic) => diagnostic.code)
    expect(codes).toContain('HMX1011')
  })

  it.each([
    [':: note about something\n', 'prose after two colons and a space'],
    [':::\n', 'bare colons with no name'],
    ['Normal paragraph.\n', 'plain prose'],
    ['```\n:::card{ bad\n```\n', 'a directive-like line inside a code fence'],
  ])('does not warn HMX1011 for %#: %s', (source) => {
    const codes = compile(source).diagnostics.map((diagnostic) => diagnostic.code)
    expect(codes).not.toContain('HMX1011')
  })

  it('reports a recognized directive as unknown rather than unrecognized', () => {
    const codes = compile(':::card{a="ok"}\nx\n:::\n').diagnostics.map((d) => d.code)
    expect(codes).toContain('HMX2002')
    expect(codes).not.toContain('HMX1011')
  })

  it('compiles a 5 MB static document', () => {
    const source = 'a'.repeat(5 * 1024 * 1024)
    const result = compile(source)

    expect(result.diagnostics).toEqual([])
    expect(result.html.length).toBe(source.length + '<p></p>\n'.length)
  }, 30_000)
})
