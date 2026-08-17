import { compile, builtinComponents, renderDiagnostic } from '@hymarkx/compiler'
import type { AttributeSchema, ComponentRegistry, ComponentSchema } from '@hymarkx/compiler'
import { format } from '@hymarkx/formatter'
import type { Diagnostic as HmxDiagnostic } from '@hymarkx/ast'

/** A JSON-RPC request or notification. */
export interface RpcMessage {
  readonly jsonrpc: '2.0'
  readonly id?: number | string
  readonly method?: string
  readonly params?: unknown
  readonly result?: unknown
}

/** Zero-based LSP position. */
interface Position {
  readonly line: number
  readonly character: number
}

const SEVERITY: Readonly<Record<string, number>> = { error: 1, warning: 2, info: 3 }

/**
 * Converts an HMX diagnostic to LSP shape.
 *
 * HMX spans are 1-based line and column in UTF-16 code units; LSP is 0-based. Both count
 * UTF-16, so only the origin differs.
 */
function toLspDiagnostic(diagnostic: HmxDiagnostic): unknown {
  return {
    range: {
      start: { line: diagnostic.span.start.line - 1, character: diagnostic.span.start.column - 1 },
      end: { line: diagnostic.span.end.line - 1, character: diagnostic.span.end.column - 1 },
    },
    severity: SEVERITY[diagnostic.severity] ?? 1,
    code: diagnostic.code,
    source: 'hmx',
    message:
      diagnostic.expected === undefined
        ? diagnostic.message
        : `${diagnostic.message}\nExpected ${diagnostic.expected}.`,
  }
}

function offsetAt(text: string, position: Position): number {
  let offset = 0
  const lines = text.split('\n')
  for (let index = 0; index < position.line && index < lines.length; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1
  }
  return offset + position.character
}

/** The directive name being typed at `offset`, if the cursor sits in a directive opener. */
function directiveNameAt(text: string, offset: number): string | undefined {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const line = text.slice(lineStart, offset)
  return /^:{1,3}([A-Za-z0-9_-]*)$/.exec(line)?.[1]
}

/** The component whose attribute block contains `offset`, if any. */
function componentForAttributes(
  text: string,
  offset: number,
  registry: ComponentRegistry,
): ComponentSchema | undefined {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const line = text.slice(lineStart, offset)
  const match = /^:{1,3}([A-Za-z0-9_-]+)(?:\[[^\]]*\])?\{[^}]*$/.exec(line)
  const name = match?.[1]
  return name === undefined ? undefined : registry.schemas[name]
}

function attributeDetail(name: string, schema: AttributeSchema): string {
  const parts = [schema.type === 'enum' ? (schema.values ?? []).join(' | ') : schema.type]
  if (schema.required === true) {
    parts.push('required')
  }
  if (schema.default !== undefined) {
    parts.push(`default ${schema.default}`)
  }
  return `${name}: ${parts.join(', ')}`
}

/**
 * Handles one LSP request and returns its response, or undefined for notifications.
 *
 * Kept as a pure function of message plus document state so the protocol can be driven
 * directly in tests without spawning an editor.
 */
