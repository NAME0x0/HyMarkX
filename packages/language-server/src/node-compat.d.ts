// Declared as a module rather than a global. The CLI declares a global `process`, and two
// global declarations in one typecheck program collide — importing from 'node:process'
// keeps each host package's Node surface its own.
declare module 'node:process' {
  const process: {
    stdout: { write(value: string): unknown }
    stdin: {
      setEncoding(encoding: 'utf8'): unknown
      on(event: 'data', listener: (chunk: string) => void): unknown
    }
  }
  export default process
}

declare class TextEncoder {
  encode(input: string): { readonly length: number }
}
