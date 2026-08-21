import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import {
  builtinComponents,
  compile,
  type ComponentRegistry,
  type ComponentSchema,
} from '../src/index.js'

function diagnostic(source: string, code: string, components?: ComponentRegistry): Diagnostic {
  const found = compile(source, components === undefined ? {} : { components }).diagnostics.find(
    (item) => item.code === code,
  )
  expect(found, `expected ${code}`).toBeDefined()
  return found as Diagnostic
}

function expectAttributeSpan(source: string, code: string, expectedText: string): Diagnostic {
  const found = diagnostic(source, code)
  expect(source.slice(found.span.start.offset, found.span.end.offset)).toBe(expectedText)
  return found
}

function customRegistry(schema: ComponentSchema): ComponentRegistry {
  return {
    schemas: { [schema.name]: schema },
    renderers: {
      [schema.name]: (_node, attributes) => ({
        wrappers: [
          { tag: 'section', attributes: { 'data-value': String(attributes.value ?? '') } },
        ],
      }),
    },
  }
}

describe('built-in components', () => {
  it('keeps every schema as round-trippable JSON data', () => {
    expect(JSON.parse(JSON.stringify(builtinComponents.schemas))).toEqual(builtinComponents.schemas)
  })

  it.each(['info', 'warning', 'danger', 'success'])('renders note type %s', (type) => {
    const result = compile(`:::note[Title]{type=${type}}\nBody\n:::\n`)
    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(
      `<aside class="hmx-note hmx-note-${type}"><p class="hmx-note-title">Title</p><p>Body</p>\n</aside>\n`,
    )
  })

  /**
   * The neutral wrapper: no default class, no stylesheet, nothing but the author's own
   * attributes. Building this project's site had only `grid` to reach for, so every layout
   * wrapper emitted `--hmx-grid-columns` it never used — the opposite of the proportionality
   * the project claims.
   */
  it('renders box as a bare div and emits no CSS for it', () => {
    const result = compile(':::box{class=hero #top}\nBody\n:::\n')

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe('<div class="hero" id="top"><p>Body</p>\n</div>\n')
    expect(result.css).toBe('')
    expect(result.js).toBe('')
  })

  it.each(['info', 'warning', 'danger', 'success'])('renders badge kind %s', (kind) => {
    const result = compile(`A :badge[new]{kind=${kind}} badge.\n`)
    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain(`<span class="hmx-badge hmx-badge-${kind}">new</span>`)
  })

  it('applies defaults and renders all five built-ins without JavaScript', () => {
    const source = [
      ':::note[Note]',
      'One',
      ':::',
      '',
      ':::card[Card]{#hero .wide .raised title="A & B"}',
      'Two',
      ':::',
      '',
      ':::grid',
      'Three',
      ':::',
      '',
      ':::metric[Revenue]',
      '42',
      ':::',
      '',
      'A :badge[new] badge.',
      '',
    ].join('\n')
    const result = compile(source)

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('<aside class="hmx-note hmx-note-info">')
    expect(result.html).toContain(
      '<article class="hmx-card wide raised" id="hero" title="A &amp; B">',
    )
    expect(result.html).toContain(
      '<div class="hmx-grid" style="--hmx-grid-columns:3;--hmx-grid-gap:4">',
    )
    expect(result.html).toContain('<div class="hmx-metric">')
    expect(result.html).toContain('<span class="hmx-badge hmx-badge-info">new</span>')
    expect(result.html.toLowerCase()).not.toContain('<script')
  })

  it('renders validated grid integers only', () => {
    const result = compile(':::grid{columns=12 gap=0}\nBody\n:::\n')
    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('style="--hmx-grid-columns:12;--hmx-grid-gap:0"')
  })

  it('merges extra components and lets caller entries replace built-ins by name', () => {
    const components = customRegistry({
      name: 'card',
      kinds: ['container'],
      attributes: {},
      children: 'block',
      label: 'optional',
      description: 'Caller card replacement.',
    })
    const result = compile(':::card\nCustom\n:::\n\n:::note\nBuilt in\n:::\n', { components })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('<section data-value=""><p>Custom</p>')
    expect(result.html).toContain('<aside class="hmx-note hmx-note-info"><p>Built in</p>')
  })
})

