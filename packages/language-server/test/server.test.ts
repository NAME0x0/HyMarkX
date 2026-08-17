import { describe, expect, it } from 'vitest'
import { createMessageReader, encodeMessage, handle } from '../src/index.js'
import type { RpcMessage } from '../src/index.js'

const URI = 'file:///page.hmx'

function open(text: string): Map<string, string> {
  const documents = new Map<string, string>()
  handle(
    {
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: URI, text } },
    },
    documents,
  )
  return documents
}

function request(method: string, params: unknown, documents: Map<string, string>): any {
  return handle({ jsonrpc: '2.0', id: 1, method, params }, documents).response
}

describe('language server', () => {
  it('advertises the capabilities the editor needs', () => {
    const response: any = handle(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      new Map(),
    ).response

    expect(response.result.capabilities).toMatchObject({
      textDocumentSync: 1,
      hoverProvider: true,
      documentFormattingProvider: true,
    })
    expect(response.result.capabilities.completionProvider.triggerCharacters).toContain(':')
  })

  it('publishes diagnostics on open, with zero-based positions', () => {
    const documents = new Map<string, string>()
    const { notifications } = handle(
      {
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: URI, text: ':::nope\nBody\n:::\n' } },
      },
      documents,
    )
    const published: any = notifications[0]

    expect(published.method).toBe('textDocument/publishDiagnostics')
    expect(published.params.diagnostics[0]).toMatchObject({
      code: 'HMX2002',
      severity: 2,
      source: 'hmx',
      range: { start: { line: 0, character: 0 } },
    })
  })

  it('republishes diagnostics on change and clears them when fixed', () => {
    const documents = open(':::nope\nx\n:::\n')
    const { notifications } = handle(
      {
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: { textDocument: { uri: URI }, contentChanges: [{ text: '# Fine\n' }] },
      },
      documents,
    )

    expect((notifications[0] as any).params.diagnostics).toEqual([])
  })

  // Completion reads the component schemas rather than a second catalogue, which is the
  // ADR-0015 requirement that keeps editor suggestions from drifting from the compiler.
  it('completes component names after a directive opener', () => {
    const documents = open(':::\n')
    const result = request(
      'textDocument/completion',
      { textDocument: { uri: URI }, position: { line: 0, character: 3 } },
      documents,
    ).result

    expect(result.items.map((item: any) => item.label)).toContain('note')
    expect(result.items.find((item: any) => item.label === 'note').documentation).toBeTruthy()
  })

  it('completes attribute names inside a brace block, not component names', () => {
    const documents = open(':::note{\n')
    const result = request(
      'textDocument/completion',
      { textDocument: { uri: URI }, position: { line: 0, character: 8 } },
      documents,
    ).result
    const labels = result.items.map((item: any) => item.label)

    expect(labels).toContain('type')
    expect(labels).not.toContain('note')
    expect(result.items[0].detail).toContain('info')
  })

  it('offers nothing in ordinary prose', () => {
    const documents = open('Just a paragraph.\n')
    const result = request(
      'textDocument/completion',
      { textDocument: { uri: URI }, position: { line: 0, character: 5 } },
      documents,
    ).result

    expect(result.items).toEqual([])
  })

  it('hovers a component with its schema description and attributes', () => {
    const documents = open(':::note{type=info}\nBody\n:::\n')
    const result = request(
      'textDocument/hover',
      { textDocument: { uri: URI }, position: { line: 0, character: 4 } },
      documents,
    ).result

    expect(result.contents.value).toContain('**note**')
    expect(result.contents.value).toContain('type')
  })

  it('returns no hover for an unknown name', () => {
    const documents = open(':::nope\nx\n:::\n')
    const result = request(
      'textDocument/hover',
      { textDocument: { uri: URI }, position: { line: 0, character: 4 } },
      documents,
    ).result

    expect(result).toBeNull()
  })

  it('formats through @hymarkx/formatter and reports no edits when already clean', () => {
    const dirty = request(
      'textDocument/formatting',
      { textDocument: { uri: URI } },
      open(':::note{type=info   }\nBody\n:::\n'),
    ).result
    const clean = request(
      'textDocument/formatting',
      { textDocument: { uri: URI } },
      open(':::note{type="info"}\nBody\n:::\n'),
    ).result

    expect(dirty[0].newText).toContain(':::note{type="info"}')
    expect(clean).toEqual([])
  })

  it('answers an unknown method with a JSON-RPC error rather than crashing', () => {
    const response: any = handle(
      { jsonrpc: '2.0', id: 9, method: 'textDocument/rename' },
      new Map(),
    ).response

    expect(response.error.code).toBe(-32601)
  })
})

describe('message framing', () => {
  it('reads a framed message', () => {
    const seen: RpcMessage[] = []
    const reader = createMessageReader((message) => seen.push(message))

    reader.push(encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.method).toBe('initialize')
  })

  it('reassembles a message split across chunks', () => {
    const seen: RpcMessage[] = []
    const reader = createMessageReader((message) => seen.push(message))
    const framed = encodeMessage({ jsonrpc: '2.0', id: 2, method: 'shutdown' })

    reader.push(framed.slice(0, 12))
    expect(seen).toHaveLength(0)
    reader.push(framed.slice(12))

    expect(seen[0]?.method).toBe('shutdown')
  })

  it('reads two messages arriving in one chunk', () => {
    const seen: RpcMessage[] = []
    const reader = createMessageReader((message) => seen.push(message))

    reader.push(
      encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }) +
        encodeMessage({ jsonrpc: '2.0', id: 2, method: 'shutdown' }),
    )

    expect(seen.map((message) => message.method)).toEqual(['initialize', 'shutdown'])
  })

  it('survives a malformed body without stalling the stream', () => {
    const seen: RpcMessage[] = []
    const reader = createMessageReader((message) => seen.push(message))

    reader.push('Content-Length: 3\r\n\r\n{ x')
    reader.push(encodeMessage({ jsonrpc: '2.0', id: 3, method: 'shutdown' }))

    expect(seen.map((message) => message.method)).toEqual(['shutdown'])
  })

  it('counts Content-Length in bytes, not code units', () => {
    const framed = encodeMessage({ jsonrpc: '2.0', id: 1, method: '😀' })
    const declared = Number(/Content-Length: (\d+)/.exec(framed)?.[1])
    const body = framed.slice(framed.indexOf('\r\n\r\n') + 4)

    expect(declared).toBe(new TextEncoder().encode(body).length)
    expect(declared).toBeGreaterThan(body.length)
  })
})
