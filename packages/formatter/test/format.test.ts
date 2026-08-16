import { describe, expect, it } from 'vitest'
import { format } from '../src/index.js'

describe('format', () => {
  it('normalizes attribute spacing and quoting while preserving order and shorthands', () => {
    const result = format(':::note{type=info   .big   #hero}\nBody\n:::\n')

    expect(result.changed).toBe(true)
    expect(result.source).toContain(':::note{type="info" .big #hero}')
  })

  it('uses single quotes when a value contains a double quote', () => {
    const result = format(':::note{title=\'a "b" c\'}\nBody\n:::\n')

    expect(result.source).toContain(`title='a "b" c'`)
  })

  it('normalizes interpolation spacing', () => {
    const result = format('---\ntitle: T\n---\n\n{{title}} and {{  title  }}\n')

    expect(result.source).toContain('{{ title }} and {{ title }}')
  })

  it('does not treat an interpolation inside a code span as an expression', () => {
    const source = '---\ntitle: T\n---\n\nLiteral: `{{title}}`\n'

    expect(format(source).source).toBe(source)
  })

  it('returns malformed documents unchanged rather than half-formatting them', () => {
    const source = ':::note{type=info   }\nunclosed\n'
    const result = format(source)

    expect(result.source).toBe(source)
    expect(result.changed).toBe(false)
    expect(result.diagnostics.map(({ code }) => code)).toContain('HMX1001')
  })

  it('reports no change for an already-formatted document', () => {
    const source = ':::note{type="info"}\nBody\n:::\n'

    expect(format(source)).toMatchObject({ source, changed: false })
  })

  it('preserves CRLF line endings', () => {
    const result = format(':::note{type=info   }\r\nBody\r\n:::\r\n')

    expect(result.source).toContain('\r\n')
    expect(result.source).not.toMatch(/[^\r]\n/)
  })

  it.each(['', '   \n', '\n\n'])('leaves whitespace-only input %j unchanged', (source) => {
    expect(format(source)).toMatchObject({ source, changed: false })
  })

  it('preserves indentation of a directive inside a list item', () => {
    const result = format('- item\n\n  :::note{type=info   }\n  Body\n  :::\n')

    expect(result.source).toContain('  :::note{type="info"}')
    expect(result.source).toContain('  Body')
  })
})