export function handle(
  message: RpcMessage,
  documents: Map<string, string>,
  registry: ComponentRegistry = builtinComponents,
): { readonly response?: unknown; readonly notifications: readonly unknown[] } {
  const notifications: unknown[] = []
  const params = (message.params ?? {}) as Record<string, any>

  const publish = (uri: string, text: string): void => {
    const result = compile(text, { trust: 'app', from: uri, components: registry })
    notifications.push({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri, diagnostics: result.diagnostics.map(toLspDiagnostic) },
    })
  }

  switch (message.method) {
    case 'initialize':
      return {
        response: {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            capabilities: {
              // Full sync: micromark is not incremental, and ADR-0015 measured full
              // reparse as comfortable at the sizes documents actually reach.
              textDocumentSync: 1,
              completionProvider: { triggerCharacters: [':', '{', ' '] },
              hoverProvider: true,
              documentFormattingProvider: true,
            },
            serverInfo: { name: 'hymarkx-language-server', version: '0.0.0' },
          },
        },
        notifications,
      }

    case 'initialized':
    case 'shutdown':
      return message.id === undefined
        ? { notifications }
        : { response: { jsonrpc: '2.0', id: message.id, result: null }, notifications }

    case 'textDocument/didOpen': {
      const uri = String(params.textDocument?.uri ?? '')
      const text = String(params.textDocument?.text ?? '')
      documents.set(uri, text)
      publish(uri, text)
      return { notifications }
    }

    case 'textDocument/didChange': {
      const uri = String(params.textDocument?.uri ?? '')
      const text = String(params.contentChanges?.[0]?.text ?? '')
      documents.set(uri, text)
      publish(uri, text)
      return { notifications }
    }

    case 'textDocument/didClose': {
      documents.delete(String(params.textDocument?.uri ?? ''))
      return { notifications }
    }

    case 'textDocument/completion': {
      const text = documents.get(String(params.textDocument?.uri ?? '')) ?? ''
      const offset = offsetAt(text, params.position as Position)
      const attributeOwner = componentForAttributes(text, offset, registry)

      // Attribute completion is offered first: inside a brace block, component names are
      // never what the author wants.
      const items =
        attributeOwner !== undefined
          ? Object.entries(attributeOwner.attributes).map(([name, schema]) => ({
              label: name,
              kind: 10,
              detail: attributeDetail(name, schema),
              documentation: schema.description,
            }))
          : directiveNameAt(text, offset) === undefined
            ? []
            : Object.values(registry.schemas).map((schema) => ({
                label: schema.name,
                kind: 7,
                detail: schema.kinds.join(' | '),
                documentation: schema.description,
              }))

      return {
        response: { jsonrpc: '2.0', id: message.id, result: { isIncomplete: false, items } },
        notifications,
      }
    }

    case 'textDocument/hover': {
      const text = documents.get(String(params.textDocument?.uri ?? '')) ?? ''
      const offset = offsetAt(text, params.position as Position)
      const lineStart = text.lastIndexOf('\n', offset - 1) + 1
      const lineEnd = text.indexOf('\n', offset) === -1 ? text.length : text.indexOf('\n', offset)
      const name = /^:{1,3}([A-Za-z0-9_-]+)/.exec(text.slice(lineStart, lineEnd))?.[1]
      const schema = name === undefined ? undefined : registry.schemas[name]

      return {
        response: {
          jsonrpc: '2.0',
          id: message.id,
          result:
            schema === undefined
              ? null
              : {
                  contents: {
                    kind: 'markdown',
                    value: [
                      `**${schema.name}** — ${schema.description}`,
                      '',
                      ...Object.entries(schema.attributes).map(
                        ([attribute, attributeSchema]) =>
                          `- \`${attributeDetail(attribute, attributeSchema)}\` — ${attributeSchema.description}`,
                      ),
                    ].join('\n'),
                  },
                },
        },
        notifications,
      }
    }

    case 'textDocument/formatting': {
      const uri = String(params.textDocument?.uri ?? '')
      const text = documents.get(uri) ?? ''
      const result = format(text, { from: uri })
      const lines = text.split('\n')

      return {
        response: {
          jsonrpc: '2.0',
          id: message.id,
          result: result.changed
            ? [
                {
                  range: {
                    start: { line: 0, character: 0 },
                    end: {
                      line: lines.length - 1,
                      character: lines[lines.length - 1]?.length ?? 0,
                    },
                  },
                  newText: result.source,
                },
              ]
            : [],
        },
        notifications,
      }
    }

    default:
      return message.id === undefined
        ? { notifications }
        : {
            response: {
              jsonrpc: '2.0',
              id: message.id,
              error: { code: -32601, message: `Unhandled method: ${message.method}` },
            },
            notifications,
          }
  }
}

export { renderDiagnostic }
