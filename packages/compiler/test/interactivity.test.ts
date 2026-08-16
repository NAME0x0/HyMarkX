// jsdom is an existing root test dependency without bundled TypeScript declarations.
// @ts-expect-error -- browser behavior is exercised through its runtime API in this test.
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import {
  compile,
  compileComponents,
  type AuthoredComponent,
  type ComponentRegistry,
} from '../src/index.js'

declare const console: { log(message: string): void }

function inline(source: string, components?: ReturnType<typeof compileComponents>['registry']) {
  const result = compile(source, {
    inlineJs: true,
    ...(components === undefined ? {} : { components }),
  })
  expect(result.diagnostics).toEqual([])
  return result
}

function dom(source: string, components?: ReturnType<typeof compileComponents>['registry']) {
  const result = inline(source, components)
  return { result, dom: new JSDOM(result.html, { runScripts: 'dangerously' }) }
}

function component(name: string, source: string): AuthoredComponent {
  return { name, source, from: `components/${name}.hmx` }
}

describe('component-local state and compiled updates', () => {
  it('renders initial state and increments marked text without replacing it', () => {
    const source =
      '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nIncrement\n:::\n\nCount is {{ count }}.\n'
    const rendered = dom(source)
    const document = rendered.dom.window.document
    const button = document.querySelector('button')!
    const output = document.querySelector('[data-hmx-t]')!
    const parent = output.parentNode

    expect(rendered.result.html).toContain('Count is <span data-hmx-t="0">0</span>.')
    button.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))

    expect(output.textContent).toBe('3')
    expect(document.querySelector('[data-hmx-t]')).toBe(output)
    expect(output.parentNode).toBe(parent)
    rendered.dom.window.close()
  })

  it('gives two expansions of one authored component independent state objects', () => {
    const registered = compileComponents([
      component(
        'Counter',
        '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nIncrement\n:::\n\nCount {{ count }}.\n',
      ),
    ])
    expect(registered.diagnostics).toEqual([])
    const rendered = dom(':::Counter\n:::\n\n:::Counter\n:::\n', registered.registry)
    const buttons = rendered.dom.window.document.querySelectorAll('button')
    const outputs = rendered.dom.window.document.querySelectorAll('[data-hmx-t]')

    buttons[0]!.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))
    buttons[0]!.dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))

    expect(outputs[0]!.textContent).toBe('2')
    expect(outputs[1]!.textContent).toBe('0')
    console.log(
      `HMX two-instance jsdom proof: clicked first twice; DOM states = [${outputs[0]!.textContent}, ${outputs[1]!.textContent}]`,
    )
    expect(rendered.result.html.match(/<script>/g)).toHaveLength(1)
    rendered.dom.window.close()
  })

  it('emits one runtime copy for twelve interactive component expansions', () => {
    const registered = compileComponents([
      component(
        'Counter',
        '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nIncrement\n:::\n\n{{ count }}\n',
      ),
    ])
    const source = Array.from({ length: 12 }, () => ':::Counter\n:::\n').join('\n')
    const rendered = dom(source, registered.registry)
    const buttons = rendered.dom.window.document.querySelectorAll('button')
    const outputs = rendered.dom.window.document.querySelectorAll('[data-hmx-t]')

    expect(rendered.result.html.match(/<script>/g)).toHaveLength(1)
    buttons[11]!.click()
    expect(outputs[0]!.textContent).toBe('0')
    expect(outputs[11]!.textContent).toBe('1')
    rendered.dom.window.close()
  })

  it('keeps parent state out of a child while static props still pass', () => {
    const registered = compileComponents([
      component(
        'Child',
        '---\nprops:\n  label: { type: string, required: true }\n---\n{{ label }} / {{ count }}\n',
      ),
      component(
        'Parent',
        '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nIncrement\n:::\n\n:::Child{label=visible}\n:::\n',
      ),
    ])
    const result = compile(':::Parent\n:::\n', { components: registered.registry })

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2040'])
    expect(result.html).toContain('<p>visible / </p>')
  })

  it('passes parent state through a prop as a direct state-to-child-view edge', () => {
    const registered = compileComponents([
      component(
        'Child',
        [
          '---',
          'props:',
          '  label: { type: string, required: true }',
          '---',
          '::state{suffix="!"}',
          '',
          ':::button{on-click="suffix = suffix + \'!\'"}',
          'Child',
          ':::',
          '',
          '{{ label + suffix }}',
          '',
        ].join('\n'),
      ),
      component(
        'Parent',
        [
          '::state{label=Ada}',
          '',
          ':::button{on-click="label = \'Grace\'"}',
          'Parent',
          ':::',
          '',
          ':::Child{label={label}}',
          ':::',
          '',
        ].join('\n'),
      ),
    ])
    expect(registered.diagnostics).toEqual([])
    const rendered = dom(':::Parent\n:::\n', registered.registry)
    const document = rendered.dom.window.document
    const buttons = document.querySelectorAll('button')
    const output = document.querySelector('[data-hmx-t]')!

    expect(output.textContent).toBe('Ada!')
    buttons[0]!.click()
    expect(output.textContent).toBe('Grace!')
    buttons[1]!.click()
    expect(output.textContent).toBe('Grace!!')
    rendered.dom.window.close()
  })

  it('updates a state-dependent emitted attribute in place', () => {
    const rendered = dom(
      '::state{title=Ada next=Grace}\n\n:::button{on-click="title = next"}\nChange\n:::\n\n:::card{title={title}}\nBody\n:::\n',
    )
    const document = rendered.dom.window.document
    const card = document.querySelector('article')!

    expect(card.getAttribute('title')).toBe('Ada')
    document
      .querySelector('button')!
      .dispatchEvent(new rendered.dom.window.MouseEvent('click', { bubbles: true }))
    expect(card.getAttribute('title')).toBe('Grace')
    expect(document.querySelector('[data-hmx-a]')).toBe(card)
    rendered.dom.window.close()
  })

  it('targets renderer-transformed class and style attributes', () => {
    const rendered = dom(
      [
        '::state{tone=info next=danger columns=2}',
        '',
        ':::button{on-click="tone = next"}',
        'Tone',
        ':::',
        '',
        ':::button{on-click="columns = columns + 1"}',
        'Columns',
        ':::',
        '',
        ':::note{type={tone}}',
        'Note',
        ':::',
        '',
        ':::grid{columns={columns} gap=4}',
        'Grid',
        ':::',
        '',
      ].join('\n'),
    )
    const document = rendered.dom.window.document
    const buttons = document.querySelectorAll('button')
    const note = document.querySelector('aside')!
    const grid = document.querySelector('.hmx-grid')!

    buttons[0]!.click()
    expect(note.getAttribute('class')).toBe('hmx-note hmx-note-danger')
    expect(note.hasAttribute('type')).toBe(false)
    buttons[1]!.click()
    expect(grid.getAttribute('style')).toBe('--hmx-grid-columns:3;--hmx-grid-gap:4')
    expect(grid.hasAttribute('columns')).toBe(false)
    rendered.dom.window.close()
  })
})

