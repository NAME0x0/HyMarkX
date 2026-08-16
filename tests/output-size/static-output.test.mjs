import { describe, expect, it } from 'vitest'
import { compile, compileComponents } from '../../packages/compiler/src/index.js'

const STATIC_HTML_BYTE_BUDGET = 512

describe('static output proportionality', () => {
  it('emits only proportional HTML and no HMX runtime', () => {
    const result = compile('# Hello\n\nStatic **content** with a [link](/docs).\n')

    expect(result.diagnostics).toEqual([])
    expect(result.html.includes('<script')).toBe(false)
    expect(result.html.toLowerCase()).not.toContain('hmx-runtime')
    expect(new TextEncoder().encode(result.html).byteLength).toBeLessThanOrEqual(
      STATIC_HTML_BYTE_BUDGET,
    )
  })

  it('emits all built-in components and scoped CSS with zero JavaScript bytes', () => {
    const result = compile(
      '<style scoped>.hmx-card { color: inherit; }</style>\n\n:::note\nn\n:::\n\n:::card\nc\n:::\n\n:::grid\ng\n:::\n\n:::metric\nm\n:::\n\n:badge[b]\n',
      { trust: 'app', from: 'all-components.hmx' },
    )
    const emitted = `${result.html}${result.css}`
    const scriptContents = [...emitted.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (match) => match[1] ?? '',
    )
    const javascriptBytes = scriptContents.reduce(
      (total, script) => total + new TextEncoder().encode(script).byteLength,
      0,
    )

    expect(result.diagnostics).toEqual([])
    expect(emitted.includes('<script')).toBe(false)
    expect(emitted.toLowerCase()).not.toContain('hmx-runtime')
    expect(javascriptBytes).toBe(0)
    expect(Object.hasOwn(result, 'js')).toBe(false)
  })

  it('emits frontmatter expressions as deterministic static HTML with zero JavaScript', () => {
    const source = [
      '---',
      'title: Expression page',
      '---',
      '# {{ title }}',
      '',
      ':::card{title={title}}',
      'Body',
      ':::',
      '',
    ].join('\n')
    const first = compile(source)
    const second = compile(source)

    expect(first).toEqual(second)
    expect(first.diagnostics).toEqual([])
    expect(first.html).toContain('<h1>Expression page</h1>')
    expect(first.html).toContain('title="Expression page"')
    expect(first.html.includes('<script')).toBe(false)
    expect(first.html.toLowerCase()).not.toContain('hmx-runtime')
    expect(Object.hasOwn(first, 'js')).toBe(false)
  })

  it('expands authored components with zero JavaScript artifacts', () => {
    const registered = compileComponents([
      {
        name: 'Card',
        from: 'components/Card.hmx',
        source:
          '---\nprops:\n  title: { type: string, required: true }\n---\n<style scoped>\n.card { color: inherit; }\n</style>\n\n:::card{class=card}\n## {{ title }}\n::children\n:::\n',
      },
    ])
    const result = compile(
      ':::Card{title=One}\nFirst.\n:::\n\n:::Card{title=Two}\nSecond.\n:::\n',
      { components: registered.registry },
    )
    const emitted = `${result.html}${result.css}`

    expect(registered.diagnostics).toEqual([])
    expect(result.diagnostics).toEqual([])
    expect(emitted.includes('<script')).toBe(false)
    expect(emitted.toLowerCase()).not.toContain('hmx-runtime')
    expect(Object.hasOwn(result, 'js')).toBe(false)
  })

  it('never emits script markup hidden inside authored raw HTML', () => {
    const registered = compileComponents([
      {
        name: 'Unsafe',
        from: 'components/Unsafe.hmx',
        source:
          '<style scoped>\n.x::before { content: "<script"; }\n</style>\n\n<iframe srcdoc="<script>alert(1)</script>"></iframe>\n',
      },
    ])
    const result = compile(':::Unsafe\n:::\n', {
      components: registered.registry,
      trust: 'app',
    })
    const emitted = `${result.html}${result.css}`

    expect(registered.diagnostics.map(({ code }) => code)).toContain('HMX3001')
    expect(emitted.toLowerCase()).not.toContain('<script')
    expect(emitted.toLowerCase()).not.toContain('srcdoc')
    expect(Object.hasOwn(result, 'js')).toBe(false)
  })
})
