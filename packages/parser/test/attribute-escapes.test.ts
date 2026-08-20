import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

/**
 * ADR-0018: a backslash escapes a backslash, a double quote or a single quote inside a quoted
 * attribute value.
 *
 * Before this, a value could not contain its own delimiter and there was no escape, so
 * `on-click="reply = \"yes\""` degraded the whole block to a paragraph with `HMX1011` — a
 * warning about a line that "looked like a directive", in a build that exits zero. A value
 * containing *both* quote kinds could not be written at all, because neither wrapper holds one.
 *
 * Sources are built with `String.raw` so what the parser sees is exactly what an author would
 * type. Writing them as ordinary string literals means reading two layers of escaping at once,
 * and the first draft of this file got that wrong twice.
 */
function attributeValue(source: string, name = 'title'): string | undefined {
  let found: string | undefined
  const walk = (node: Record<string, unknown>): void => {
    for (const attribute of (node.attributes ?? []) as { name: string; value?: string }[]) {
      if (attribute.name === name) {
        found = attribute.value
      }
    }
    for (const child of (node.children ?? []) as Record<string, unknown>[]) {
      walk(child)
    }
  }
  walk(parse(source).root as unknown as Record<string, unknown>)
  return found
}

const card = (attributes: string): string => `:::card{${attributes}}\nx\n:::\n`

describe('attribute value escapes', () => {
  it('reads an escaped double quote inside double quotes', () => {
    expect(attributeValue(card(String.raw`title="a\"b"`))).toBe('a"b')
  })

  it('reads an escaped single quote inside single quotes', () => {
    expect(attributeValue(card(String.raw`title='a\'b'`))).toBe("a'b")
  })

  it('reads an escaped backslash', () => {
    expect(attributeValue(card(String.raw`title="a\\b"`))).toBe(String.raw`a\b`)
  })

  // Previously impossible: neither wrapper can hold a value containing both quote characters.
  it('reads a value containing both quote kinds', () => {
    expect(attributeValue(card(String.raw`title="he said 'hi' and \"bye\""`))).toBe(
      `he said 'hi' and "bye"`,
    )
  })

  /**
   * Only those three escape. A general rule where a backslash before any character yields that
   * character would have silently rewritten every Windows path in every attribute, for the
   * benefit of escapes nobody needs in an attribute value.
   */
  it.each([
    [String.raw`title="C:\Users\Afsah"`, String.raw`C:\Users\Afsah`],
    [String.raw`title="a\nb"`, String.raw`a\nb`],
    [String.raw`title="a\tb"`, String.raw`a\tb`],
  ])('leaves a non-escape backslash literal in %s', (attributes, expected) => {
    expect(attributeValue(card(attributes))).toBe(expected)
  })

  // The motivating case: a string literal inside an event handler.
  it('parses a handler containing a string literal', () => {
    const source = `::state{reply=""}\n\n:::button{on-click=${String.raw`"reply = \"yes\""`}}\nGo\n:::\n`

    expect(attributeValue(source, 'on-click')).toBe('reply = "yes"')
  })

  // Unquoted values cannot contain a quote character, so the rule does not reach them.
  it('leaves an unquoted value alone', () => {
    expect(attributeValue(card(String.raw`title=plain\value`))).toBe(String.raw`plain\value`)
  })
})