describe('events and two-way input', () => {
  it('attaches every allowlisted event and omits input code from click-only output', () => {
    const source = [
      '::state{click=0 input="" change=0 submit=0 focus=0 blur=0 keydown=0}',
      '',
      ':::button{on-click="click = click + 1"}',
      'Click',
      ':::',
      '',
      '::input{on-input="input = input"}',
      '',
      '::input{on-change="change = change + 1"}',
      '',
      ':::form{on-submit="submit = submit + 1"}',
      'Submit',
      ':::',
      '',
      '::input{on-focus="focus = focus + 1"}',
      '',
      '::input{on-blur="blur = blur + 1"}',
      '',
      '::input{on-keydown="keydown = keydown + 1"}',
      '',
      '{{ click }}|{{ input }}|{{ change }}|{{ submit }}|{{ focus }}|{{ blur }}|{{ keydown }}',
      '',
    ].join('\n')
    const rendered = dom(source)
    const document = rendered.dom.window.document
    const inputs = document.querySelectorAll('input')

    document.querySelector('button')!.dispatchEvent(new rendered.dom.window.Event('click'))
    inputs[0]!.value = 'typed'
    inputs[0]!.dispatchEvent(new rendered.dom.window.Event('input'))
    inputs[1]!.dispatchEvent(new rendered.dom.window.Event('change'))
    const submit = new rendered.dom.window.Event('submit', { cancelable: true })
    document.querySelector('form')!.dispatchEvent(submit)
    inputs[2]!.dispatchEvent(new rendered.dom.window.Event('focus'))
    inputs[3]!.dispatchEvent(new rendered.dom.window.Event('blur'))
    inputs[4]!.dispatchEvent(new rendered.dom.window.KeyboardEvent('keydown', { key: 'A' }))

    expect(
      [...document.querySelectorAll('[data-hmx-t]')].map((node) => node.textContent).join('|'),
    ).toBe('1|typed|1|1|1|1|1')
    expect(submit.defaultPrevented).toBe(true)
    const clickOnly = compile(
      '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nGo\n:::\n',
    )
    expect(clickOnly.js).not.toContain('.value')
    expect(clickOnly.js).not.toContain('preventDefault')
    rendered.dom.window.close()
  })

  it('coerces input to the declared type and ignores invalid numbers', () => {
    const rendered = dom(
      '::state{count=1}\n\n::input{on-input="count = count"}\n\nValue {{ count }}.\n',
    )
    const input = rendered.dom.window.document.querySelector('input')!
    const output = rendered.dom.window.document.querySelector('[data-hmx-t]')!

    expect(input.value).toBe('1')
    input.value = 'not-a-number'
    input.dispatchEvent(new rendered.dom.window.Event('input'))
    expect(output.textContent).toBe('1')
    input.value = '12'
    input.dispatchEvent(new rendered.dom.window.Event('input'))
    expect(output.textContent).toBe('12')
    rendered.dom.window.close()
  })

  it('performs no dependency writes when state is assigned the same value', () => {
    const rendered = dom(
      '::state{count=1}\n\n:::button{on-click="count = count"}\nSame\n:::\n\n{{ count }}\n',
    )
    const output = rendered.dom.window.document.querySelector('[data-hmx-t]')!
    let writes = 0
    const initial = output.textContent
    Object.defineProperty(output, 'textContent', {
      configurable: true,
      get: () => initial,
      set: () => {
        writes += 1
      },
    })

    rendered.dom.window.document
      .querySelector('button')!
      .dispatchEvent(new rendered.dom.window.Event('click'))
    expect(writes).toBe(0)
    rendered.dom.window.close()
  })

  it('retains URL scheme validation when a URL attribute updates', () => {
    const components = {
      schemas: {
        link: {
          name: 'link',
          kinds: ['container'],
          attributes: { href: { type: 'url', description: 'Destination URL.' } },
          children: 'block',
          label: 'forbidden',
          description: 'Test link.',
        },
      },
      renderers: {
        link: (_node, attributes) => ({
          wrappers: [{ tag: 'a', attributes: { href: String(attributes.href) } }],
        }),
      },
    } satisfies ComponentRegistry
    const source =
      '::state{url=/safe}\n\n::input{on-input="url = url"}\n\n:::link{href={url}}\nGo\n:::\n'
    const rendered = dom(source, components)
    const document = rendered.dom.window.document
    const input = document.querySelector('input')!
    const link = document.querySelector('a')!

    input.value = 'https://example.com/path'
    input.dispatchEvent(new rendered.dom.window.Event('input'))
    expect(link.getAttribute('href')).toBe('https://example.com/path')
    input.value = '/docs/item:details'
    input.dispatchEvent(new rendered.dom.window.Event('input'))
    expect(link.getAttribute('href')).toBe('/docs/item:details')
    input.value = 'java\nscript:alert(1)'
    input.dispatchEvent(new rendered.dom.window.Event('input'))
    expect(link.getAttribute('href')).toBe('/docs/item:details')
    rendered.dom.window.close()

    const app = compile(source, { components, inlineJs: true, trust: 'app' })
    expect(app.diagnostics).toEqual([])
    const appDom = new JSDOM(app.html, { runScripts: 'dangerously' })
    const appInput = appDom.window.document.querySelector('input')!
    const appLink = appDom.window.document.querySelector('a')!
    appInput.value = 'javascript:allowed-in-app-mode'
    appInput.dispatchEvent(new appDom.window.Event('input'))
    expect(appLink.getAttribute('href')).toBe('javascript:allowed-in-app-mode')
    appDom.window.close()
  })

  it('does not create state-to-state edges from expression-looking declaration text', () => {
    const result = compile('::state{count=0 doubled={count + 1}}\n')

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2062'])
    expect(result.diagnostics[0]?.message).toContain('named derived state is not supported')
    expect(result.js).toBe('')
  })
})

