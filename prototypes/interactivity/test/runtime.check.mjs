import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { compileInteractive } from '../src/compiler.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const documents = new URL('../documents/', import.meta.url)

async function render(name) {
  const source = await readFile(new URL(name, documents), 'utf8')
  const compiled = compileInteractive(source)
  const dom = new JSDOM(compiled.page, { runScripts: 'dangerously' })
  return { compiled, dom }
}

describe('generated reactive runtime', () => {
  it('increments only the statically bound counter text', async () => {
    const { dom } = await render('counter.hmx')
    const document = dom.window.document
    const button = document.querySelector('[data-hmx-e="0"]')
    const output = document.querySelector('[data-hmx-t="0"]')
    const paragraph = output.parentNode

    assert.equal(output.textContent, '0')
    button.click()
    assert.equal(output.textContent, '1')
    assert.strictEqual(document.querySelector('[data-hmx-t="0"]'), output)
    assert.strictEqual(output.parentNode, paragraph)
    button.click()
    assert.equal(output.textContent, '2')
    dom.window.close()
  })

  it('supports input-to-state and state-to-view updates without rerendering nodes', async () => {
    const { compiled, dom } = await render('input-binding.hmx')
    const document = dom.window.document
    const input = document.querySelector('[data-hmx-i="0"]')
    const first = document.querySelector('[data-hmx-t="0"]')
    const last = document.querySelector('[data-hmx-t="1"]')
    const button = document.querySelector('[data-hmx-e="0"]')

    assert.equal(input.value, 'Ada')
    assert.equal(first.textContent, 'Ada')
    assert.equal(last.textContent, 'Lovelace')

    input.value = 'Grace'
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    assert.equal(first.textContent, 'Grace')
    assert.equal(last.textContent, 'Lovelace')
    assert.strictEqual(document.querySelector('[data-hmx-i="0"]'), input)
    assert.strictEqual(document.querySelector('[data-hmx-t="0"]'), first)

    button.click()
    assert.equal(last.textContent, 'Byron')
    assert.equal(input.value, 'Grace')
    assert.strictEqual(document.querySelector('[data-hmx-t="1"]'), last)
    assert.match(compiled.html, /<input[^>]*><\/input>/)
    dom.window.close()
  })
})
