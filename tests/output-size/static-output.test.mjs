import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

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
})
