import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const svg = readFileSync(
  fileURLToPath(new URL('../../assets/evolution.svg', import.meta.url)),
  'utf8',
)

const stages = svg.split('<g class="stage"').slice(1)

describe('evolution.svg', () => {
  it('is well-formed and has one frame per stage', () => {
    expect(stages).toHaveLength(5)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it.each(stages.map((frame, index) => ({ index, frame })))(
    'frame %# draws a preview from real output',
    ({ frame }) => {
      const drawn = [...frame.matchAll(/class="(r-h1|r-h2|r-p|r-value|r-label|r-btn)"/g)]

      expect(drawn.length).toBeGreaterThan(0)
    },
  )

  // The graphic's whole claim is that it comes from the compiler. If the byte counts drift
  // from what the compiler actually emits, the graphic is a drawing, not evidence.
  it('reports byte counts the compiler still produces', () => {
    const interactive = compile(
      '::state{count=14302}\n\n:::metric[Users]\n{{ count }}\n:::\n\n:::button{on-click="count = count + 1"}\nAdd user\n:::\n',
      { trust: 'app' },
    )
    const declared = /class="meter live">JS (\d+) B</.exec(svg)?.[1]

    expect(Number(declared)).toBe(new TextEncoder().encode(interactive.js).length)
  })

  it('shows zero JavaScript for every non-interactive stage', () => {
    const zeroFrames = stages.filter((frame) => frame.includes('class="meter zero">JS 0 B'))

    expect(zeroFrames).toHaveLength(4)
  })

  it('respects reduced-motion preferences', () => {
    expect(svg).toContain('prefers-reduced-motion: reduce')
  })
})
