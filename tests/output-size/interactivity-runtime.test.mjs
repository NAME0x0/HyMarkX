import { gzipSync } from 'node:zlib'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { compile } from '../../packages/compiler/src/index.js'

const RUNTIME_GZIP_BUDGET = 1_536
const urlComponents = {
  schemas: {
    link: {
      name: 'link',
      kinds: ['container'],
      attributes: { href: { type: 'url', description: 'Destination URL.' } },
      children: 'block',
      label: 'forbidden',
      description: 'A link.',
    },
  },
  renderers: {
    link: (_node, attributes) => ({
      wrappers: [{ tag: 'a', attributes: { href: String(attributes.href) } }],
    }),
  },
}

describe('interactive runtime proportionality', () => {
  it('emits zero JavaScript bytes for a static document', () => {
    const result = compile('# Static\n\nNo interactive constructs.\n', { inlineJs: true })

    expect(Buffer.byteLength(result.js)).toBe(0)
    expect(result.html).toBe('<h1>Static</h1>\n<p>No interactive constructs.</p>\n')
    console.log(
      `HMX static runtime bytes: ${Buffer.byteLength(result.js)}; inline scripts: ${result.html.match(/<script>/g)?.length ?? 0}`,
    )
  })

  it('keeps the full Phase 6 feature set within 1.5 KB gzipped', () => {
    const source = [
      '---',
      'prefix: Count',
      '---',
      '::state{count=0 text=""}',
      '',
      ':::button{on-click="count = !false ? ({value: [count + 1][0]}).value : +count"}',
      'Click',
      ':::',
      '',
      '::input{on-input="text = text"}',
      '',
      '::input{on-change="count = count + 1"}',
      '',
      ':::form{on-submit="count = count + 1"}',
      'Submit',
      ':::',
      '',
      '::input{on-focus="count = count + 1"}',
      '',
      '::input{on-blur="count = count + 1"}',
      '',
      '::input{on-keydown="count = count + 1"}',
      '',
      ':::link{href={text}}',
      'Link',
      ':::',
      '',
      ':::card{title={prefix + count}}',
      '{{ text ?? prefix }} {{ count }}',
      ':::',
      '',
    ].join('\n')
    const result = compile(source, { inlineJs: true, components: urlComponents })
    const gzippedBytes = gzipSync(result.js, { level: 9 }).byteLength
    const measurement = `HMX full runtime gzip: ${gzippedBytes} bytes (budget: ${RUNTIME_GZIP_BUDGET} bytes)`
    const dom = new JSDOM(result.html, { runScripts: 'dangerously' })

    expect(result.diagnostics).toEqual([])
    console.log(measurement)
    expect(gzippedBytes, measurement).toBeLessThanOrEqual(RUNTIME_GZIP_BUDGET)
    dom.window.document.querySelector('button').click()
    expect(dom.window.document.querySelector('article').getAttribute('title')).toBe('Count1')
    expect(
      [...dom.window.document.querySelectorAll('[data-hmx-t]')].map((node) => node.textContent),
    ).toEqual(['', '1'])
    dom.window.close()
  })
})