describe('interactivity diagnostics and security boundary', () => {
  it('rejects non-allowlisted event names with HMX2060', () => {
    const result = compile('::state{count=0}\n\n:::button{on-mouseover="count = 1"}\nNo\n:::\n')
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2060'])
  })

  it('reports HMX2061 for prop, undeclared, and non-handler assignment', () => {
    const registered = compileComponents([
      component(
        'PropWrite',
        '---\nprops:\n  value: { type: number, required: true }\n---\n:::button{on-click="value = 2"}\nNo\n:::\n',
      ),
    ])
    const prop = compile(':::PropWrite{value=1}\n:::\n', { components: registered.registry })
    const missing = compile('::state{count=0}\n\n:::button{on-click="missing = count"}\nNo\n:::\n')
    const outside = compile('::state{count=0}\n\n{{ count = 1 }}\n')

    expect(prop.diagnostics.map(({ code }) => code)).toContain('HMX2061')
    expect(missing.diagnostics.map(({ code }) => code)).toEqual(['HMX2061'])
    expect(outside.diagnostics.map(({ code }) => code)).toEqual(['HMX2061'])
  })

  it.each(['window', 'document', 'fetch', 'localStorage'])(
    'rejects host global %s at compile time',
    (globalName) => {
      const result = compile(
        `::state{count=0}\n\n:::button{on-click="count = ${globalName}"}\nNo\n:::\n`,
      )
      expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2040'])
      expect(result.js).toBe('')
      console.log(`HMX handler global ${globalName}: ${result.diagnostics[0]?.code}`)
    },
  )

  it('checks unreachable handler branches for host globals', () => {
    const result = compile(
      '::state{count=0}\n\n:::button{on-click="count = false ? window : count"}\nNo\n:::\n',
    )

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2040'])
    expect(result.js).toBe('')
  })

  it('rejects forbidden member access in a handler at compile time', () => {
    const result = compile(
      '::state{text=safe}\n\n:::button{on-click="text = text.constructor"}\nNo\n:::\n',
    )

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2044'])
    expect(result.js).toBe('')
  })

  it('avoids host evaluation and permits interactivity in both trust modes', () => {
    const source =
      '::state{count=0}\n\n:::button{on-click="count = count + 1"}\nGo\n:::\n\n{{ count }}\n'
    for (const trust of ['document', 'app'] as const) {
      const result = compile(source, { trust })
      expect(result.diagnostics).toEqual([])
      expect(result.js).not.toBe('')
      expect(result.js).not.toMatch(/\beval\b/)
      expect(result.js).not.toContain('new Function')
    }
  })

  it('escapes script-closing text in serialized state', () => {
    const result = compile(
      '::state{text="</script><script>bad</script>"}\n\n:::button{on-click="text = text"}\nNo\n:::\n\n{{ text }}\n',
      { inlineJs: true },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.js).not.toContain('</script>')
    expect(result.html.match(/<script>/g)).toHaveLength(1)
  })

  it('diagnoses nested state and collisions but accepts empty and class state', () => {
    const nested = compile(':::card\n::state{count=0}\n:::\n')
    const registered = compileComponents([
      component('Collision', '---\nprops:\n  value: { type: string }\n---\n::state{value=local}\n'),
    ])
    const collision = compile(':::Collision{value=prop}\n:::\n', {
      components: registered.registry,
    })
    const valid = compile('::state\n\n::state{class=wide}\n\n{{ class }}\n')
    const derived = compile('::state{first=1 second={first + 1}}\n')

    expect(nested.diagnostics.map(({ code }) => code)).toEqual(['HMX2063'])
    expect(collision.diagnostics.map(({ code }) => code)).toEqual(['HMX2062'])
    expect(valid.diagnostics).toEqual([])
    expect(valid.html).toBe('<p>wide</p>\n')
    expect(valid.js).toBe('')
    expect(derived.diagnostics.map(({ code }) => code)).toEqual(['HMX2062'])
  })

  it('preserves quoted scalar-looking values as strings', () => {
    const result = compile(
      '::state{numeric="1" truth="true" nil="null" actual=true nothing=null}\n\n:::button{on-click="actual = actual"}\nNo\n:::\n',
    )

    expect(result.diagnostics).toEqual([])
    expect(result.js).toContain(
      '"s":{"numeric":"1","truth":"true","nil":"null","actual":true,"nothing":null}',
    )
  })
})