describe('component validation diagnostics', () => {
  it('reports HMX2001 on the unknown attribute name and suggests a close match', () => {
    const found = expectAttributeSpan(':::note{typ=warning}\n:::\n', 'HMX2001', 'typ')
    expect(found.severity).toBe('warning')
    expect(found.suggestion?.replacement).toBe('type')
  })

  it('reports HMX2002 with useful and intentionally absent suggestions', () => {
    const close = diagnostic(':::mertic\n:::\n', 'HMX2002')
    const distant = diagnostic(':::zzzzzzzz\n:::\n', 'HMX2002')
    expect(close.severity).toBe('warning')
    expect(close.suggestion?.replacement).toBe('metric')
    expect(distant.suggestion).toBeUndefined()
  })

  it('reports HMX2003 for a missing required attribute while retaining unknown warnings', () => {
    const components = customRegistry({
      name: 'required',
      kinds: ['container'],
      attributes: {
        value: { type: 'string', required: true, description: 'The displayed value.' },
      },
      children: 'block',
      label: 'optional',
      description: 'Required attribute test component.',
    })
    const result = compile(':::required{typo=x}\n:::\n', { components })
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2001', 'HMX2003'])
    const found = result.diagnostics[1]
    expect(found?.severity).toBe('error')
    expect(found?.message).toContain('The displayed value.')
  })

  it('reports HMX2004 on an enum value and suggests the nearest permitted value', () => {
    const found = expectAttributeSpan(':::note{type=warnign}\n:::\n', 'HMX2004', 'warnign')
    expect(found.severity).toBe('error')
    expect(found.message).toContain('info, warning, danger, success')
    expect(found.suggestion?.replacement).toBe('warning')
  })

  it.each([
    [':::grid{columns=nope}\n:::\n', 'nope'],
    [':::grid{columns=0}\n:::\n', '0'],
    [':::grid{columns=13}\n:::\n', '13'],
    [':::grid{columns=3.5}\n:::\n', '3.5'],
    [':::card{#2bad}\n:::\n', '2bad'],
    [':::card{.safe class="bad; color:red"}\n:::\n', 'bad; color:red'],
    [':::card{title}\n:::\n', 'title'],
  ])('reports HMX2005 at the invalid attribute value for %s', (source, text) => {
    const found = expectAttributeSpan(source, 'HMX2005', text)
    expect(found.severity).toBe('error')
  })

  it('validates boolean and URL attributes with the host-selected URL policy', () => {
    const components = customRegistry({
      name: 'typed',
      kinds: ['text'],
      attributes: {
        value: { type: 'boolean', description: 'A boolean value.' },
        href: { type: 'url', description: 'A destination URL.' },
      },
      children: 'phrasing',
      label: 'optional',
      description: 'Typed test component.',
    })
    const invalidBoolean = compile(':typed[x]{value=yes}', { components })
    const bareBoolean = compile(':typed[x]{value}', { components })
    const documentUrl = compile(':typed[x]{href=javascript:alert}', { components })
    const appUrl = compile(':typed[x]{href=javascript:alert}', { components, trust: 'app' })

    expect(invalidBoolean.diagnostics.map(({ code }) => code)).toEqual(['HMX2005'])
    expect(bareBoolean.diagnostics).toEqual([])
    expect(documentUrl.diagnostics.map(({ code }) => code)).toEqual(['HMX2005'])
    expect(appUrl.diagnostics).toEqual([])
  })

  it('reports HMX2006 at forbidden content', () => {
    const components = customRegistry({
      name: 'empty',
      kinds: ['container'],
      attributes: {},
      children: 'none',
      label: 'optional',
      description: 'Empty test component.',
    })
    const source = ':::empty\nBody\n:::\n'
    const found = diagnostic(source, 'HMX2006', components)
    expect(found.severity).toBe('warning')
    expect(source.slice(found.span.start.offset, found.span.end.offset)).toContain('Body')
  })

  it('reports HMX2007 for both missing required and present forbidden labels', () => {
    const required = customRegistry({
      name: 'labelled',
      kinds: ['container'],
      attributes: {},
      children: 'block',
      label: 'required',
      description: 'Label test component.',
    })
    const forbidden = customRegistry({
      name: 'unlabelled',
      kinds: ['container'],
      attributes: {},
      children: 'block',
      label: 'forbidden',
      description: 'Label test component.',
    })
    expect(diagnostic(':::labelled\n:::\n', 'HMX2007', required).severity).toBe('error')
    expect(diagnostic(':::unlabelled[no]\n:::\n', 'HMX2007', forbidden).severity).toBe('error')
  })

  it('reports HMX2008 and degrades the invalid form transparently', () => {
    const result = compile(':::badge\nBody\n:::\n')
    expect(result.diagnostics.map(({ code, severity }) => ({ code, severity }))).toContainEqual({
      code: 'HMX2008',
      severity: 'error',
    })
    expect(result.html).toBe('<p>Body</p>\n')
  })

  it('reports HMX2010 on the second id and combines classes in source order', () => {
    const source = ':::card{#a .x #b .y}\n:::\n'
    const result = compile(source)
    const found = result.diagnostics.find(({ code }) => code === 'HMX2010')
    expect(found?.severity).toBe('warning')
    expect(
      found === undefined ? '' : source.slice(found.span.start.offset, found.span.end.offset),
    ).toBe('#b')
    expect(result.html).toBe('<article class="hmx-card x y" id="b"></article>\n')
  })
})

describe('component security', () => {
  it('never copies invalid grid author text into style', () => {
    const source = ':::grid{columns="3;background:url(javascript:alert(1))"}\nBody\n:::\n'
    const result = compile(source)
    expect(result.diagnostics.map(({ code }) => code)).toContain('HMX2005')
    expect(result.html).not.toContain('style=')
    expect(result.html).not.toContain('background')
    expect(result.html).not.toContain('javascript')
  })

  it('escapes every generated universal attribute value', () => {
    const result = compile(':::card{title="&quot; onmouseover=&quot;alert(1)"}\n:::\n')
    expect(result.html).toContain('title="&quot; onmouseover=&quot;alert(1)"')
    expect(result.html).not.toContain(' onmouseover="')
  })

  it('does not pollute Object.prototype', () => {
    compile(':badge[x]{__proto__=polluted constructor=bad prototype=bad}')
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})
