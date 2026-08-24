import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compile, renderDiagnostics } from '../../packages/compiler/src/index.js'

// Normalized, because the frame is compared line for line and a checkout on Windows has CRLF.
const docs = readFileSync(
  fileURLToPath(new URL('../../site/docs.hmx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

/**
 * The diagnostic the documentation prints, compared against the one the compiler produces.
 *
 * A quoted error message is the easiest thing in a document to leave behind: it is right when
 * written, nothing executes it, and it stays on the page long after the wording, the code or
 * the caret position have moved. The section claims one renderer serves the CLI, the editor and
 * the playground alike — so the page had better show what that renderer actually returns.
 *
 * The file name in the frame is part of the output, so it is fixed here and in the page.
 */
const section = docs.slice(docs.indexOf('#diagnostics'), docs.indexOf('#next'))
const [source] = [...section.matchAll(/```md\n([\s\S]*?)```/g)].map((match) => match[1])
const [frame] = [...section.matchAll(/```text\n([\s\S]*?)```/g)].map((match) => match[1])

describe('the documented diagnostic', () => {
  it('quotes a source example and the frame it produces', () => {
    expect(source).toBeTypeOf('string')
    expect(frame).toBeTypeOf('string')
  })

  it('matches what the compiler renders for that source', () => {
    const result = compile(source, { trust: 'document', from: 'notes.hmx' })
    const rendered = renderDiagnostics(result.diagnostics, source, { from: 'notes.hmx' })

    expect(rendered).toBe(frame.trimEnd())
  })

  it('shows a diagnostic worth documenting', () => {
    // A frame with no caret and no help line demonstrates neither of the two things the section
    // is there to explain.
    expect(frame).toContain('^')
    expect(frame).toContain('help:')
  })
})
