import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const extensionRoot = fileURLToPath(new URL('../../editors/vscode/', import.meta.url))

const manifest = JSON.parse(readFileSync(`${extensionRoot}package.json`, 'utf8'))
const grammar = JSON.parse(readFileSync(`${extensionRoot}syntaxes/hymarkx.tmLanguage.json`, 'utf8'))

/** Builds one regex per grammar rule so the patterns are checked, not just the JSON shape. */
function ruleRegex(name) {
  const rule = grammar.repository[name]
  return new RegExp(rule.match ?? rule.begin)
}

describe('vscode extension manifest', () => {
  it('registers the .hmx language and points at files that exist', () => {
    const [language] = manifest.contributes.languages
    const [grammarEntry] = manifest.contributes.grammars

    expect(language.extensions).toContain('.hmx')
    expect(existsSync(`${extensionRoot}${language.configuration.replace('./', '')}`)).toBe(true)
    expect(existsSync(`${extensionRoot}${grammarEntry.path.replace('./', '')}`)).toBe(true)
    expect(grammarEntry.scopeName).toBe(grammar.scopeName)
  })

  it('activates on the language it contributes', () => {
    expect(manifest.activationEvents).toContain(
      `onLanguage:${manifest.contributes.languages[0].id}`,
    )
  })
})

describe('vscode grammar patterns', () => {
  // Every regex is compiled, so a malformed pattern fails here rather than silently
  // highlighting nothing in an editor.
  it.each(Object.keys(grammar.repository))('compiles the %s rule', (name) => {
    expect(() => ruleRegex(name)).not.toThrow()
  })

  it.each([
    ['container-directive', ':::note{type=info}'],
    ['container-directive', '::::grid{columns=3}'],
    ['leaf-directive', '::children'],
    ['text-directive', ':badge[live]{kind=success}'],
    ['interpolation', '{{ title }}'],
  ])('the %s rule matches %s', (name, sample) => {
    expect(ruleRegex(name).test(sample)).toBe(true)
  })

  it('does not highlight an escaped interpolation', () => {
    expect(ruleRegex('interpolation').test(String.raw`\{{ title }}`)).toBe(false)
  })

  it('falls through to Markdown for ordinary prose', () => {
    expect(grammar.patterns.at(-1)).toEqual({ include: 'text.html.markdown' })
  })
})
