import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import { compile, type ComponentRegistry } from '../src/index.js'

const componentCases = [
  [
    'note',
    ':::note\nBody\n:::\n',
    '.hmx-note',
    ['.hmx-card', '.hmx-grid', '.hmx-metric', '.hmx-badge'],
  ],
  [
    'card',
    ':::card\nBody\n:::\n',
    '.hmx-card',
    ['.hmx-note', '.hmx-grid', '.hmx-metric', '.hmx-badge'],
  ],
  [
    'grid',
    ':::grid\nBody\n:::\n',
    '.hmx-grid',
    ['.hmx-note', '.hmx-card', '.hmx-metric', '.hmx-badge'],
  ],
  [
    'metric',
    ':::metric\nBody\n:::\n',
    '.hmx-metric',
    ['.hmx-note', '.hmx-card', '.hmx-grid', '.hmx-badge'],
  ],
  ['badge', ':badge[new]\n', '.hmx-badge', ['.hmx-note', '.hmx-card', '.hmx-grid', '.hmx-metric']],
] as const

function scopeAttributes(html: string): readonly string[] {
  return [...html.matchAll(/\b(data-hmx-s-[a-f0-9]{8})\b/g)].map((match) => match[1] ?? '')
}

function diagnostic(source: string, code: string): Diagnostic {
  const found = compile(source, { trust: 'app', from: 'styles.hmx' }).diagnostics.find(
    (item) => item.code === code,
  )
  expect(found, `expected ${code}`).toBeDefined()
  return found as Diagnostic
}

