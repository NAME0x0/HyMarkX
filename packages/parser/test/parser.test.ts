import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

describe('parse', () => {
  it('returns an empty root with a real zero-length span', () => {
    const result = parse('')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toEqual([])
    expect(result.root.position).toEqual({
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    })
  })

  it('strips one leading BOM before calculating offsets', () => {
    const result = parse('\ufeffhello')

    expect(result.source).toBe('hello')
    expect(result.root.children[0]?.position.start.offset).toBe(0)
  })

  it('normalizes CRLF and lone CR before parsing', () => {
    const lf = parse('one\n\ntwo')
    const crlf = parse('one\r\n\r\ntwo')
    const cr = parse('one\r\rtwo')

    expect(crlf).toEqual(lf)
    expect(cr).toEqual(lf)
  })

  it('counts UTF-16 code units for astral characters', () => {
    const result = parse('a\n\n😀𝄞')
    const paragraph = result.root.children[1]
    const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined

    expect(text?.position).toEqual({
      start: { line: 3, column: 1, offset: 3 },
      end: { line: 3, column: 5, offset: 7 },
    })
  })

  it('uses tabs for Markdown indentation but counts each tab as one column', () => {
    const codeResult = parse('\tcode')
    const listResult = parse('-\titem')
    const list = listResult.root.children[0]
    const item = list?.type === 'list' ? list.children[0] : undefined
    const paragraph = item?.children[0]
    const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined

    expect(codeResult.root.children[0]).toMatchObject({
      type: 'code',
      value: 'code',
      position: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 6, offset: 5 },
      },
    })
    expect(text).toMatchObject({
      type: 'text',
      value: 'item',
      position: { start: { line: 1, column: 3, offset: 2 } },
    })
  })

  it('can disable every GFM extension', () => {
    const result = parse('~~x~~\n\n|a|b|\n\n- [ ] x', { gfm: false })

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: '~~x~~' }],
    })
    expect(result.root.children[1]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: '|a|b|' }],
    })
    expect(result.root.children[2]).toMatchObject({
      type: 'list',
      children: [
        {
          checked: null,
          children: [{ type: 'paragraph', children: [{ type: 'text', value: '[ ] x' }] }],
        },
      ],
    })
  })

  it('converts 10,000 nested block quotes without overflowing our own stack', () => {
    // GFM is disabled here deliberately: this asserts that OUR iterative converter
    // survives deep nesting. With GFM on, the recursive transform inside
    // mdast-util-gfm-autolink-literal overflows first — see the next test.
    const result = parse(`${'> '.repeat(10_000)}deep.`, { gfm: false })

    expect(result.diagnostics).toEqual([])
    let depth = 0
    let node = result.root.children[0]
    while (node?.type === 'blockquote') {
      depth += 1
      node = node.children[0]
    }
    expect(depth).toBe(10_000)
  })

  it('reports deep nesting as HMX1002 instead of crashing when GFM is enabled', () => {
    const result = parse(`${'> '.repeat(10_000)}deep.`)

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.code).toBe('HMX1002')
    expect(result.diagnostics[0]?.severity).toBe('error')
    expect(result.root.children).toEqual([])
  })

  it('parses a 5 MB document without throwing', () => {
    const source = 'a'.repeat(5 * 1024 * 1024)
    let result: ReturnType<typeof parse> | undefined

    expect(() => {
      result = parse(source)
    }).not.toThrow()
    expect(result?.diagnostics).toEqual([])
  }, 30_000)

  it('never throws for 200 seeded random UTF-16 strings', () => {
    let state = 0x484d5832
    const random = (): number => {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return state >>> 0
    }

    for (let sample = 0; sample < 200; sample += 1) {
      const length = random() % 257
      let source = ''
      for (let index = 0; index < length; index += 1) {
        source += String.fromCharCode(random() & 0xffff)
      }

      expect(() => parse(source), `sample ${sample}`).not.toThrow()
    }
  })
})
