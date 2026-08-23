import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

function onlyChild(source: string) {
  const result = parse(source)
  expect(result.diagnostics).toEqual([])
  expect(result.root.children).toHaveLength(1)
  return result.root.children[0]
}

describe('directives', () => {
  it('parses text, leaf, and container directives into HMX-owned node shapes', () => {
    const result = parse(
      ':badge[**new**]{tone=warm}\n\n::note[*Read me*]{urgent}\n\n:::card[**Title**]{#hero}\nBody\n:::\n',
    )

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toMatchObject([
      {
        type: 'paragraph',
        children: [
          {
            type: 'textDirective',
            name: 'badge',
            attributes: [{ name: 'tone', value: 'warm' }],
            children: [{ type: 'strong', children: [{ type: 'text', value: 'new' }] }],
          },
        ],
      },
      {
        type: 'leafDirective',
        name: 'note',
        attributes: [{ name: 'urgent', value: null }],
        label: [{ type: 'emphasis', children: [{ type: 'text', value: 'Read me' }] }],
      },
      {
        type: 'containerDirective',
        name: 'card',
        attributes: [{ name: 'id', value: 'hero' }],
        label: [{ type: 'strong', children: [{ type: 'text', value: 'Title' }] }],
        children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Body' }] }],
      },
    ])
  })

  it('preserves the exact span of every attribute in the required card example', () => {
    const source = ':::card{#hero .large title="Revenue" bare}\n:::\n'
    const node = onlyChild(source)

    expect(node).toMatchObject({ type: 'containerDirective' })
    if (node?.type !== 'containerDirective') {
      throw new Error('expected container directive')
    }

    expect(node.attributes).toEqual([
      {
        name: 'id',
        value: 'hero',
        position: {
          start: { line: 1, column: 9, offset: 8 },
          end: { line: 1, column: 14, offset: 13 },
        },
        nameSpan: {
          start: { line: 1, column: 9, offset: 8 },
          end: { line: 1, column: 14, offset: 13 },
        },
        valueSpan: {
          start: { line: 1, column: 10, offset: 9 },
          end: { line: 1, column: 14, offset: 13 },
        },
      },
      {
        name: 'class',
        value: 'large',
        position: {
          start: { line: 1, column: 15, offset: 14 },
          end: { line: 1, column: 21, offset: 20 },
        },
        nameSpan: {
          start: { line: 1, column: 15, offset: 14 },
          end: { line: 1, column: 21, offset: 20 },
        },
        valueSpan: {
          start: { line: 1, column: 16, offset: 15 },
          end: { line: 1, column: 21, offset: 20 },
        },
      },
      {
        name: 'title',
        value: 'Revenue',
        position: {
          start: { line: 1, column: 22, offset: 21 },
          end: { line: 1, column: 37, offset: 36 },
        },
        nameSpan: {
          start: { line: 1, column: 22, offset: 21 },
          end: { line: 1, column: 27, offset: 26 },
        },
        valueSpan: {
          start: { line: 1, column: 29, offset: 28 },
          end: { line: 1, column: 36, offset: 35 },
        },
      },
      {
        name: 'bare',
        value: null,
        position: {
          start: { line: 1, column: 38, offset: 37 },
          end: { line: 1, column: 42, offset: 41 },
        },
        nameSpan: {
          start: { line: 1, column: 38, offset: 37 },
          end: { line: 1, column: 42, offset: 41 },
        },
      },
    ])
  })

  it('preserves attribute order, duplicates, and bare versus empty values', () => {
    const result = parse(':x[label]{a a="" .large .large}')
    const paragraph = result.root.children[0]
    const node = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined

    expect(result.diagnostics).toEqual([])
    expect(node).toMatchObject({
      type: 'textDirective',
      attributes: [
        { name: 'a', value: null },
        { name: 'a', value: '' },
        { name: 'class', value: 'large' },
        { name: 'class', value: 'large' },
      ],
    })
  })

  it('keeps escaped directives and directives in code blocks literal', () => {
    const source = '\\:::card\n\n```md\n:::inside\n```\n\n    :::indented\n'
    const result = parse(source)

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toMatchObject([
      { type: 'paragraph', children: [{ type: 'text', value: ':::card' }] },
      { type: 'code', value: ':::inside', lang: 'md' },
      { type: 'code', value: ':::indented' },
    ])
  })

  it('does not recognize directives inside an unmatched CommonMark angle bracket', () => {
    const result = parse('<m:abc>', { gfm: false })
    const escaped = parse('\\<m:abc>')
    const node = result.root.children[0]

    expect(result.diagnostics).toEqual([])
    expect(node).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: '<m:abc>' }],
    })
    expect(escaped.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', value: '<m:abc>' }],
    })
  })

  it('recognizes only the ASCII directive-name grammar', () => {
    const result = parse(':a-b_2[ok] :é[no] :a😀[no]\n\n::é[no]\n\n:::a😀\nbody\n:::\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'textDirective', name: 'a-b_2' },
        { type: 'text', value: ' :é[no] :a😀[no]' },
      ],
    })
    expect(JSON.stringify(result.root)).not.toContain('leafDirective')
    expect(JSON.stringify(result.root)).not.toContain('containerDirective')
  })

  it('supports nested containers, block containers, and inline interactions', () => {
    const source = [
      '::::outer',
      ':::inner',
      'nested',
      ':::',
      '::::',
      '',
      '> :::quote',
      '> quoted',
      '> :::',
      '',
      '- :::item',
      '  listed',
      '  :::',
      '',
      '*:mark[inside emphasis]* and [a :mark[link label]](/url)',
      '',
      ':x. :x, :tada:',
      '',
    ].join('\n')
    const result = parse(source)

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({
      type: 'containerDirective',
      name: 'outer',
      children: [
        {
          type: 'containerDirective',
          name: 'inner',
          children: [{ type: 'paragraph', children: [{ type: 'text', value: 'nested' }] }],
        },
      ],
    })
    expect(result.root.children[1]).toMatchObject({
      type: 'blockquote',
      children: [{ type: 'containerDirective', name: 'quote' }],
    })
    expect(result.root.children[2]).toMatchObject({
      type: 'list',
      children: [{ children: [{ type: 'containerDirective', name: 'item' }] }],
    })
    expect(result.root.children[3]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'emphasis', children: [{ type: 'textDirective', name: 'mark' }] },
        { type: 'text', value: ' and ' },
        { type: 'link', children: [{ type: 'text', value: 'a ' }, { type: 'textDirective' }] },
      ],
    })
    expect(result.root.children[4]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'textDirective', name: 'x', children: [] },
        { type: 'text', value: '. ' },
        { type: 'textDirective', name: 'x', children: [] },
        { type: 'text', value: ', :tada:' },
      ],
    })
  })

  it('decodes quoted attribute values containing braces, quotes, and escapes', () => {
    const node = onlyChild(':x[label]{brace="}" quote=\'"\' escaped="a\\}b"}')

    expect(node).toMatchObject({
      type: 'paragraph',
      children: [
        {
          type: 'textDirective',
          attributes: [
            { name: 'brace', value: '}' },
            { name: 'quote', value: '"' },
            { name: 'escaped', value: 'a}b' },
          ],
        },
      ],
    })
  })

  it('accepts empty attributes and directives without labels or attributes', () => {
    const result = parse('::empty[]\n\n:::first[]{}\n:::\n\n:::last   \n:::', {
      gfm: false,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toMatchObject([
      { type: 'leafDirective', name: 'empty', attributes: [], label: [] },
      {
        type: 'containerDirective',
        name: 'first',
        attributes: [],
        label: [],
        children: [],
      },
      { type: 'containerDirective', name: 'last', attributes: [], children: [] },
    ])
  })

  it('reports an unclosed container and recovers its remaining content', () => {
    const source = ':::card\nfirst\n\nsecond\n'
    const result = parse(source)

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HMX1001',
        severity: 'error',
        span: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 4, offset: 3 },
        },
        related: [
          expect.objectContaining({
            span: {
              start: { line: 5, column: 1, offset: 22 },
              end: { line: 5, column: 1, offset: 22 },
            },
          }),
        ],
      }),
    ])
    expect(result.root.children[0]).toMatchObject({
      type: 'containerDirective',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'first' }] },
        { type: 'paragraph', children: [{ type: 'text', value: 'second' }] },
      ],
    })
  })

  it.each([
    [':x[label]{title={user.name}}', 'textDirective'],
    ['::x[label]{title={user.name}}\n', 'leafDirective'],
    [':::x[label]{title={user.name}}\n:::\n', 'containerDirective'],
  ])('retains an expression attribute on a %s', (source, type) => {
    const result = parse(source)
    const serialized = JSON.stringify(result.root)

    expect(result.diagnostics).toEqual([])
    expect(serialized).not.toContain('"value":"}"')
    expect(serialized).toContain(`"type":"${type}"`)
    expect(serialized).toContain('"name":"title","value":"user.name"')
  })

  it('balances nested object braces and quoted braces in expression attributes', () => {
    const result = parse(':x[label]{value={{nested: {text: "}"}}}}')
    const paragraph = result.root.children[0]
    const directive = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined

    expect(result.diagnostics).toEqual([])
    expect(directive).toMatchObject({
      type: 'textDirective',
      attributes: [{ name: 'value', value: '{nested: {text: "}"}}' }],
    })
  })

  it('drops forbidden attribute names without polluting object prototypes', () => {
    const result = parse(':x[label]{safe=ok __proto__=polluted constructor=bad prototype=bad}')

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'HMX3005',
      'HMX3005',
      'HMX3005',
    ])
    expect(result.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'textDirective', attributes: [{ name: 'safe', value: 'ok' }] }],
    })
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('calculates CRLF and astral value spans against normalized UTF-16 source', () => {
    const result = parse('before\r\n\r\n:x[label]{value="😀"}\r\n')
    const paragraph = result.root.children[1]
    const directive = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined

    expect(result.source).toBe('before\n\n:x[label]{value="😀"}\n')
    expect(directive).toMatchObject({
      type: 'textDirective',
      attributes: [
        {
          value: '😀',
          valueSpan: {
            start: { line: 3, column: 18, offset: 25 },
            end: { line: 3, column: 20, offset: 27 },
          },
        },
      ],
    })
  })
})

