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

  it('compiles a 5 MB static document', () => {
    const source = 'a'.repeat(5 * 1024 * 1024)
    const result = compile(source)

    expect(result.diagnostics).toEqual([])
    expect(result.html.length).toBe(source.length + '<p></p>\n'.length)
  }, 30_000)
})
