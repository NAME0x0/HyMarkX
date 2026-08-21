import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import {
  compile,
  compileComponents,
  diagnosticOrigin,
  type AuthoredComponent,
  type ComponentRegistry,
} from '../src/index.js'

function components(...sources: readonly AuthoredComponent[]): ComponentRegistry {
  const result = compileComponents(sources)
  expect(result.diagnostics).toEqual([])
  return result.registry
}

function component(name: string, source: string): AuthoredComponent {
  return { name, source, from: `components/${name}.hmx` }
}

function codeList(diagnostics: readonly Diagnostic[]): readonly string[] {
  return diagnostics.map(({ code }) => code)
}

describe('authored component expansion', () => {
  it('resolves required, optional, defaulted, typed, and enum props through existing schemas', () => {
    const registry = components(
      component(
        'Card',
        `---
props:
  heading: { type: string, required: true }
  detail: { type: string }
  columns: { type: number, default: 2, min: 1, max: 4 }
  tone: { type: enum, values: [info, warning], default: info }
---
## {{ heading }}

{{ detail }}

Tone: {{ tone }}

:::grid{columns={columns}}
::children
:::
`,
      ),
    )
    const result = compile(
      ':::Card{heading="Summary" detail="Details" tone=warning}\nChild **content**.\n:::\n',
      { components: registry },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('<h2>Summary</h2>')
    expect(result.html).toContain('<p>Details</p>')
    expect(result.html).toContain('<p>Tone: warning</p>')
    expect(result.html).toContain('--hmx-grid-columns:2')
    expect(result.html).toContain('<p>Child <strong>content</strong>.</p>')
  })

  it('routes authored calls through the existing HMX200x validation diagnostics', () => {
    const registry = components(
      component(
        'Typed',
        `---
props:
  required: { type: string, required: true }
  count: { type: number, min: 1, max: 3 }
  tone: { type: enum, values: [info, warning] }
---
::children
`,
      ),
    )
    const source = [
      ':::Typed{oops=x count=no tone=danger #first #second}',
      'Content',
      ':::',
      '',
      ':::Typed[label]{required=yes}',
      ':::',
      '',
      '::Typed{required=yes}',
      '',
      ':::Missing',
      'transparent',
      ':::',
      '',
    ].join('\n')
    const result = compile(source, { components: registry })

    expect(codeList(result.diagnostics)).toEqual([
      'HMX2001',
      'HMX2010',
      'HMX2003',
      'HMX2005',
      'HMX2004',
      'HMX2007',
      'HMX2008',
      'HMX2002',
    ])
    expect(result.html).toContain('<p>transparent</p>')
  })

  it('keeps authored renderers on the shared HMX2006 content-validation path', () => {
    const registered = compileComponents([component('NoContent', 'Template.\n')])
    expect(registered.diagnostics).toEqual([])
    const schema = registered.registry.schemas.NoContent
    expect(schema).toBeDefined()
    const registry: ComponentRegistry = {
      schemas: {
        NoContent: { ...schema!, children: 'none' },
      },
      renderers: registered.registry.renderers,
    }
    const result = compile(':::NoContent\nDiscarded.\n:::\n', { components: registry })

    expect(codeList(result.diagnostics)).toEqual(['HMX2006', 'HMX2052'])
  })

  it('isolates component scope from caller frontmatter and component metadata', () => {
    const registry = components(
      component(
        'Isolated',
        `---
props:
  visible: { type: string, required: true }
componentOnly: hidden
---
{{ visible }} / {{ callerOnly }} / {{ componentOnly }}
`,
      ),
    )
    const result = compile('---\ncallerOnly: secret\n---\n:::Isolated{visible=shown}\n:::\n', {
      components: registry,
    })
    const unknowns = result.diagnostics.filter(({ code }) => code === 'HMX2040')

    expect(unknowns).toHaveLength(2)
    expect(unknowns.map(({ message }) => message)).toEqual([
      'Unknown identifier "callerOnly".',
      'Unknown identifier "componentOnly".',
    ])
    expect(result.html).toBe('<p>shown /  / </p>\n')
    expect(unknowns.map((item) => diagnosticOrigin(item)?.from)).toEqual([
      'components/Isolated.hmx',
      'components/Isolated.hmx',
    ])
  })

  it('does not expose a calling component prop to a nested component', () => {
    const registry = components(
      component('Inner', '{{ outerValue }}\n'),
      component(
        'Outer',
        '---\nprops:\n  outerValue: { type: string, required: true }\n---\n:::Inner\n:::\n',
      ),
    )
    const result = compile(':::Outer{outerValue=secret}\n:::\n', { components: registry })

    expect(codeList(result.diagnostics)).toEqual(['HMX2040'])
    expect(result.html).toBe('<p></p>\n')
  })

  it('reports absent props as HMX2040 and suggests from declared prop names', () => {
    const registry = components(
      component(
        'OptionalProp',
        '---\nprops:\n  optional: { type: string }\n---\n{{ optional }} / {{ optonal }}\n',
      ),
    )
    const result = compile(':::OptionalProp\n:::\n', { components: registry })
    const unknowns = result.diagnostics.filter(({ code }) => code === 'HMX2040')

    expect(unknowns).toHaveLength(2)
    expect(unknowns[0]?.suggestion).toBeUndefined()
    expect(unknowns[1]?.suggestion?.replacement).toBe('optional')
  })

  it('projects parsed caller children, accepts no children, and reports discarded content', () => {
    const registry = components(
      component('WithChildren', 'Before\n\n::children\n\nAfter\n'),
      component('WithoutChildren', 'Only the template.\n'),
    )
    const withContent = compile(
      ':::WithChildren\nCaller **Markdown**.\n:::\n\n:::WithChildren\n:::\n',
      { components: registry },
    )
    const discarded = compile(':::WithoutChildren\nLost.\n:::\n', { components: registry })
    const empty = compile(':::WithoutChildren\n:::\n', { components: registry })

    expect(withContent.diagnostics).toEqual([])
    expect(withContent.html).toContain('<p>Caller <strong>Markdown</strong>.</p>')
    expect(codeList(discarded.diagnostics)).toEqual(['HMX2052'])
    expect(discarded.html).toBe('<p>Only the template.</p>\n')
    expect(empty.diagnostics).toEqual([])
  })

  it('reports duplicate children markers and ::children outside a component', () => {
    const registration = compileComponents([
      component('DuplicateChildren', '::children\n\n::children\n'),
    ])
    const outside = compile('::children\n')

    expect(codeList(registration.diagnostics)).toEqual(['HMX2053'])
    expect(registration.diagnostics[0]?.severity).toBe('error')
    expect(codeList(outside.diagnostics)).toEqual(['HMX2056'])
  })

  it('warns on built-in shadowing and errors on duplicate registration', () => {
    const result = compileComponents([
      component('card', 'First.\n'),
      component('card', 'Second.\n'),
    ])

    expect(codeList(result.diagnostics)).toEqual(['HMX2050', 'HMX2057'])
    expect(result.diagnostics[0]?.message).toContain('built-in component "card"')
  })

  it('reports malformed prop schemas as HMX2051 with component paths', () => {
    const cases = [
      '[]',
      'props: []',
      'props:\n  value: []',
      'props:\n  value: { type: mystery }',
      'props:\n  value: { type: enum }',
      'props:\n  value: { type: string, mystery: true }',
    ]
    for (const [index, frontmatter] of cases.entries()) {
      const source = `---\n${frontmatter}\n---\nBody\n`
      const from = `components/Invalid${index}.hmx`
      const result = compileComponents([{ name: `Invalid${index}`, source, from }])
      const malformed = result.diagnostics.find(({ code }) => code === 'HMX2051')

      expect(malformed, from).toBeDefined()
      expect(malformed?.message).toContain(from)
      expect(malformed?.span.start.offset).toBeGreaterThanOrEqual(source.indexOf('props'))
      expect(malformed?.span.end.offset).toBeLessThanOrEqual(source.length)
    }
  })

  it('allows a component with no props and an empty component body', () => {
    const registry = components(component('Empty', ''))
    const result = compile(':::Empty\n:::\n', { components: registry })

    expect(result).toMatchObject({ html: '', css: '', diagnostics: [] })
  })

  it('allows props named children, class, and id while keeping universal validation', () => {
    const registry = components(
      component(
        'ReservedNames',
        `---
props:
  children: { type: string, required: true }
  class: { type: string, required: true }
  id: { type: identifier, required: true }
---
:::card{class={class} id={id}}
{{ children }}
:::
`,
      ),
    )
    const result = compile(
      ':::ReservedNames{children="prop value" class="wide safe" id=card1}\n:::\n',
      { components: registry },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe(
      '<article class="hmx-card wide safe" id="card1"><p>prop value</p>\n</article>\n',
    )
  })

  it('applies undeclared universal attributes to the first emitted element', () => {
    const registry = components(component('Heading', '## Hello\n'))
    const result = compile(':::Heading{#hero .wide title="Greeting"}\n:::\n', {
      components: registry,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe('<h2 class="wide" id="hero" title="Greeting">Hello</h2>\n')
  })

  it('preserves required and default rules for universal-named props', () => {
    const registry = components(
      component(
        'UniversalProps',
        `---
props:
  id: { type: identifier, required: true }
  class: { type: string, default: default-class }
  title: { type: string, required: true }
---
{{ id }} / {{ class }} / {{ title }}
`,
      ),
    )
    const missing = compile(':::UniversalProps\n:::\n', { components: registry })
    const valid = compile(':::UniversalProps{id=main title=Greeting}\n:::\n', {
      components: registry,
    })

    expect(missing.diagnostics.filter(({ code }) => code === 'HMX2003')).toHaveLength(2)
    expect(missing.diagnostics.map(({ message }) => message).join('\n')).toContain('"id"')
    expect(missing.diagnostics.map(({ message }) => message).join('\n')).toContain('"title"')
    expect(valid.diagnostics).toEqual([])
    // `class` and `id` still merge because both are structural; `title` is declared, so it is
    // the component's prop and is not also emitted as a tooltip (ADR-0019).
    expect(valid.html).toBe(
      '<p class="default-class" id="main">main / default-class / Greeting</p>\n',
    )
  })

  it('does not emit a declared prop as an HTML attribute of the same name', () => {
    // The prop is rendered as a visible heading. Emitting it again as `title` produced a
    // tooltip that read back the text next to it, which MDN calls out and Charter §28 rules
    // against — so a declared name belongs to the component and stops there.
    const declared = components(
      component(
        'Titled',
        '---\nprops:\n  title: { type: string, required: true }\n---\n## {{ title }}\n',
      ),
    )
    const undeclared = components(component('Plain', '## Fixed\n'))

    const consumed = compile(':::Titled{title="Revenue"}\n:::\n', { components: declared })
    const passed = compile(':::Plain{title="Revenue"}\n:::\n', { components: undeclared })

    expect(consumed.diagnostics).toEqual([])
    expect(consumed.html).toBe('<h2>Revenue</h2>\n')
    expect(passed.diagnostics).toEqual([])
    expect(passed.html).toBe('<h2 title="Revenue">Fixed</h2>\n')
  })

  it('enforces universal identifier and class constraints on declared props', () => {
    const registry = components(
      component(
        'UniversalValidation',
        '---\nprops:\n  id: { type: string }\n  class: { type: string }\n---\nBody\n',
      ),
    )
    const result = compile(':::UniversalValidation{id=1bad class="bad!"}\n:::\n', {
      components: registry,
    })

    expect(codeList(result.diagnostics)).toEqual(['HMX2005', 'HMX2005'])
    expect(result.html).toBe('<p>Body</p>\n')
  })

  it('keeps an empty declared class default in component scope', () => {
    const registry = components(
      component(
        'EmptyClass',
        '---\nprops:\n  class: { type: string, default: "" }\n---\nValue: [{{ class }}]\n',
      ),
    )
    const result = compile(':::EmptyClass\n:::\n', { components: registry })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe('<p>Value: []</p>\n')
  })

  it('expands components nested two levels deep', () => {
    const registration = compileComponents([
      component(
        'Inner',
        '---\nprops:\n  value: { type: string, required: true }\n---\nInner: {{ value }}\n',
      ),
      component(
        'Outer',
        '---\nprops:\n  value: { type: string, required: true }\n---\n:::Inner{value={value}}\n:::\n',
      ),
    ])
    expect(registration.diagnostics).toEqual([])

    const result = compile(':::Outer{value=deep}\n:::\n', {
      components: registration.registry,
    })
    expect(result.diagnostics).toEqual([])
    expect(result.html).toBe('<p>Inner: deep</p>\n')
  })
})

describe('authored component recursion bounds', () => {
  it('reports self-recursion without recursing indefinitely', () => {
    const registry = components(component('Self', ':::Self\n:::\n'))
    const result = compile(':::Self\n:::\n', { components: registry })

    expect(codeList(result.diagnostics)).toEqual(['HMX2054'])
    expect(result.diagnostics[0]?.message).toContain('Self -> Self')
    const origin = diagnosticOrigin(result.diagnostics[0] as Diagnostic)
    expect(
      origin?.source.slice(
        result.diagnostics[0]?.span.start.offset,
        result.diagnostics[0]?.span.end.offset,
      ),
    ).toContain(':::Self')
  })

  it('reports a three-component cycle with the complete path', () => {
    const registry = components(
      component('A', ':::B\n:::\n'),
      component('B', ':::C\n:::\n'),
      component('C', ':::A\n:::\n'),
    )
    const result = compile(':::A\n:::\n', { components: registry })

    expect(codeList(result.diagnostics)).toEqual(['HMX2054'])
    expect(result.diagnostics[0]?.message).toContain('A -> B -> C -> A')
    expect(diagnosticOrigin(result.diagnostics[0] as Diagnostic)?.from).toBe('components/C.hmx')
  })

  it('caps acyclic expansion at 32 authored components', () => {
    const sources = Array.from({ length: 33 }, (_, index) => component(`C${index}`, '')).map(
      (source, index, all) => ({
        ...source,
        source: index === all.length - 1 ? 'End.\n' : `:::${all[index + 1]?.name}\n:::\n`,
      }),
    )
    const registration = compileComponents(sources)
    expect(registration.diagnostics).toEqual([])

    const result = compile(`:::${sources[0]?.name}\n:::\n`, {
      components: registration.registry,
    })
    expect(codeList(result.diagnostics)).toEqual(['HMX2055'])
    expect(diagnosticOrigin(result.diagnostics[0] as Diagnostic)?.from).toBe('components/C31.hmx')
  })
})

describe('authored component styles', () => {
  it('emits component CSS once for twelve instances', () => {
    const registry = components(
      component(
        'StyledCard',
        `---
props:
  title: { type: string, required: true }
---
<style scoped>
.authored-card { color: rebeccapurple; }
</style>

:::card{class=authored-card}
## {{ title }}
::children
:::
`,
      ),
    )
    const source = Array.from(
      { length: 12 },
      (_, index) => `:::StyledCard{title="Card ${index + 1}"}\nBody ${index + 1}.\n:::\n`,
    ).join('\n')
    const result = compile(source, { components: registry })

    expect(result.diagnostics).toEqual([])
    expect(result.html.match(/<article[^>]*class="hmx-card authored-card"/g)).toHaveLength(12)
    expect(result.css.match(/\.authored-card\[data-hmx-s-/g)).toHaveLength(1)
    expect(result.html).not.toContain('<script')
    expect(result.css).not.toContain('<script')
  })

  it('uses distinct scope attributes for two authored components', () => {
    const source = '<style scoped>\n.same { color: red; }\n</style>\n\n:::card{class=same}\n:::\n'
    const registry = components(
      { name: 'First', source, from: 'components/Shared.hmx' },
      { name: 'Second', source, from: 'components/Shared.hmx' },
    )
    const result = compile(':::First\n:::\n\n:::Second\n:::\n', { components: registry })
    const attributes = [...result.css.matchAll(/\.same\[(data-hmx-s-[a-f0-9-]+)\]/g)].map(
      (match) => match[1],
    )

    expect(result.diagnostics).toEqual([])
    expect(new Set(attributes).size).toBe(2)
  })

  it('resolves known 32-bit hash collisions between component styles', () => {
    const source = '<style scoped>\n.same { color: red; }\n</style>\n\nSame.\n'
    const registry = components(
      { name: 'HluAtWuuga', source, from: 'components/Shared.hmx' },
      { name: 'Se0mxXwADj', source, from: 'components/Shared.hmx' },
    )
    const result = compile(':::HluAtWuuga\n:::\n\n:::Se0mxXwADj\n:::\n', {
      components: registry,
    })
    const attributes = [...result.css.matchAll(/\.same\[(data-hmx-s-[a-f0-9-]+)\]/g)].map(
      (match) => match[1],
    )

    expect(result.diagnostics).toEqual([])
    expect(attributes).toHaveLength(2)
    expect(new Set(attributes).size).toBe(2)
  })

  it('strips scripts and event handlers from authored components even in app mode', () => {
    const registration = compileComponents([
      component('Unsafe', '<img src="safe.png" onerror="alert(1)">\n\n<script>alert(1)</script>\n'),
    ])
    const result = compile(':::Unsafe\n:::\n', {
      components: registration.registry,
      trust: 'app',
    })

    expect(codeList([...registration.diagnostics, ...result.diagnostics])).toEqual([
      'HMX3002',
      'HMX3001',
    ])
    expect(result.html).not.toContain('<script')
    expect(result.html).not.toContain('onclick')
  })

  it('keeps non-interactive raw HTML under the host-selected app trust mode', () => {
    const registry = components(component('Embed', '<iframe src="https://example.com"></iframe>\n'))
    const result = compile(':::Embed\n:::\n', { components: registry, trust: 'app' })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('<iframe src="https://example.com"></iframe>')
  })

  it('blocks script-bearing raw HTML and unsafe URLs in app-mode components', () => {
    const rawRegistration = compileComponents([
      component(
        'UnsafeRaw',
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>\n\n<a href="javascript:alert(1)">bad</a>\n',
      ),
    ])
    const markdownRegistry = components(component('UnsafeMarkdown', '[bad](javascript:alert(1))\n'))
    const raw = compile(':::UnsafeRaw\n:::\n', {
      components: rawRegistration.registry,
      trust: 'app',
    })
    const markdown = compile(':::UnsafeMarkdown\n:::\n', {
      components: markdownRegistry,
      trust: 'app',
    })

    expect(codeList(rawRegistration.diagnostics)).toContain('HMX3001')
    expect(codeList(markdown.diagnostics)).toEqual(['HMX3003'])
    expect(`${raw.html}${markdown.html}`.toLowerCase()).not.toContain('<script')
    expect(`${raw.html}${markdown.html}`.toLowerCase()).not.toContain('javascript:')
  })
})