/**
 * ADR-0021. Both rules exist because building this project's own documentation page produced
 * silently wrong output, so both are held here rather than left to the golden fixtures.
 */
describe('container nesting and code fences (ADR-0021)', () => {
  /**
   * The failure this fixed was silent: the `:::` closing a quoted sample closed the container
   * around it, the code block was truncated at that line, and no diagnostic was emitted. A page
   * that teaches the syntax quotes the syntax, so this is the documentation case exactly.
   */
  it('does not read a closing fence inside a fenced code block', () => {
    const result = parse(':::box\n\n```md\n:::note\nBody\n:::\n```\n\n:::\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toHaveLength(1)
    const container = result.root.children[0] as { type: string; children: unknown[] }
    expect(container.type).toBe('containerDirective')
    expect(container.children).toMatchObject([
      { type: 'code', lang: 'md', value: ':::note\nBody\n:::' },
    ])
  })

  it('closes a code fence only on the same character, at least as long', () => {
    // The `~~~` never closes the backtick fence, so the container's own fence stays quoted too.
    const result = parse(':::box\n\n````md\n~~~\n:::\n````\n\n:::\n')

    expect(result.diagnostics).toEqual([])
    const container = result.root.children[0] as { children: { value: string }[] }
    expect(container.children[0]?.value).toBe('~~~\n:::')
  })

  it('nests containers of the same colon count', () => {
    const result = parse(':::grid\n:::card\nBody\n:::\n:::\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children).toMatchObject([
      {
        type: 'containerDirective',
        name: 'grid',
        children: [{ type: 'containerDirective', name: 'card' }],
      },
    ])
  })

  /**
   * The rule every existing document was written against. A closing fence closes the innermost
   * container opened with no more colons than it carries, so giving the outer fence more colons
   * still means what it always meant.
   */
  it('keeps the longer-outer-fence form working unchanged', () => {
    const result = parse('::::grid\n:::card\nBody\n:::\n::::\n')

    expect(result.diagnostics.map(({ code }) => code)).toEqual([])
    expect(result.root.children).toMatchObject([
      {
        type: 'containerDirective',
        name: 'grid',
        children: [{ type: 'containerDirective', name: 'card' }],
      },
    ])
  })

  it('still reports an unclosed container', () => {
    const result = parse(':::grid\n:::card\nBody\n:::\n')

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX1001'])
  })
})
