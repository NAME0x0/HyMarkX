import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const directory = fileURLToPath(new URL('../../benchmarks/dashboard/', import.meta.url))
const read = (name) => readFileSync(`${directory}${name}`, 'utf8')

/** Renders a page, clicks its button twice, and reports what changed. */
function drive(html, css, js) {
  const dom = new JSDOM(`<style>${css}</style>${html}<script>${js}</script>`, {
    runScripts: 'dangerously',
  })
  const document = dom.window.document
  const before = document.body.textContent.replace(/\s+/g, ' ').trim()
  const button = document.querySelector('button')
  for (let click = 0; click < 2; click += 1) {
    button?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  }
  const after = document.body.textContent.replace(/\s+/g, ' ').trim()
  dom.window.close()
  return { before, after }
}

const hmxResult = compile(read('dashboard.hmx'), { trust: 'app' })

describe('four-way dashboard comparison', () => {
  it('the HMX dashboard compiles without errors', () => {
    const errors = hmxResult.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

    expect(errors.map(({ code }) => code)).toEqual([])
  })

  // A comparison is only fair if every implementation produces the same page. Without this,
  // the byte counts could drift into comparing a full dashboard against a stub.
  it.each([
    ['HMX', () => drive(hmxResult.html, hmxResult.css, hmxResult.js)],
    [
      'hand-written',
      () => drive(read('dashboard.html'), read('dashboard.css'), read('dashboard.js')),
    ],
  ])('the %s dashboard shows the same content and counts the same way', (_label, run) => {
    const { before, after } = run()

    for (const value of [
      'Analytics',
      'Revenue',
      '$42,500',
      'Users',
      '14,302',
      'Growth',
      '+18.4%',
    ]) {
      expect(before).toContain(value)
    }
    expect(before).toContain('Figures are preliminary')
    expect(before).toContain('Signups today: 128')
    expect(after).toContain('Signups today: 130')
  })

  it('keeps the published comparison in step with the compiler', () => {
    const report = readFileSync(
      fileURLToPath(new URL('../../docs/research/comparison.md', import.meta.url)),
      'utf8',
    )
    const declared = /\| HMX \| \d+ \| \d+ \| ([\d,]+) B/.exec(report)?.[1]

    expect(Number(declared?.replaceAll(',', ''))).toBe(
      new TextEncoder().encode(read('dashboard.hmx')).length,
    )
  })

  it('states plainly that hand-written output is smaller', () => {
    const report = readFileSync(
      fileURLToPath(new URL('../../docs/research/comparison.md', import.meta.url)),
      'utf8',
    )

    expect(report).toContain('beats HMX on shipped bytes')
  })
})
