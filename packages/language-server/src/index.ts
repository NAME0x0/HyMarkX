import process from 'node:process'
import { handle } from './server.js'
import type { RpcMessage } from './server.js'

export { handle } from './server.js'
export type { RpcMessage } from './server.js'

/**
 * Reads LSP messages from a `Content-Length` framed stream.
 *
 * Hand-written rather than depending on `vscode-languageserver`: the protocol subset this
 * server needs is a header, a length, and a JSON body, and the project's dependency
 * discipline is worth more than the few lines saved.
 */
export function createMessageReader(onMessage: (message: RpcMessage) => void): {
  push(chunk: string): void
} {
  let buffer = ''
  return {
    push(chunk: string): void {
      buffer += chunk
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) {
          return
        }
        const length = /Content-Length:\s*(\d+)/i.exec(buffer.slice(0, headerEnd))?.[1]
        if (length === undefined) {
          // Unparseable header: drop it rather than stalling the stream forever.
          buffer = buffer.slice(headerEnd + 4)
          continue
        }
        const bodyStart = headerEnd + 4
        const bodyEnd = bodyStart + Number(length)
        if (buffer.length < bodyEnd) {
          return
        }
        const body = buffer.slice(bodyStart, bodyEnd)
        buffer = buffer.slice(bodyEnd)
        try {
          onMessage(JSON.parse(body) as RpcMessage)
        } catch {
          // A malformed body is the client's problem; staying alive is ours.
        }
      }
    },
  }
}

/** Frames a message for the wire. */
export function encodeMessage(message: unknown): string {
  const body = JSON.stringify(message)
  return `Content-Length: ${new TextEncoder().encode(body).length}\r\n\r\n${body}`
}

/** Runs the server over stdio until the input stream closes. */
export function main(): void {
  const documents = new Map<string, string>()
  const reader = createMessageReader((message) => {
    const { response, notifications } = handle(message, documents)
    for (const notification of notifications) {
      process.stdout.write(encodeMessage(notification))
    }
    if (response !== undefined) {
      process.stdout.write(encodeMessage(response))
    }
  })

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => reader.push(chunk))
}
