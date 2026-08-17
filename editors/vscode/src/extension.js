const { spawn } = require('node:child_process')
const { join } = require('node:path')

/**
 * Minimal LSP client.
 *
 * Written against the `vscode` API only — the extension deliberately carries no
 * `vscode-languageclient` dependency, matching the server, which speaks the protocol
 * directly. The surface used here is small enough that the dependency would cost more in
 * version churn than it saves in code.
 */
function activate(context) {
  const vscode = require('vscode')
  const serverPath = join(
    context.extensionPath,
    '..',
    '..',
    'packages',
    'language-server',
    'dist',
    'bin.js',
  )

  const server = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] })
  const diagnostics = vscode.languages.createDiagnosticCollection('hymarkx')
  context.subscriptions.push(diagnostics)

  let nextId = 1
  const pending = new Map()

  function send(message) {
    const body = JSON.stringify({ jsonrpc: '2.0', ...message })
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  function request(method, params) {
    const id = nextId++
    send({ id, method, params })
    return new Promise((resolve) => pending.set(id, resolve))
  }

  let buffer = ''
  server.stdout.setEncoding('utf8')
  server.stdout.on('data', (chunk) => {
    buffer += chunk
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.slice(0, headerEnd))?.[1])
      const bodyStart = headerEnd + 4
      if (!Number.isFinite(length) || buffer.length < bodyStart + length) return
      const message = JSON.parse(buffer.slice(bodyStart, bodyStart + length))
      buffer = buffer.slice(bodyStart + length)

      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message.result)
        pending.delete(message.id)
      } else if (message.method === 'textDocument/publishDiagnostics') {
        const uri = vscode.Uri.parse(message.params.uri)
        diagnostics.set(
          uri,
          message.params.diagnostics.map((item) => {
            const range = new vscode.Range(
              item.range.start.line,
              item.range.start.character,
              item.range.end.line,
              item.range.end.character,
            )
            const diagnostic = new vscode.Diagnostic(range, item.message, item.severity - 1)
            diagnostic.code = item.code
            diagnostic.source = item.source
            return diagnostic
          }),
        )
      }
    }
  })

  void request('initialize', { capabilities: {} })
  send({ method: 'initialized', params: {} })

  const sync = (document) => {
    if (document.languageId !== 'hymarkx') return
    send({
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: document.uri.toString(), text: document.getText() },
      },
    })
  }

  vscode.workspace.textDocuments.forEach(sync)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(sync),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== 'hymarkx') return
      send({
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: event.document.uri.toString() },
          contentChanges: [{ text: event.document.getText() }],
        },
      })
    }),
    { dispose: () => server.kill() },
  )
}

module.exports = { activate, deactivate() {} }
