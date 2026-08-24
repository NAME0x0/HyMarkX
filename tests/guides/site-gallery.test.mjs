import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtinComponents, compile, compileComponents } from '../../packages/compiler/src/index.js'

const siteDirectory = fileURLToPath(new URL('../../site/', import.meta.url))
const gallery = readFileSync(`${siteDirectory}gallery.hmx`, 'utf8')

/**
 * The site's component gallery, held against the schemas it claims to document.
 *
 * A gallery is a promise about what the language ships. Left to prose it becomes wrong the
 * first time a component gains an attribute, and nothing fails — so the promise is checked
 * here against `builtinComponents` itself rather than against a copy of it.
 */
const componentNames = Object.keys(builtinComponents.schemas)

/** Every authored component the site defines, so the page can be compiled as the site compiles it. */
const siteComponents = readdirSync(`${siteDirectory}components/`)
  .filter((name) => name.endsWith('.hmx'))
  .map((name) => ({
    name: name.replace(/\.hmx$/, ''),
    source: readFileSync(`${siteDirectory}components/${name}`, 'utf8'),
  }))

function errorsIn(result) {
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map(({ code, message }) => `${code}: ${message}`)
}

describe('the component gallery', () => {
  it('gives every built-in its own heading', () => {
    const headings = [...gallery.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    const missing = componentNames.filter(
      (name) => !headings.some((heading) => new RegExp(`\\b${name}\\b`).test(heading)),
    )

    expect(missing).toEqual([])
  })

  it.each(componentNames)('documents every attribute %s declares', (name) => {
    const { attributes } = builtinComponents.schemas[name]
    const undocumented = Object.keys(attributes).filter(
      (attribute) => !gallery.includes(`\`${attribute}\``),
    )

    expect(undocumented).toEqual([])
  })

  it.each(componentNames)('lists every value %s accepts', (name) => {
    const { attributes } = builtinComponents.schemas[name]
    const values = Object.values(attributes).flatMap((attribute) =>
      attribute.type === 'enum' ? [...attribute.values] : [],
    )
    const unlisted = values.filter((value) => !gallery.includes(`\`${value}\``))

    expect(unlisted).toEqual([])
  })

  /**
   * Each source pane, compiled.
   *
   * The pane and the rendering beside it are written twice — once inside a fence and once as
   * live syntax — so an example that no longer compiles is an example the page is still
   * showing as if it did.
   */
  const examples = [...gallery.matchAll(/```md\n([\s\S]*?)```/g)].map((match, index) => ({
    id: `example ${index}`,
    source: match[1],
  }))

  it('has examples to check', () => {
    expect(examples.length).toBeGreaterThanOrEqual(componentNames.length - 2)
  })

  it.each(examples)('$id compiles without errors', ({ source }) => {
    expect(errorsIn(compile(source, { trust: 'app' }))).toEqual([])
  })

  /**
   * The page itself, compiled the way `site/build.mjs` compiles it.
   *
   * The gallery nests containers three deep at the same fence width, which is exactly what
   * ADR-0021 made legal and what silently truncated documents before it. That is worth a test
   * that reads the real file rather than a reduction of it.
   */
  it('compiles as a whole document', () => {
    const components = compileComponents(siteComponents, { trust: 'app' })
    expect(errorsIn(components)).toEqual([])

    const result = compile(gallery, { trust: 'app', components: components.components })

    expect(errorsIn(result)).toEqual([])
    // Three levels of `:::` inside the grid example: a truncated container loses the cards.
    expect(result.html).toContain('hmx-grid')
    expect([...result.html.matchAll(/hmx-card-title/g)]).toHaveLength(4)
  })
})
