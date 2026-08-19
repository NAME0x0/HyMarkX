import { describe, expect, it } from 'vitest'
import { renderDocument } from '../src/emit/document.js'
import { compile } from '../src/index.js'

/**
 * Assembling a complete HTML document from a compile result.
 *
 * `compile()` produces a fragment, which is right for embedding in a host page and useless on
 * its own: no doctype, no charset, no title. These cover the shell that makes it a page.
 */
describe('renderDocument', () => {
  it('wraps the fragment in a complete document', () => {
    const result = compile('---\ntitle: Dashboard\n---\n\n# Hello\n', { trust: 'app' })
    const { html } = renderDocument(result)

    expect(html.startsWith('<!doctype html>\n')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain('<title>Dashboard</title>')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    expect(html.indexOf('</head>')).toBeLessThan(html.indexOf('<body>'))
  })

  /**
   * HTML5 requires `<title>`, so this never comes back empty. A page with no frontmatter and no
   * heading is titled after its file rather than emitted invalid.
   */
  it('falls back to the first heading, then to the filename', () => {
    const heading = compile('# From heading\n', { trust: 'app' })
    const neither = compile('Just prose.\n', { trust: 'app' })

    expect(renderDocument(heading).html).toContain('<title>From heading</title>')
    expect(renderDocument(neither, { from: 'about.hmx' }).html).toContain('<title>about</title>')
  })

  it('omits the description entirely when frontmatter has none', () => {
    const withOne = compile('---\ndescription: A page\n---\n\n# H\n', { trust: 'app' })
    const without = compile('# H\n', { trust: 'app' })

    expect(renderDocument(withOne).html).toContain('<meta name="description" content="A page">')
    expect(renderDocument(without).html).not.toContain('name="description"')
  })

  // Same rule the sidecar writer follows: no file, no reference. A static page links no
  // stylesheet it does not have and loads no script that does not exist.
  it('references only the assets the compile actually produced', () => {
    const stateful = compile(
      '::state{count=0}\n\n:::button{on-click="count = count + 1"}\n+\n:::\n',
      {
        trust: 'app',
      },
    )
    const plain = compile('Just prose.\n', { trust: 'app' })

    expect(renderDocument(stateful).html).toContain('<script src="index.js"></script>')
    expect(renderDocument(plain).html).not.toContain('<script')
    expect(renderDocument(plain).html).not.toContain('<link rel="stylesheet"')
  })

  // For stdout and the dev server, where there are no sidecar files on disk to point at.
  it('inlines the assets when asked', () => {
    const result = compile(':::note{type=info}\nbody\n:::\n', { trust: 'app' })
    const { html } = renderDocument(result, { inline: true })

    expect(html).toContain('<style>')
    expect(html).not.toContain('<link rel="stylesheet"')
  })
})

describe('document language', () => {
  it('uses a valid tag and defaults to en', () => {
    const tagged = compile('---\nlang: en-GB\n---\n\n# H\n', { trust: 'app' })
    const bare = compile('# H\n', { trust: 'app' })

    expect(renderDocument(tagged).html).toContain('<html lang="en-GB">')
    expect(renderDocument(bare).html).toContain('<html lang="en">')
  })

  /**
   * A language tag is a constrained vocabulary, so a malformed one is rejected rather than
   * escaped into the attribute. Escaping alone would leave a safe attribute containing nonsense.
   */
  it('rejects a malformed tag with HMX2023 and falls back', () => {
    const result = compile('---\nlang: "en\\" onload=x"\n---\n\n# H\n', { trust: 'app' })
    const document = renderDocument(result)

    expect(document.html).toContain('<html lang="en">')
    expect(document.diagnostics.map(({ code }) => code)).toContain('HMX2023')
    expect(document.diagnostics[0]?.severity).toBe('warning')
  })
})
