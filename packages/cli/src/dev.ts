import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { renderDiagnostics } from '@hymarkx/compiler'
import type { CompileResult, TrustMode } from '@hymarkx/compiler'

/** Minimal writer the dev server needs, matching the CLI environment. */
export interface DevIo {
  readonly stderr: { write(value: string): unknown }
}

/**
 * Compiles one document, given its absolute path.
 *
 * Supplied by the caller so that component discovery stays in one place: the dev server
 * serves, and does not grow a second copy of resolution logic that can drift from build.
 */
export type CompileDocument = (documentPath: string) => Promise<CompileResult>

/** Options for the development server. */
export interface DevOptions {
  readonly root: string
  readonly port: number
  readonly trust: TrustMode
}

/** A running development server. */
export interface DevServer {
  readonly port: number
  close(): Promise<void>
}

const DOCUMENT_EXTENSIONS = ['.hmx', '.md'] as const

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/**
 * The reload client, injected only by `hmx dev`.
 *
 * It must never reach `hmx build` output: a development convenience in a production build
 * would break output proportionality, which is one of the project's few real advantages.
 * Server-sent events are used rather than a socket so the server needs no dependency.
 */
const RELOAD_CLIENT = `<script>
new EventSource("/__hmx/reload").onmessage = () => location.reload()
</script>
`

function isInside(root: string, path: string): boolean {
  const candidate = relative(root, path)
  return candidate === '' || (!candidate.startsWith('..') && !candidate.startsWith(sep))
}

async function firstExisting(paths: readonly string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (info.isFile()) {
        return path
      }
    } catch {
      continue
    }
  }
  return undefined
}

/** Maps a URL path to a document on disk, trying `.hmx`, `.md`, and directory indexes. */
async function documentFor(root: string, urlPath: string): Promise<string | undefined> {
  const trimmed = urlPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const base = trimmed === '' ? 'index' : trimmed
  const target = resolve(root, base)
  if (!isInside(root, target)) {
    return undefined
  }
  return await firstExisting([
    ...DOCUMENT_EXTENSIONS.map((extension) => `${target}${extension}`),
    ...DOCUMENT_EXTENSIONS.map((extension) => join(target, `index${extension}`)),
  ])
}

function page(result: CompileResult): string {
  const styles = result.css === '' ? '' : `<style>\n${result.css}</style>\n`
  const scripts = result.js === '' ? '' : `<script>\n${result.js}</script>\n`
  return `${styles}${result.html}${scripts}${RELOAD_CLIENT}`
}

/** Renders a compile failure as a readable page rather than a blank screen. */
function errorPage(from: string, detail: string): string {
  const escaped = detail.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace;padding:1rem">${escaped}</pre>\n<p style="font:14px ui-monospace,monospace;padding:0 1rem;color:#666">${from}</p>\n${RELOAD_CLIENT}`
}

/**
 * Starts the development server.
 *
 * Documents are compiled per request rather than kept in a build cache, which removes cache
 * invalidation as a source of bugs entirely; the watcher exists only to tell browsers to
 * reload. At the document sizes HMX targets a recompile is a few milliseconds.
 */
export async function startDevServer(
  options: DevOptions,
  io: DevIo,
  compileDocument: CompileDocument,
): Promise<DevServer> {
  const root = resolve(options.root)
  const clients = new Set<{ write(chunk: string): unknown; end(): unknown }>()

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (url.pathname === '/__hmx/reload') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      response.write('\n')
      clients.add(response)
      request.on('close', () => clients.delete(response))
      return
    }

    void (async () => {
      const documentPath = await documentFor(root, url.pathname)
      if (documentPath !== undefined) {
        try {
          const from = relative(root, documentPath) || documentPath
          const result = await compileDocument(documentPath)
          if (result.diagnostics.length > 0) {
            io.stderr.write(renderDiagnostics(result.diagnostics, result.source, { from }))
          }
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end(page(result))
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end(errorPage(relative(root, documentPath), detail))
        }
        return
      }

      // Anything that is not a document is served as a static asset, so images and
      // stylesheets referenced by a page resolve without a build step.
      const assetPath = resolve(root, url.pathname.replace(/^\/+/, ''))
      if (!isInside(root, assetPath)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      try {
        const body = await readFile(assetPath)
        const type = CONTENT_TYPES[extname(assetPath).toLowerCase()] ?? 'application/octet-stream'
        response.writeHead(200, { 'Content-Type': type })
        response.end(body)
      } catch {
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(`<p>Not found: ${url.pathname}</p>\n${RELOAD_CLIENT}`)
      }
    })()
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    // Bound to loopback deliberately: a dev server compiles local files in app trust mode
    // and must not be reachable from the network.
    server.listen(options.port, '127.0.0.1', resolveListen)
  })

  let pending: ReturnType<typeof setTimeout> | undefined
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (filename === null || filename.includes(`${sep}node_modules${sep}`)) {
      return
    }
    // Editors write files in bursts; one reload per burst is enough.
    if (pending !== undefined) {
      clearTimeout(pending)
    }
    pending = setTimeout(() => {
      for (const client of clients) {
        client.write('data: reload\n\n')
      }
    }, 50)
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  io.stderr.write(`hmx dev serving ${root} on http://127.0.0.1:${port}\n`)

  return {
    port,
    async close() {
      if (pending !== undefined) {
        clearTimeout(pending)
      }
      watcher.close()
      for (const client of clients) {
        client.end()
      }
      clients.clear()
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    },
  }
}
