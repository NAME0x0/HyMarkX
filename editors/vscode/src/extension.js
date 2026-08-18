import * as vscode from 'vscode'
import { handle } from '@hymarkx/language-server'

/**
 * The HyMarkX language features, running the server in this process.
 *
 * The previous version spawned `@hymarkx/language-server` as a child process and located it at
 * `extensionPath/../../packages/language-server/dist/bin.js` — a path into the monorepo. That
 * works when the extension is run from a checkout and fails for every installed user, because
 * no such directory exists inside a VSIX.
 *
 * Spawning is not needed at all. The server exports `handle(message, documents)`: a synchronous,
 * pure function from one LSP message to a response and any notifications. So the extension
 * bundles it and calls it directly. No child process, no stdio framing, no Content-Length
 * parsing, no path resolution, and nothing to kill on shutdown.
 *
 * What is lost is process isolation — a crash in the server takes the extension host's
 * extension with it rather than dying in its own process. That is an acceptable trade for a
 * compiler that is synchronous and has a fuzzed parser, and it is worth stating rather than
 * discovering.
 */
export function activate(context) {
  // The server is stateless between calls; this map is the document state it operates on.
  const documents = new Map()
  const diagnostics = vscode.languages.createDiagnosticCollection('hymarkx')
  context.subscriptions.push(diagnostics)

  let nextId = 1

  /** Sends one message through the server and applies whatever comes back. */
  function send(method, params) {
    const result = handle({ jsonrpc: '2.0', id: nextId++, method, params }, documents)
    for (const notification of result.notifications) {
      if (notification.method === 'textDocument/publishDiagnostics') {
        applyDiagnostics(notification.params)
      }
    }
    return result.response?.result
  }

  function applyDiagnostics(params) {
    diagnostics.set(
      vscode.Uri.parse(params.uri),
      params.diagnostics.map((item) => {
        const range = toRange(item.range)
        // LSP severities are 1-4 (Error..Hint); the VS Code enum is 0-3 in the same order.
        const diagnostic = new vscode.Diagnostic(range, item.message, item.severity - 1)
        diagnostic.code = item.code
        diagnostic.source = item.source ?? 'hymarkx'
        return diagnostic
      }),
    )
  }

  function toRange(range) {
    return new vscode.Range(
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    )
  }

  const isHmx = (document) => document.languageId === 'hymarkx'

  const open = (document) => {
    if (!isHmx(document)) {
      return
    }
    send('textDocument/didOpen', {
      textDocument: { uri: document.uri.toString(), text: document.getText() },
    })
  }

  send('initialize', { capabilities: {} })
  send('initialized', {})
  vscode.workspace.textDocuments.forEach(open)

  const selector = { language: 'hymarkx' }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(open),

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isHmx(event.document)) {
        return
      }
      send('textDocument/didChange', {
        textDocument: { uri: event.document.uri.toString() },
        contentChanges: [{ text: event.document.getText() }],
      })
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      if (!isHmx(document)) {
        return
      }
      send('textDocument/didClose', { textDocument: { uri: document.uri.toString() } })
      diagnostics.delete(document.uri)
    }),

    // Completion, hover and formatting were implemented in the server and never wired up here,
    // while the extension's own description promised all three.
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          // A CompletionList, not a bare array — reading it as an array yields nothing at all,
          // silently, which is the sort of bug that looks like "completion isn't implemented".
          const list = send('textDocument/completion', {
            textDocument: { uri: document.uri.toString() },
            position: { line: position.line, character: position.character },
          })
          return (list?.items ?? []).map((item) => {
            const completion = new vscode.CompletionItem(item.label)
            completion.detail = item.detail
            completion.documentation = item.documentation
            if (item.kind !== undefined) {
              completion.kind = item.kind - 1
            }
            return completion
          })
        },
      },
      ':',
      '{',
    ),

    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const hover = send('textDocument/hover', {
          textDocument: { uri: document.uri.toString() },
          position: { line: position.line, character: position.character },
        })
        if (!hover?.contents) {
          return undefined
        }
        const markdown = new vscode.MarkdownString(
          typeof hover.contents === 'string' ? hover.contents : hover.contents.value,
        )
        return new vscode.Hover(markdown, hover.range ? toRange(hover.range) : undefined)
      },
    }),

    vscode.languages.registerDocumentFormattingEditProvider(selector, {
      provideDocumentFormattingEdits(document) {
        const edits = send('textDocument/formatting', {
          textDocument: { uri: document.uri.toString() },
          options: {},
        })
        return (edits ?? []).map((edit) =>
          vscode.TextEdit.replace(toRange(edit.range), edit.newText),
        )
      },
    }),
  )
}

export function deactivate() {}
