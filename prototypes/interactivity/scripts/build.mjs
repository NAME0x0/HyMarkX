import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileInteractive } from '../src/compiler.mjs'

const project = new URL('../', import.meta.url)
const documents = new URL('documents/', project)
const output = new URL('dist/', project)

async function readDocument(name) {
  return readFile(new URL(name, documents), 'utf8')
}

async function writeResult(name, result) {
  await writeFile(new URL(`${name}.html`, output), result.page)
  await writeFile(new URL(`${name}.fragment.html`, output), result.html)
  await writeFile(new URL(`${name}.runtime.js`, output), result.runtime)
  await writeFile(new URL(`${name}.bindings.js`, output), result.bindings)
}

export async function build() {
  await mkdir(output, { recursive: true })
  const names = ['counter', 'input-binding', 'static']
  const results = {}
  for (const name of names) {
    const result = compileInteractive(await readDocument(`${name}.hmx`))
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) {
      throw new Error(`${name} produced diagnostics: ${JSON.stringify(errors)}`)
    }
    await writeResult(name, result)
    results[name] = result
  }
  return results
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const results = await build()
  for (const [name, result] of Object.entries(results)) {
    console.log(`${name}: ${Buffer.byteLength(result.page)} bytes, reactive=${result.reactive}`)
  }
}
