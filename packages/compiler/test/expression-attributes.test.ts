import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'
import type { ComponentRegistry } from '../src/index.js'

const typedComponents: ComponentRegistry = {
  schemas: {
    typed: {
      name: 'typed',
      kinds: ['text'],
      attributes: {
        text: { type: 'string', description: 'Text.' },
        count: { type: 'number', min: 1, max: 10, description: 'Count.' },
        enabled: { type: 'boolean', description: 'Enabled.' },
        tone: { type: 'enum', values: ['warm', 'cool'], description: 'Tone.' },
        ident: { type: 'identifier', description: 'Identifier.' },
        href: { type: 'url', description: 'URL.' },
      },
      children: 'phrasing',
      label: 'optional',
      description: 'Typed expression test.',
    },
  },
  renderers: {
    typed: (_node, attributes) => ({
      wrappers: [
        {
          tag: 'span',
          attributes: Object.fromEntries(
            Object.entries(attributes).map(([name, value]) => [`data-${name}`, String(value)]),
          ),
        },
      ],
    }),
  },
}

function expressionDocument(attributes: string): string {
  return [
    '---',
    'text: hello',
    'count: 3',
    'enabled: true',
    'tone: warm',
    'ident: section-1',
    'href: /docs',
    '---',
    `:typed[x]{${attributes}}`,
  ].join('\n')
}

function firstDiagnostic(source: string, code: string): Diagnostic {
  const found = compile(source, { components: typedComponents }).diagnostics.find(
    (diagnostic) => diagnostic.code === code,
  )
  expect(found, `expected ${code}`).toBeDefined()
  return found as Diagnostic
}

describe('expression-valued attributes', () => {
  it('resolves every schema type before validation', () => {
    const result = compile(
      expressionDocument(
        'text={text} count={count} enabled={enabled} tone={tone} ident={ident} href={href}',
      ),
      { components: typedComponents },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(
      '<p><span data-text="hello" data-count="3" data-enabled="true" data-tone="warm" data-ident="section-1" data-href="/docs">x</span></p>\n',
    )
  })

  it('requires expression results to have the declared type', () => {
    const source = expressionDocument(
      'text={count} count={"3"} enabled={"true"} tone={count} ident={enabled} href={count}',
    )
    const result = compile(source, { components: typedComponents })

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'HMX2005',
      'HMX2005',
      'HMX2005',
      'HMX2004',
      'HMX2005',
      'HMX2005',
    ])
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.severity).toBe('error')
      expect(source.slice(diagnostic.span.start.offset, diagnostic.span.end.offset)).not.toContain(
        'count=',
      )
    }
  })

  it('reports HMX2005 for null, array, and object attribute results', () => {
    const result = compile(expressionDocument('text={null} ident={[1]} href={{path: "/"}}'), {
      components: typedComponents,
    })

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2005', 'HMX2005', 'HMX2005'])
  })

  it('retains quoted brace values as literals', () => {
    const result = compile(':typed[x]{text="{missing}"}', { components: typedComponents })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('data-text="{missing}"')
  })

  it('evaluates expression-valued universal attributes', () => {
    const result = compile('---\ntitle: Hello\n---\n:::card{title={title}}\n:::\n')

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('title="Hello"')
  })

  it('applies the existing class policy to expression results', () => {
    const valid = compile('---\nclasses: feature_card\n---\n:typed[x]{class={classes}}', {
      components: typedComponents,
    })
    const invalid = compile('---\nclasses: "feature/card"\n---\n:typed[x]{class={classes}}', {
      components: typedComponents,
    })

    expect(valid.diagnostics).toEqual([])
    expect(valid.html).toContain('class="feature_card"')
    expect(invalid.diagnostics.map(({ code }) => code)).toEqual(['HMX2005'])
  })

  it('keeps expression diagnostics inside the attribute expression', () => {
    const source = expressionDocument('count={coutn}')
    const found = firstDiagnostic(source, 'HMX2040')

    expect(found.severity).toBe('error')
    expect(found.suggestion?.replacement).toBe('count')
    expect(source.slice(found.span.start.offset, found.span.end.offset)).toBe('coutn')
  })
})
