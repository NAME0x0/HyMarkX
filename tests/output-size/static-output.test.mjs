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
})
