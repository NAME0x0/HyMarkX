import { beforeEach, describe, expect, it } from 'vitest'
import { activate } from '../../editors/vscode/src/extension.js'
import * as vscode from './vscode-stub.mjs'

/**
 * Drives the VS Code extension against a stubbed editor API.
 *
 * The extension previously located its language server at a path inside this repository, so it
 * worked from a checkout and would have failed for every installed user — and nothing caught
 * that, because nothing ever ran it. It also advertised completion, hover and formatting in its
 * own description while wiring up only diagnostics.
 *
 * Both are the same underlying problem: code that ships to users and is never executed. These
 * tests execute it.
 */
function start() {
  const context = { subscriptions: [], extensionPath: '/nowhere' }
  activate(context)
  return context
}

beforeEach(() => {
  vscode.reset()
})

describe('vscode extension', () => {
  it('registers completion, hover and formatting, not only diagnostics', () => {
    start()

    expect(vscode.providers.completion).toBeDefined()
    expect(vscode.providers.hover).toBeDefined()
    expect(vscode.providers.formatting).toBeDefined()
  })

  it('publishes diagnostics for a document opened with an error', () => {
    const broken = vscode.document('file:///a.hmx', ':::card{ malformed\n')
    vscode.workspace.textDocuments = [broken]
    start()

    const [collection] = vscode.collections
    const published = collection.entries.get('file:///a.hmx')

    expect(published.length).toBeGreaterThan(0)
    expect(published[0].code).toMatch(/^HMX\d{4}$/)
    expect(published[0].range.start.line).toBe(0)
  })

  it('republishes when the document changes, and clears when it closes', () => {
    const uri = 'file:///b.hmx'
    const clean = vscode.document(uri, '# Fine\n')
    vscode.workspace.textDocuments = [clean]
    start()

    const [collection] = vscode.collections
    expect(collection.entries.get(uri)).toEqual([])

    for (const listener of vscode.listeners.change) {
      listener({ document: vscode.document(uri, ':::card{ malformed\n') })
    }
    expect(collection.entries.get(uri).length).toBeGreaterThan(0)

    for (const listener of vscode.listeners.close) {
      listener(clean)
    }
    expect(collection.entries.has(uri)).toBe(false)
  })

  it('ignores documents that are not HMX', () => {
    const other = vscode.document('file:///c.ts', ':::card{ malformed\n', 'typescript')
    vscode.workspace.textDocuments = [other]
    start()

    const [collection] = vscode.collections

    expect(collection.entries.size).toBe(0)
  })

  // The server returns a CompletionList; reading it as an array yields nothing, silently, and
  // looks exactly like completion never having been implemented.
  it('offers component completions', () => {
    const document = vscode.document('file:///d.hmx', ':::\n')
    vscode.workspace.textDocuments = [document]
    start()

    const items = vscode.providers.completion.provideCompletionItems(
      document,
      new vscode.Position(0, 3),
    )

    expect(items.length).toBeGreaterThan(0)
    expect(items.map((item) => item.label)).toContain('card')
  })

  /**
   * The formatter is deliberately conservative (ADR-0015): it normalises directive attribute
   * whitespace and leaves prose, headings and list markers exactly as written. A heading with
   * extra spaces is *not* something it touches, which is why the first version of this test
   * failed — the test was wrong, not the formatter.
   */
  it('returns formatting edits only when the document would change', () => {
    const messy = vscode.document('file:///e.hmx', ':::card{title="a"   }\nx\n:::\n')
    const tidy = vscode.document('file:///f.hmx', '#    Heading left alone\n')
    vscode.workspace.textDocuments = [messy, tidy]
    start()

    const edits = vscode.providers.formatting.provideDocumentFormattingEdits(messy)

    expect(edits).toHaveLength(1)
    expect(edits[0].newText).toContain(':::card{title="a"}')
    expect(vscode.providers.formatting.provideDocumentFormattingEdits(tidy)).toEqual([])
  })

  it('hovers a known component and stays quiet elsewhere', () => {
    const document = vscode.document('file:///g.hmx', ':::card\nbody\n:::\n')
    vscode.workspace.textDocuments = [document]
    start()

    const onDirective = vscode.providers.hover.provideHover(document, new vscode.Position(0, 4))
    const onBody = vscode.providers.hover.provideHover(document, new vscode.Position(1, 1))

    expect(onDirective.contents.value).toContain('card')
    expect(onBody).toBeUndefined()
  })
})
