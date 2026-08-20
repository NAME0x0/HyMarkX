import { describe, expect, it } from 'vitest'
import { format } from '../src/index.js'

describe('format', () => {
  it('normalizes attribute spacing and quoting while preserving order and shorthands', () => {
    const result = format(':::note{type=info   .big   #hero}\nBody\n:::\n')

    expect(result.changed).toBe(true)
    expect(result.source).toContain(':::note{type="info" .big #hero}')
  })

  /**
   * Quoting normalises to double quotes with escapes (ADR-0018).
   *
   * This test previously asserted the opposite — that a value containing a double quote was
   * wrapped in single quotes and emitted raw. That worked only while a value could hold one kind
   * of quote. Once both became expressible, the same rule produced `'he said 'hi' and "bye"'`,
   * which is broken markup: the formatter corrupting a document it was asked to tidy.
   */
  it('escapes double quotes rather than switching quote character', () => {
    const result = format(':::note{title=\'a "b" c\'}\nBody\n:::\n')

    expect(result.source).toContain(String.raw`title="a \"b\" c"`)
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

/**
 * ADR-0018 escapes must survive formatting.
 *
 * The formatter normalises attribute whitespace, so it re-serialises values. Unescaping one on
 * the way through would change the document's meaning simply by formatting it — the worst class
 * of formatter bug, because it is invisible until something downstream breaks.
 */
describe('attribute value escapes', () => {
  it.each([
    String.raw`:::button{on-click="reply = \"yes\""}` + '\nGo\n:::\n',
    String.raw`:::card{title="he said 'hi' and \"bye\""}` + '\nx\n:::\n',
    String.raw`:::card{title="C:\Users\Afsah"}` + '\nx\n:::\n',
  ])('round-trips %j unchanged', (source) => {
    const result = format(source)

    expect(result.source).toBe(source)
    expect(result.changed).toBe(false)
  })

  // Whitespace normalisation still happens; it just must not touch the escapes.
  it('normalises spacing without disturbing escapes', () => {
    const result = format(String.raw`:::card{title="a\"b"   }` + '\nx\n:::\n')

    expect(result.changed).toBe(true)
    expect(result.source).toContain(String.raw`title="a\"b"`)
  })
})
