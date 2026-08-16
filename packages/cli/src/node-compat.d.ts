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
  export function readdir(path: string): Promise<string[]>
  export function realpath(path: string): Promise<string>
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
}

declare module 'node:path' {
  export const sep: string
  export function basename(path: string, suffix?: string): string
  export function dirname(path: string): string
  export function extname(path: string): string
  export function isAbsolute(path: string): boolean
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
