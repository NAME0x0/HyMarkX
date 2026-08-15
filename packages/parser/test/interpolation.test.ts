import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

function interpolationChildren(source: string) {
  const result = parse(source)
  expect(result.diagnostics).toEqual([])
  const paragraph = result.root.children[0]
  expect(paragraph?.type).toBe('paragraph')
  return paragraph?.type === 'paragraph' ? paragraph.children : []
}

describe('text interpolation', () => {
  it('retains trimmed raw expression text and the full source span', () => {
    const result = parse('Before {{  title  }} after')
    const paragraph = result.root.children[0]
    const node = paragraph?.type === 'paragraph' ? paragraph.children[1] : undefined

    expect(result.diagnostics).toEqual([])
    expect(node).toEqual({
      type: 'interpolation',
      value: 'title',
      position: {
        start: { line: 1, column: 8, offset: 7 },
        end: { line: 1, column: 21, offset: 20 },
      },
    })
  })

  it('leaves expression parsing to the compiler', () => {
    expect(interpolationChildren('{{ a + }}')).toMatchObject([
      { type: 'interpolation', value: 'a +' },
    ])
  })

  it('keeps the sigil literal inside an inline code span', () => {
    const result = parse('`{{ title }}`')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'inlineCode', value: '{{ title }}' }],
    })
    expect(JSON.stringify(result.root)).not.toContain('interpolation')
  })

  it('keeps the sigil literal inside a fenced code block', () => {
    const result = parse('```hmx\n{{ title }}\n```\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({ type: 'code', value: '{{ title }}' })
    expect(JSON.stringify(result.root)).not.toContain('interpolation')
  })

  it('keeps the sigil literal inside an indented code block', () => {
    const result = parse('    {{ title }}\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toMatchObject({ type: 'code', value: '{{ title }}' })
    expect(JSON.stringify(result.root)).not.toContain('interpolation')
  })

  it('honors the CommonMark backslash escape', () => {
    expect(interpolationChildren('\\{{ title }}')).toMatchObject([
      { type: 'text', value: '{{ title }}' },
    ])
  })

  it('survives every required phrasing position', () => {
    const source = [
      '# {{ title }}',
      '',
      '*{{ title }}* and [{{ title }}](/docs)',
      '',
      '- {{ title }}',
      '',
      '| Value |',
      '| --- |',
      '| {{ title }} |',
      '',
      ':::note[{{ title }}]',
      'Body',
      ':::',
      '',
    ].join('\n')
    const result = parse(source)
    const serialized = JSON.stringify(result.root)

    expect(result.diagnostics).toEqual([])
    expect(serialized.match(/"type":"interpolation"/g)).toHaveLength(6)
    expect(result.root.children.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'table',
      'containerDirective',
    ])
  })

  it('balances object braces and braces inside strings', () => {
    expect(interpolationChildren('{{{a: {b: 1}, text: "}}"}}}')).toMatchObject([
      { type: 'interpolation', value: '{a: {b: 1}, text: "}}"}' },
    ])
  })

  it('reports HMX1020 at an unterminated opening and recovers as text', () => {
    const source = 'Before {{ title\n\n# After\n'
    const result = parse(source)

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'HMX1020',
        severity: 'error',
        span: {
          start: { line: 1, column: 8, offset: 7 },
          end: { line: 1, column: 10, offset: 9 },
        },
      }),
    ])
    expect(JSON.stringify(result.root)).not.toContain('interpolation')
    expect(result.root.children[1]).toMatchObject({ type: 'heading', depth: 1 })
  })
})
