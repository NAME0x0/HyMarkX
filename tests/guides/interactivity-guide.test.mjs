import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { compile, compileComponents } from '../../packages/compiler/src/index.js'

const guidePath = fileURLToPath(new URL('../../docs/guides/interactivity.md', import.meta.url))
const guide = readFileSync(guidePath, 'utf8')
const examples = [...guide.matchAll(/```hmx\n([\s\S]*?)```/g)].map((match) => match[1])

function rendered(source, components) {
  const result = compile(source, {
    inlineJs: true,
    ...(components === undefined ? {} : { components }),
  })
  expect(result.diagnostics).toEqual([])
  return new JSDOM(result.html, { runScripts: 'dangerously' })
}

describe('interactivity guide examples', () => {
  it('compiles and runs every documented example', () => {
    expect(examples).toHaveLength(4)

    const counter = rendered(examples[0])
    counter.window.document.querySelector('button').click()
    expect(counter.window.document.querySelector('[data-hmx-t]').textContent).toBe('1')

    const registered = compileComponents([
      { name: 'Counter', source: examples[1], from: 'components/Counter.hmx' },
    ])
    expect(registered.diagnostics).toEqual([])
    const instances = rendered(examples[2], registered.registry)
    const buttons = instances.window.document.querySelectorAll('button')
    const outputs = instances.window.document.querySelectorAll('[data-hmx-t]')
    buttons[1].click()
    expect([...outputs].map((node) => node.textContent)).toEqual(['0', '1'])

    const input = rendered(examples[3])
    const field = input.window.document.querySelector('input')
    field.value = 'Grace'
    field.dispatchEvent(new input.window.Event('input', { bubbles: true }))
    expect(input.window.document.querySelector('[data-hmx-t]').textContent).toBe('Grace')

    counter.window.close()
    instances.window.close()
    input.window.close()
  })
})
