/**
 * Enough of the `vscode` API for the extension to run outside an extension host.
 *
 * The real module is injected by VS Code and is not installable from npm, so without this the
 * extension is code that ships to users and can never be executed by a test. Only the surface
 * the extension actually touches is implemented — a fuller fake would be a second thing to keep
 * correct, and the extension deliberately uses very little.
 */

export class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }
}

export class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = new Position(startLine, startCharacter)
    this.end = new Position(endLine, endCharacter)
  }
}

export class Diagnostic {
  constructor(range, message, severity) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

export class CompletionItem {
  constructor(label) {
    this.label = label
  }
}

export class Hover {
  constructor(contents, range) {
    this.contents = contents
    this.range = range
  }
}

export class MarkdownString {
  constructor(value) {
    this.value = value
  }
}

export const TextEdit = {
  replace: (range, newText) => ({ range, newText }),
}

export const Uri = {
  parse: (value) => ({ toString: () => value, fsPath: value }),
}

/** Records every listener so a test can drive the editor's events itself. */
export const listeners = {
  open: [],
  change: [],
  close: [],
}

export const providers = {
  completion: undefined,
  hover: undefined,
  formatting: undefined,
}

export const collections = []

export const languages = {
  createDiagnosticCollection(name) {
    const entries = new Map()
    const collection = {
      name,
      entries,
      set: (uri, diagnostics) => entries.set(uri.toString(), diagnostics),
      delete: (uri) => entries.delete(uri.toString()),
      dispose: () => entries.clear(),
    }
    collections.push(collection)
    return collection
  },
  registerCompletionItemProvider(_selector, provider) {
    providers.completion = provider
    return { dispose() {} }
  },
  registerHoverProvider(_selector, provider) {
    providers.hover = provider
    return { dispose() {} }
  },
  registerDocumentFormattingEditProvider(_selector, provider) {
    providers.formatting = provider
    return { dispose() {} }
  },
}

export const workspace = {
  textDocuments: [],
  onDidOpenTextDocument(listener) {
    listeners.open.push(listener)
    return { dispose() {} }
  },
  onDidChangeTextDocument(listener) {
    listeners.change.push(listener)
    return { dispose() {} }
  },
  onDidCloseTextDocument(listener) {
    listeners.close.push(listener)
    return { dispose() {} }
  },
}

/** Builds a document object shaped like the parts of `TextDocument` the extension reads. */
export function document(path, text, languageId = 'hymarkx') {
  return {
    languageId,
    uri: Uri.parse(path),
    getText: () => text,
  }
}

/** Clears module-level state so tests do not leak listeners into one another. */
export function reset() {
  listeners.open.length = 0
  listeners.change.length = 0
  listeners.close.length = 0
  collections.length = 0
  providers.completion = undefined
  providers.hover = undefined
  providers.formatting = undefined
  workspace.textDocuments = []
}
