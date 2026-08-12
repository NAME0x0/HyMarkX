import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { compile as compileBaseline } from '../../../packages/compiler/dist/index.js'
import { parse } from '../../../packages/parser/dist/index.js'
import { compileInteractive } from '../src/compiler.mjs'

const documents = new URL('../documents/', import.meta.url)

async function document(name) {
  return readFile(new URL(name, documents), 'utf8')
}

describe('prototype compiler pass', () => {
  it('emits byte-identical HTML and zero JavaScript when state is absent', async () => {
    const source = await document('static.hmx')
    const baseline = compileBaseline(source)
    const prototype = compileInteractive(source)

    assert.deepEqual(Buffer.from(prototype.html), Buffer.from(baseline.html))
    assert.deepEqual(Buffer.from(prototype.page), Buffer.from(baseline.html))
    assert.equal(prototype.javascript, '')
    assert.equal(prototype.runtime, '')
    assert.equal(prototype.bindings, '')
    assert.equal(prototype.reactive, false)
  })

  it('records static state dependencies and emits one inline script', async () => {
    const result = compileInteractive(await document('counter.hmx'))

    assert.equal(result.reactive, true)
    assert.deepEqual(result.dependencies, { texts: { count: ['0'] }, inputs: {} })
    assert.equal((result.page.match(/<script>/g) ?? []).length, 1)
    assert.match(result.html, /<span data-hmx-t="0">0<\/span>/)
    assert.match(result.html, /<button data-hmx-e="0">/)
  })

  it('rejects writes to undeclared state during compilation', () => {
    const source = [
      '::state{count=0}',
      '',
      ':::button{on-click="missing = count + 1"}',
      'Increment',
      ':::',
      '',
    ].join('\n')

    assert.throws(() => compileInteractive(source), /Undeclared state variable "missing"/)
  })

  it('keeps quoted numeric-looking state as a string', () => {
    const source = '::state{value="1"}\n\nValue: :v[value].\n'
    const result = compileInteractive(source)

    assert.match(result.bindings, /"value":"1"/)
  })

  it('records that the verbatim two-way brief handler does not parse today', async () => {
    const source = await document('input-binding-as-brief.hmx')
    const parsed = parse(source)
    const compiled = compileBaseline(source)

    assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === 'HMX1011'))
    assert.equal(JSON.stringify(parsed.root).includes('"name":"button"'), false)
  })
})
