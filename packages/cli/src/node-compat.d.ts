declare const process: {
  argv: string[]
  cwd(): string
  env: Readonly<Record<string, string | undefined>>
  exitCode: number | undefined
  platform: string
  stdout: { write(value: string): unknown }
  stderr: { write(value: string): unknown; isTTY?: boolean }
}

declare module 'node:fs/promises' {
  interface FileStats {
    isSymbolicLink(): boolean
  }

  export function lstat(path: string): Promise<FileStats>
  export function mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<unknown>
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function readFile(path: string): Promise<Uint8Array>
  export function stat(path: string): Promise<{ isFile(): boolean }>
  export function readdir(path: string): Promise<string[]>
  export function realpath(path: string): Promise<string>
  // Only `force` is declared: it is the option the CLI uses, and declaring `recursive` would
  // make an accidental directory deletion typecheck.
  export function rm(path: string, options?: { readonly force?: boolean }): Promise<void>
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
}

declare module 'node:path' {
  export const sep: string
  export function basename(path: string, suffix?: string): string
  export function dirname(path: string): string
  export function extname(path: string): string
  export function isAbsolute(path: string): boolean
  export function join(...paths: string[]): string
  export function join(...paths: string[]): string
  export function relative(from: string, to: string): string
  export function resolve(...paths: string[]): string
}

declare module 'node:util' {
  interface ParseArgsResult {
    readonly values: {
      readonly help?: boolean
      readonly version?: boolean
      readonly out?: string
      readonly trust: string
      readonly gfm: boolean
      readonly json: boolean
      readonly check: boolean
    }
    readonly positionals: string[]
  }

  export function parseArgs(options: {
    readonly args: string[]
    readonly allowNegative: boolean
    readonly allowPositionals: boolean
    readonly strict: boolean
    readonly options: Readonly<Record<string, unknown>>
  }): ParseArgsResult
}

// Extended for `hmx dev`. These declarations stay hand-written rather than pulling in
// @types/node so the type surface the CLI may reach for is visible and bounded — the
// compiler packages must never acquire Node types by transitive installation.
declare module 'node:fs' {
  interface FsWatcher {
    close(): void
  }
  export function watch(
    path: string,
    options: { readonly recursive?: boolean },
    listener: (event: string, filename: string | null) => void,
  ): FsWatcher
}

declare module 'node:http' {
  interface IncomingMessage {
    readonly url?: string
    on(event: 'close', listener: () => void): unknown
  }
  interface ServerResponse {
    write(chunk: string): unknown
    end(chunk?: string | Uint8Array): unknown
    writeHead(status: number, headers?: Readonly<Record<string, string>>): ServerResponse
  }
  interface Server {
    listen(port: number, host: string, listener: () => void): unknown
    once(event: 'error', listener: (error: unknown) => void): unknown
    address(): { port: number } | string | null
    close(listener: () => void): unknown
  }
  export function createServer(
    handler: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server
}

declare function setTimeout(handler: () => void, timeout: number): { readonly id: unique symbol }
declare function clearTimeout(handle: ReturnType<typeof setTimeout>): void

declare class URL {
  constructor(input: string, base?: string)
  readonly pathname: string
}
