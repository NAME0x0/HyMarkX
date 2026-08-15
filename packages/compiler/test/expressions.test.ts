import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'

function document(expression: string, frontmatter = ''): string {
  return `${frontmatter === '' ? '' : `---\n${frontmatter}\n---\n`}{{ ${expression} }}`
}

function rendered(expression: string, frontmatter = ''): string {
  const result = compile(document(expression, frontmatter))
  expect(result.diagnostics).toEqual([])
  return result.html
}

function diagnostic(expression: string, code: string, frontmatter = ''): Diagnostic {
  const source = document(expression, frontmatter)
  const result = compile(source)
  const found = result.diagnostics.find((item) => item.code === code)
  expect(found, `expected ${code} for ${expression}`).toBeDefined()
  expect(found?.severity).toBe('error')
  const opening = source.lastIndexOf('{{') + 2
  const closing = source.lastIndexOf('}}')
  expect(found?.span.start.offset).toBeGreaterThanOrEqual(opening)
  expect(found?.span.end.offset).toBeLessThanOrEqual(closing)
  return found as Diagnostic
}

function nativeLooseEqual(left: unknown, right: unknown): boolean {
  return left == right
}

describe('expression evaluation', () => {
  const js = {
    one: 1,
    two: 2,
    three: 3,
    five: 5,
    ten: 10,
    twenty: 20,
    trueValue: true,
    falseValue: false,
    nullValue: null,
  }

  it.each([
    ['1 + 2 * 3', js.one + js.two * js.three],
    ['(1 + 2) * 3', (js.one + js.two) * js.three],
    ['20 / 5 % 3', (js.twenty / js.five) % js.three],
    ['10 - 3 - 2', js.ten - js.three - js.two],
    ['-2 + +5', -js.two + +js.five],
    ['!false', !js.falseValue],
    ['2 < 3', js.two < js.three],
    ['2 <= 2', js.two <= Number('2')],
    ['3 > 2', js.three > js.two],
    ['3 >= 3', js.three >= Number('3')],
    ['2 == "2"', nativeLooseEqual(js.two, '2')],
    ['2 != "3"', !nativeLooseEqual(js.two, '3')],
    ['false || "right"', js.falseValue || 'right'],
    ['true && "right"', js.trueValue && 'right'],
    ['null ?? "fallback"', js.nullValue ?? 'fallback'],
    ['false ? "no" : "yes"', js.falseValue ? 'no' : 'yes'],
    ['true ? false ? "no" : "yes" : "no"', js.trueValue ? (js.falseValue ? 'no' : 'yes') : 'no'],
  ])('matches JavaScript precedence and associativity for %s', (expression, expected) => {
    expect(rendered(expression)).toBe(`<p>${String(expected)}</p>\n`)
  })

  it('evaluates every literal and array/object member form', () => {
    expect(rendered('\'single\' + " double"')).toBe('<p>single double</p>\n')
    expect(rendered('[10, 20][1]')).toBe('<p>20</p>\n')
    expect(rendered('{answer: 42}.answer')).toBe('<p>42</p>\n')
    expect(rendered('{nested: {value: true}}["nested"].value')).toBe('<p>true</p>\n')
  })

  it('resolves identifiers only from frontmatter', () => {
    const source = [
      'title: Dashboard',
      'site:',
      '  name: HyMarkX',
      'items:',
      '  - first',
      '  - second',
    ].join('\n')

    expect(rendered('title + " — " + site.name', source)).toBe('<p>Dashboard — HyMarkX</p>\n')
    expect(rendered('items[1]', source)).toBe('<p>second</p>\n')
    expect(rendered('items.length', source)).toBe('<p>2</p>\n')
  })

  it('short-circuits logical and conditional branches', () => {
    expect(rendered('false && missing')).toBe('<p>false</p>\n')
    expect(rendered('true || missing')).toBe('<p>true</p>\n')
    expect(rendered('"value" ?? missing')).toBe('<p>value</p>\n')
    expect(rendered('true ? "chosen" : missing')).toBe('<p>chosen</p>\n')
  })

  it('renders null and negative zero without leaking implementation strings', () => {
    expect(rendered('null')).toBe('<p></p>\n')
    expect(rendered('-0')).toBe('<p>0</p>\n')
  })

  it('HTML-escapes interpolation results', () => {
    expect(rendered('payload', 'payload: <script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n',
    )
  })

  it('supports optional chaining and preserves chain short-circuiting', () => {
    const frontmatter = 'user: {}'
    expect(rendered('user?.name', frontmatter)).toBe('<p></p>\n')
    expect(rendered('user?.name.deep', frontmatter)).toBe('<p></p>\n')
    expect(rendered('null?.["name"]')).toBe('<p></p>\n')
    expect(diagnostic('(user?.name).deep', 'HMX2041', frontmatter).message).toContain(
      'does not exist',
    )
    expect(diagnostic('user.name', 'HMX2041', frontmatter).message).toContain('"name"')
  })

  it('suggests only near frontmatter identifiers', () => {
    const near = diagnostic('titel', 'HMX2040', 'title: Hello')
    const distant = diagnostic('completelyDifferent', 'HMX2040', 'title: Hello')

    expect(near.suggestion?.replacement).toBe('title')
    expect(near.message).toContain('did you mean "title"')
    expect(distant.suggestion).toBeUndefined()
  })

  it('never exposes inherited or forbidden properties', () => {
    const frontmatter = 'items:\n  - one\nobject:\n  safe: yes'

    expect(diagnostic('items.map', 'HMX2041', frontmatter).message).toContain('does not exist')
    expect(diagnostic('object.toString', 'HMX2041', frontmatter).message).toContain(
      'does not exist',
    )
    expect(diagnostic('items.constructor', 'HMX2044', frontmatter).message).toContain('forbidden')
    expect(diagnostic('object["__proto__"]', 'HMX2044', frontmatter).message).toContain('forbidden')
  })

  it('reports syntax, depth, numeric, and structured-text failures', () => {
    expect(diagnostic('1 +', 'HMX1022').message).toContain('Expected an expression')
    expect(diagnostic(`${'('.repeat(129)}1${')'.repeat(129)}`, 'HMX1021').message).toContain(
      'too deep',
    )
    expect(diagnostic('1 / 0', 'HMX2042').message).toContain('finite')
    expect(diagnostic('1e999', 'HMX2042').message).toContain('finite')
    expect(diagnostic('[1, 2]', 'HMX2043').message).toContain('text position')
    expect(diagnostic('{value: 1}', 'HMX2043').message).toContain('text position')
  })

  it('rejects nullish/logical mixing unless parentheses make it valid JavaScript', () => {
    expect(diagnostic('null ?? false || true', 'HMX1022').message).toContain('without parentheses')
    expect(rendered('(null ?? false) || true')).toBe('<p>true</p>\n')
    expect(rendered('null ?? (false || true)')).toBe('<p>true</p>\n')
  })

  it.each([
    ['value = 1', 'Assignment is not allowed'],
    ['new Thing', 'new expressions are not allowed'],
    ['function () {}', 'Function literals are not allowed'],
    ['value => value', 'Arrow function literals are not allowed'],
    ['this', 'this is not available'],
    ['`value`', 'Template literals are not allowed'],
    ['tag`value`', 'Tagged templates are not allowed'],
    ['import("x")', 'import expressions are not allowed'],
    ['await value', 'await expressions are not allowed'],
    ['function* () {}', 'Generator literals are not allowed'],
    ['/value/', 'Regular expression literals are not allowed'],
    ['value++', 'Increment and decrement are not allowed'],
    ['value, other', 'comma operator is not allowed'],
    ['value()', 'Function calls are not allowed'],
  ])('reports a specific prohibited-construct message for %s', (expression, message) => {
    expect(diagnostic(expression, 'HMX2044').message).toContain(message)
  })

  it('is deterministic and emits no script for expression documents', () => {
    const source = document('title + "!"', 'title: Hello')
    const first = compile(source)
    const second = compile(source)

    expect(first).toEqual(second)
    expect(first.html).toBe('<p>Hello!</p>\n')
    expect(first.html.toLowerCase()).not.toContain('<script')
  })
})