describe('built-in component styles', () => {
  it.each(componentCases)(
    'emits tokens and only the %s component rules',
    (_name, source, ownSelector, unusedSelectors) => {
      const result = compile(source)

      expect(result.css).toContain(':where(:root)')
      expect(result.css).toContain(ownSelector)
      for (const unusedSelector of unusedSelectors) {
        expect(result.css).not.toContain(unusedSelector)
      }
      expect(result.css.match(/--hmx-color-surface: #f8fafc/g)).toHaveLength(1)
      expect(result.css).not.toContain('!important')
      expect(result.html).not.toContain('<script')
    },
  )

  it('emits no CSS without built-in components or author styles', () => {
    expect(compile('# Plain Markdown\n').css).toBe('')
  })

  it('does not use built-in CSS for a caller replacement with the same name', () => {
    const components: ComponentRegistry = {
      schemas: {
        note: {
          name: 'note',
          kinds: ['container'],
          attributes: {},
          children: 'block',
          label: 'optional',
          description: 'Custom note.',
        },
      },
      renderers: { note: () => ({ wrappers: [{ tag: 'section', attributes: {} }] }) },
    }

    expect(compile(':::note\nCustom\n:::\n', { components }).css).toBe('')
  })

  it('honours grid variables and includes its narrow-viewport fallback', () => {
    const result = compile(':::grid{columns=4 gap=2}\nBody\n:::\n')

    expect(result.html).toContain('--hmx-grid-columns:4;--hmx-grid-gap:2')
    expect(result.css).toContain('repeat(var(--hmx-grid-columns), minmax(0, 1fr))')
    expect(result.css).toContain('gap: calc(var(--hmx-grid-gap) * 0.25rem)')
    expect(result.css).toContain('@media (max-width: 40rem)')
  })
})

describe('author styles', () => {
  it('collects a plain style verbatim and removes its element from HTML', () => {
    const css = '\n.card { color: rebeccapurple; content: "}"; }\n/* } */\n'
    const result = compile(`<style>${css}</style>\n\nText\n`, {
      trust: 'app',
      from: 'plain.hmx',
    })

    expect(result.diagnostics).toEqual([])
    expect(result.css).toBe(css)
    expect(result.html).toBe('<p>Text</p>\n')
  })

  it('removes an empty plain style block without emitting CSS', () => {
    const result = compile('<style></style>\n', { trust: 'app', from: 'empty-style.hmx' })

    expect(result).toMatchObject({ html: '', css: '', diagnostics: [] })
  })

  it('scopes selector forms and leaves keyframe selectors untouched', () => {
    const source = `<style scoped>
.list, article p, .parent > .child, a:hover, p::before, .state[data-state="open"] { color: red; }
@media (min-width: 20rem) { @supports (display: grid) { .nested { display: grid; } } }
@supports (display: grid) { .supports { display: grid; } }
@keyframes pulse { from { opacity: 0; } 50% { opacity: .5; } to { opacity: 1; } }
:global(body) .local, :global(html) { margin: 0; }
</style>

# Heading
`
    const result = compile(source, { trust: 'app', from: 'selectors.hmx' })
    const attribute = scopeAttributes(result.html)[0]

    expect(result.diagnostics).toEqual([])
    expect(attribute).toMatch(/^data-hmx-s-[a-f0-9]{8}$/)
    expect(result.css).toContain(`.list[${attribute}]`)
    expect(result.css).toContain(`article p[${attribute}]`)
    expect(result.css).toContain(`.parent > .child[${attribute}]`)
    expect(result.css).toContain(`a[${attribute}]:hover`)
    expect(result.css).toContain(`p[${attribute}]::before`)
    expect(result.css).toContain(`.state[data-state="open"][${attribute}]`)
    expect(result.css).toContain(`.nested[${attribute}]`)
    expect(result.css).toContain(`.supports[${attribute}]`)
    expect(result.css).toContain(`body .local[${attribute}]`)
    expect(result.css).toContain('html { margin: 0; }')
    expect(result.css).toContain('@keyframes pulse { from {')
    expect(result.css).toContain('50% { opacity: .5; } to {')
    expect(result.css).not.toContain(`from[${attribute}]`)
    expect(result.css).not.toContain(`50%[${attribute}]`)
    expect(result.css).not.toContain(`to[${attribute}]`)
  })

  it('gives two blocks different deterministic hashes without process state', () => {
    const source =
      '<style scoped>p { color: red; }</style>\n' +
      '<style scoped>strong { color: blue; }</style>\n\n**Text**\n'
    const first = compile(source, { trust: 'app', from: 'stable.hmx' })
    const second = compile(source, { trust: 'app', from: 'stable.hmx' })
    const attributes = [...new Set(scopeAttributes(first.html))]

    expect(attributes).toHaveLength(2)
    expect(first.css).toBe(second.css)
    expect(first.html).toBe(second.html)
    expect(compile(source, { trust: 'app', from: 'other.hmx' }).css).not.toBe(first.css)
    expect(
      compile(source.replace('color: red', 'color: green'), {
        trust: 'app',
        from: 'stable.hmx',
      }).css,
    ).not.toBe(first.css)
  })

  it('adds every active scope attribute to generated component and Markdown elements', () => {
    const result = compile(
      '<style scoped>.hmx-card p { color: red; }</style>\n\n:::card[Title]\nA **value**.\n:::\n',
      { trust: 'app', from: 'elements.hmx' },
    )
    const [attribute] = scopeAttributes(result.html)

    expect(attribute).toBeDefined()
    expect(result.html).toContain(`<article class="hmx-card" ${attribute}>`)
    expect(result.html).toContain(`<h3 class="hmx-card-title" ${attribute}>`)
    expect(result.html).toContain(`<p ${attribute}>`)
    expect(result.html).toContain(`<strong ${attribute}>`)
  })

  it('adds the scope attribute to every generated Markdown start tag', () => {
    const source = `<style scoped>
* { box-sizing: border-box; }
</style>

# Heading

> Quote

- [x] **bold** *emphasis* ~~deleted~~ \`code\` [link](/docs) ![image](/image.png)

---

line\\
break

\`\`\`js
code
\`\`\`

| A | B |
| - | - |
| 1 | 2 |
`
    const result = compile(source, { trust: 'app', from: 'markdown-elements.hmx' })
    const [attribute] = scopeAttributes(result.html)
    const startTags = [...result.html.matchAll(/<[a-z][^>]*>/g)].map((match) => match[0])

    expect(result.diagnostics).toEqual([])
    expect(startTags.length).toBeGreaterThan(15)
    expect(startTags.every((tag) => tag.includes(` ${attribute}`))).toBe(true)
  })

  it('adds the scope attribute to app-mode raw HTML without rewriting raw-text contents', () => {
    const result = compile(
      '<style scoped>div span { color: red; }</style>\n\n<div><span>Raw</span></div>\n\n<script>const sample = "<div>"</script>\n',
      { trust: 'app', from: 'raw-html.hmx' },
    )
    const [attribute] = scopeAttributes(result.html)

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain(`<div ${attribute}><span ${attribute}>Raw</span></div>`)
    expect(result.html).toContain(`<script ${attribute}>const sample = "<div>"</script>`)
    expect(result.html).not.toContain(`<div ${attribute}>"`)
  })

  it('reports HMX2030 at a real source span for invalid CSS', () => {
    const source = '<style>\na {\n  color: red;\n</style>\n'
    const found = diagnostic(source, 'HMX2030')

    expect(found.severity).toBe('error')
    expect(found.span.start.offset).toBeGreaterThan(source.indexOf('<style>'))
    expect(found.span.start.offset).toBeLessThan(source.indexOf('</style>') + 1)
  })

  it('maps PostCSS locations through normalized CRLF source', () => {
    const result = compile('<style>\r\na {\r\n color: red;\r\n</style>\r\n', {
      trust: 'app',
      from: 'crlf.hmx',
    })
    const found = result.diagnostics.find(({ code }) => code === 'HMX2030')

    expect(found).toBeDefined()
    expect(found?.span.start).toEqual({ line: 2, column: 1, offset: 8 })
    expect(
      found === undefined
        ? ''
        : result.source.slice(found.span.start.offset, found.span.end.offset),
    ).toBe('a')
  })

  it('reports invalid scoped selector syntax at the selector token', () => {
    const source = '<style scoped>\n.foo[ { color: red; }\n</style>\n\nText\n'
    const found = diagnostic(source, 'HMX2030')

    expect(source.slice(found.span.start.offset, found.span.end.offset)).toBe('[')
  })

  it('warns HMX2031 when a scoped block has no generated elements', () => {
    const result = compile('<style scoped>p { color: red; }</style>\n', {
      trust: 'app',
      from: 'empty.hmx',
    })

    expect(result.html).toBe('')
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2031'])
  })

  it('inlines CSS ahead of content without removing result.css', () => {
    const separate = compile(':::note\nBody\n:::\n')
    const result = compile(':::note\nBody\n:::\n', { inlineCss: true })

    expect(result.html).toBe(`<style>\n${result.css}\n</style>\n${separate.html}`)
    expect(result.html.indexOf('<style>')).toBeLessThan(result.html.indexOf('<aside'))
  })

  it('keeps document mode HMX3001 and excludes all author CSS', () => {
    const marker = '--author-secret: do-not-leak'
    const result = compile(`<style>:root { ${marker}; }</style>\n\n:::note\nSafe\n:::\n`)

    expect(result.diagnostics.map(({ code }) => code)).toContain('HMX3001')
    expect(result.html).not.toContain('<style')
    expect(result.css).not.toContain(marker)
    expect(result.css).toContain('.hmx-note')
  })
})

/**
 * A scope attribute names *which document* a style block belongs to, not what the document said
 * at the time. Hashing the source meant a whitespace-only edit renamed every scope attribute and
 * every selector that referenced it, so a reformat produced churn across the emitted CSS and
 * HTML for a change that altered nothing.
 */
describe('scoped style identity', () => {
  it('survives an edit that does not touch the styles', () => {
    const before = compile('<style scoped>\n.a { color: red }\n</style>\n\n# Title\n\nProse.\n', {
      trust: 'app',
      from: 'page.hmx',
    })
    const after = compile(
      '<style scoped>\n.a { color: red }\n</style>\n\n# Title\n\nProse, edited.\n',
      { trust: 'app', from: 'page.hmx' },
    )

    const scopeOf = (css) => /data-hmx-s-[a-z0-9]+/.exec(css)?.[0]

    expect(scopeOf(before.css)).toBeDefined()
    expect(scopeOf(after.css)).toBe(scopeOf(before.css))
  })

  // Different documents must never share a scope, or one page's styles reach another's elements.
  it('differs between documents', () => {
    const one = compile('<style scoped>\n.a { color: red }\n</style>\n\n# A\n', {
      trust: 'app',
      from: 'one.hmx',
    })
    const two = compile('<style scoped>\n.a { color: red }\n</style>\n\n# A\n', {
      trust: 'app',
      from: 'two.hmx',
    })
    const scopeOf = (css) => /data-hmx-s-[a-z0-9]+/.exec(css)?.[0]

    expect(scopeOf(one.css)).not.toBe(scopeOf(two.css))
  })

  /**
   * With no filename there is nothing else to distinguish two documents, so the content stays in
   * the hash. Anonymous compiles are embedding cases where output may be concatenated, and a
   * shared scope attribute would leak one document's styles onto another's elements.
   */
  it('still separates anonymous documents by content', () => {
    const one = compile('<style scoped>\n.a { color: red }\n</style>\n\n# A\n', { trust: 'app' })
    const two = compile('<style scoped>\n.a { color: blue }\n</style>\n\n# B\n', { trust: 'app' })
    const scopeOf = (css) => /data-hmx-s-[a-z0-9]+/.exec(css)?.[0]

    expect(scopeOf(one.css)).not.toBe(scopeOf(two.css))
  })
})

/**
 * The interactive components shipped unstyled.
 *
 * `note`, `card`, `grid`, `metric` and `badge` all carried styles; `button`, `input` and `form`
 * emitted bare elements with no class and no CSS at all. So the one part of the language that
 * distinguishes it — the interactive surface — rendered as unstyled browser defaults, and a
 * document could not target them without reaching for raw HTML.
 */
describe('interactive component styles', () => {
  it.each([
    ['button', '::state{n=0}\n\n:::button{on-click="n = n + 1"}\nGo\n:::\n', 'hmx-button'],
    // Writing the same name on both sides is how a direct binding is expressed (guide §67).
    ['input', '::state{v=""}\n\n::input{on-input="v = v"}\n', 'hmx-input'],
    ['form', ':::form\ncontent\n:::\n', 'hmx-form'],
  ])('%s carries a class and ships styles', (_name, source, className) => {
    const result = compile(source, { trust: 'app' })

    expect(result.html).toContain(className)
    expect(result.css).toContain(`.${className}`)
    expect(result.diagnostics.filter(({ severity }) => severity === 'error')).toEqual([])
  })

  // Output proportionality still holds: a document that uses none of them gets none of their CSS.
  it('emits no interactive styles for a document that uses none', () => {
    const result = compile('# Just a heading\n', { trust: 'app' })

    expect(result.css).not.toContain('hmx-button')
    expect(result.css).not.toContain('hmx-input')
  })

  // A user class must merge with the component's own, not replace it.
  it('keeps the component class when the author adds one', () => {
    const result = compile('::state{n=0}\n\n:::button{on-click="n = n + 1" .primary}\nGo\n:::\n', {
      trust: 'app',
    })

    expect(result.html).toContain('hmx-button')
    expect(result.html).toContain('primary')
  })
})
