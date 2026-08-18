import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { compile, compileComponents, diagnosticOrigin, renderDiagnostic } from '@hymarkx/compiler'
import { format } from '@hymarkx/formatter'
import { startDevServer } from './dev.js'
import type {
  AuthoredComponent,
  CompileResult,
  FrontmatterValue,
  TrustMode,
} from '@hymarkx/compiler'

/** Current CLI package version. */
export const VERSION = '0.0.2'

/** Injectable CLI environment used by the binary and subprocess tests. */
export interface CliIo {
  readonly cwd: string
  readonly stdout: { write(value: string): unknown }
  readonly stderr: { write(value: string): unknown }
  readonly color: boolean
}

type Diagnostic = CompileResult['diagnostics'][number]

interface DiagnosticRecord {
  readonly diagnostic: Diagnostic
  readonly source: string
  readonly from: string
}

interface OutputTarget {
  readonly input: string
  readonly root: string
  readonly path: string
  readonly cssPath: string
  readonly jsPath: string
}

interface ComponentResolution {
  readonly sources: readonly AuthoredComponent[]
  readonly records: readonly DiagnosticRecord[]
  readonly ioFailed: boolean
}

const ZERO_SPAN = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
} as const

const HELP = `Usage: hmx <command> [options]

Commands:
  hmx build <input...> [--out <dir>] [--trust document|app] [--no-gfm] [--json]
  hmx check <input...> [--trust document|app] [--no-gfm] [--json]
  hmx fmt <input...> [--check] [--json]
  hmx dev [dir] [--out <port>] [--trust document|app]

Options:
  --out <dir>                 Output directory; use - for stdout
  --check                     fmt only: report rather than rewrite; exit 1 if changed
  --trust document|app        Host-selected trust mode (default: document)
  --no-gfm                    Disable GFM extensions
  --json                      Print diagnostics as JSON
  --help                      Show help
  --version                   Show version
`

function cliDiagnostic(code: string, message: string): Diagnostic {
  return { code, severity: 'error', message, span: ZERO_SPAN }
}

function diagnosticRecord(
  diagnostic: Diagnostic,
  fallbackSource: string,
  fallbackFrom: string,
): DiagnosticRecord {
  const origin = diagnosticOrigin(diagnostic)
  return {
    diagnostic,
    source: origin?.source ?? fallbackSource,
    from: origin?.from ?? fallbackFrom,
  }
}

/**
 * Formats files in place, or reports which would change under `--check`.
 *
 * `--check` is the CI mode: it writes nothing and exits 1 when any file differs, so a
 * pipeline fails on unformatted input rather than quietly rewriting the repository.
 */
async function runFormat(
  inputs: readonly string[],
  checkOnly: boolean,
  json: boolean,
  io: CliIo,
): Promise<number> {
  const results: { readonly path: string; readonly changed: boolean }[] = []
  let failed = false

  for (const input of inputs) {
    const inputPath = resolve(io.cwd, input)
    if (!isInside(resolve(io.cwd), inputPath) && !isAbsolute(input)) {
      io.stderr.write(`error: input escapes the working directory: ${input}\n`)
      failed = true
      continue
    }
    let source: string
    try {
      source = await readFile(inputPath, 'utf8')
    } catch (error) {
      io.stderr.write(`error: could not read ${input}: ${(error as Error).message}\n`)
      failed = true
      continue
    }

    const result = format(source, { from: input })
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') {
        io.stderr.write(renderDiagnostic(diagnostic, source, { color: io.color, from: input }))
      }
    }
    results.push({ path: input, changed: result.changed })
    if (result.changed && !checkOnly) {
      try {
        await writeFile(inputPath, result.source, 'utf8')
      } catch (error) {
        io.stderr.write(`error: could not write ${input}: ${(error as Error).message}\n`)
        failed = true
      }
    }
  }

  if (json) {
    io.stdout.write(`${JSON.stringify({ files: results })}\n`)
  } else {
    const changed = results.filter((entry) => entry.changed)
    if (checkOnly) {
      for (const entry of changed) {
        io.stderr.write(`would reformat ${entry.path}\n`)
      }
    }
    io.stderr.write(
      `${checkOnly ? 'checked' : 'formatted'} ${results.length} file${results.length === 1 ? '' : 's'}, ${changed.length} changed\n`,
    )
  }

  if (failed) {
    return 2
  }
  return checkOnly && results.some((entry) => entry.changed) ? 1 : 0
}

function isInside(root: string, path: string): boolean {
  const candidate = relative(root, path)
  return (
    candidate === '' ||
    (!isAbsolute(candidate) && candidate !== '..' && !candidate.startsWith(`..${sep}`))
  )
}

/**
 * Runs the development server until interrupted.
 *
 * Component discovery is reused from the build path rather than reimplemented, so a page
 * cannot render differently under `hmx dev` than it will under `hmx build`.
 */
async function runDev(
  directory: string,
  trust: TrustMode,
  port: string | undefined,
  io: CliIo,
): Promise<number> {
  const root = resolve(io.cwd, directory)
  const parsedPort = port === undefined ? 4321 : Number(port)
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    return usageError('--out must be a port number when used with dev', io)
  }

  const compileDocument = async (documentPath: string): Promise<CompileResult> => {
    const source = await readFile(documentPath, 'utf8')
    const from = relative(root, documentPath) || documentPath
    const inspected = compile(source, { trust, from })
    const resolved = await resolveComponents(documentPath, from, root, inspected.frontmatter)
    const authored = compileComponents(resolved.sources, { trust })
    return compile(source, {
      trust,
      from,
      components: authored.registry,
      inlineCss: false,
      inlineJs: false,
    })
  }

  const server = await startDevServer({ root, port: parsedPort, trust }, io, compileDocument)
  await new Promise<void>(() => {
    // Runs until the process is interrupted; the caller owns the lifetime.
  })
  await server.close()
  return 0
}

function outputName(path: string, extension: '.html' | '.css' | '.js'): string {
  return `${basename(path, extname(path))}${extension}`
}

/**
 * Writes a CSS or JS sidecar, or removes it when the compiler produced nothing.
 *
 * Output proportionality is a promise the compiler already keeps — a document that uses no
 * interactivity compiles to an empty string — but writing that empty string still left a
 * 0-byte `.js` file in the output directory, which is a file somebody has to explain, deploy,
 * or wonder about. The emitted HTML never referenced it.
 *
 * Removal matters as much as skipping. A document that had state and then lost it would
 * otherwise keep serving the previous build's runtime, which is worse than an empty file: it is
 * a stale one that still loads.
 */
async function writeSidecar(path: string, contents: string): Promise<void> {
  if (contents === '') {
    await rm(path, { force: true })
    return
  }
  await writeFile(path, contents, 'utf8')
}

function outputTarget(
  input: string,
  out: string | undefined,
  cwd: string,
): OutputTarget | undefined {
  const inputPath = resolve(cwd, input)
  if (out === undefined) {
    const root = dirname(inputPath)
    return {
      input: inputPath,
      root,
      path: resolve(root, outputName(inputPath, '.html')),
      cssPath: resolve(root, outputName(inputPath, '.css')),
      jsPath: resolve(root, outputName(inputPath, '.js')),
    }
  }
  if (out === '-') {
    return undefined
  }

  const root = resolve(cwd, out)
  const relativeInput = relative(cwd, inputPath)
  const relativeStem = relativeInput.slice(0, -extname(relativeInput).length)
  return {
    input: inputPath,
    root,
    path: resolve(root, `${relativeStem}.html`),
    cssPath: resolve(root, `${relativeStem}.css`),
    jsPath: resolve(root, `${relativeStem}.js`),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    return (error as { readonly code?: string }).code !== 'ENOENT' ? Promise.reject(error) : false
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

function componentIoRecord(input: string, path: string, error: unknown): DiagnosticRecord {
  const detail = error instanceof Error ? error.message : String(error)
  return {
    diagnostic: cliDiagnostic('HMX5004', `Could not read component ${path}: ${detail}`),
    source: '',
    from: input,
  }
}

function componentTraversalRecord(input: string, path: string): DiagnosticRecord {
  return {
    diagnostic: cliDiagnostic('HMX3006', `Component path escapes the project root: ${path}`),
    source: '',
    from: input,
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function configuredComponents(
  frontmatter: FrontmatterValue | undefined,
): readonly (readonly [string, string])[] {
  const value = frontmatter?.components
  if (!isRecord(value)) {
    return []
  }
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
}

async function discoveredComponentFiles(
  directory: string,
  projectRoot: string,
  realProjectRoot: string,
  input: string,
  records: DiagnosticRecord[],
): Promise<{ readonly files: readonly string[]; readonly ioFailed: boolean }> {
  if (!isInside(projectRoot, directory)) {
    records.push(componentTraversalRecord(input, directory))
    return { files: [], ioFailed: false }
  }

  let realDirectory: string
  try {
    realDirectory = await realpath(directory)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { files: [], ioFailed: false }
    }
    records.push(componentIoRecord(input, directory, error))
    return { files: [], ioFailed: true }
  }
  if (!isInside(realProjectRoot, realDirectory)) {
    records.push(componentTraversalRecord(input, directory))
    return { files: [], ioFailed: false }
  }

  try {
    const names = await readdir(realDirectory)
    return {
      files: names
        .filter((name) => extname(name).toLowerCase() === '.hmx')
        .sort()
        .map((name) => resolve(directory, name)),
      ioFailed: false,
    }
  } catch (error) {
    records.push(componentIoRecord(input, directory, error))
    return { files: [], ioFailed: true }
  }
}

async function resolveComponents(
  inputPath: string,
  input: string,
  projectRoot: string,
  frontmatter: FrontmatterValue | undefined,
): Promise<ComponentResolution> {
  const records: DiagnosticRecord[] = []
  const paths = new Map<string, string>()
  const realProjectRoot = await realpath(projectRoot)
  let ioFailed = false
  const localDirectory = resolve(dirname(inputPath), 'components')
  const rootDirectory = resolve(projectRoot, 'components')
  const directoryKeys = new Set<string>()

  for (const directory of [localDirectory, rootDirectory]) {
    const key = process.platform === 'win32' ? directory.toLowerCase() : directory
    if (directoryKeys.has(key)) {
      continue
    }
    directoryKeys.add(key)
    const discovered = await discoveredComponentFiles(
      directory,
      projectRoot,
      realProjectRoot,
      input,
      records,
    )
    ioFailed ||= discovered.ioFailed
    for (const path of discovered.files) {
      const name = basename(path, extname(path))
      if (!paths.has(name)) {
        paths.set(name, path)
      }
    }
  }

  for (const [name, path] of configuredComponents(frontmatter)) {
    paths.set(name, resolve(dirname(inputPath), path))
  }

  const sources: AuthoredComponent[] = []
  for (const [name, path] of paths) {
    if (!isInside(projectRoot, path)) {
      records.push(componentTraversalRecord(input, path))
      continue
    }

    let realPath: string
    try {
      realPath = await realpath(path)
    } catch (error) {
      records.push(componentIoRecord(input, path, error))
      ioFailed = true
      continue
    }
    if (!isInside(realProjectRoot, realPath)) {
      records.push(componentTraversalRecord(input, path))
      continue
    }

    try {
      sources.push({
        name,
        source: await readFile(realPath, 'utf8'),
        from: relative(projectRoot, path),
      })
    } catch (error) {
      records.push(componentIoRecord(input, path, error))
      ioFailed = true
    }
  }

  return { sources, records, ioFailed }
}

async function prepareOutputTarget(target: OutputTarget): Promise<boolean> {
  if (!isInside(target.root, target.path)) {
    return false
  }

  await mkdir(target.root, { recursive: true })
  const rootPath = await realpath(target.root)
  const parent = dirname(target.path)
  const segments = relative(target.root, parent).split(sep).filter(Boolean)
  let current = target.root

  for (const segment of segments) {
    current = resolve(current, segment)
    if (!(await pathExists(current))) {
      await mkdir(current)
    }
    const currentPath = await realpath(current)
    if (!isInside(rootPath, currentPath)) {
      return false
    }
  }

  if (await pathExists(target.path)) {
    const metadata = await lstat(target.path)
    if (metadata.isSymbolicLink()) {
      return false
    }
  }
  return true
}

function summary(diagnostics: readonly Diagnostic[], files: number): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length
  return `${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${
    warnings === 1 ? 'warning' : 'warnings'
  } in ${files} ${files === 1 ? 'file' : 'files'}\n`
}

function usageError(message: string, io: CliIo): number {
  io.stderr.write(`error: ${message}\n\n${HELP}`)
  return 2
}

function defaultIo(): CliIo {
  return {
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    color: process.stderr.isTTY === true && process.env.NO_COLOR === undefined,
  }
}

function jsonFrontmatter(
  inputs: readonly string[],
  frontmatters: ReadonlyMap<string, FrontmatterValue>,
): FrontmatterValue | Readonly<Record<string, FrontmatterValue>> | undefined {
  if (frontmatters.size === 0) {
    return undefined
  }
  if (inputs.length === 1) {
    return frontmatters.get(inputs[0] ?? '')
  }

  const output = Object.create(null) as Record<string, FrontmatterValue>
  for (const [input, value] of frontmatters) {
    output[input] = value
  }
  return output
}

/** Runs the `hmx` command and resolves to its documented process exit code. */
export async function runCli(
  arguments_: readonly string[] = process.argv.slice(2),
  io: CliIo = defaultIo(),
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...arguments_],
      allowNegative: true,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        out: { type: 'string' },
        trust: { type: 'string', default: 'document' },
        gfm: { type: 'boolean', default: true },
        json: { type: 'boolean', default: false },
        check: { type: 'boolean', default: false },
      },
    })
  } catch (error) {
    return usageError(error instanceof Error ? error.message : String(error), io)
  }

  if (parsed.values.version === true) {
    io.stdout.write(`${VERSION}\n`)
    return 0
  }
  if (parsed.values.help === true) {
    io.stdout.write(HELP)
    return 0
  }

  const [command, ...inputs] = parsed.positionals
  if (command === 'dev') {
    if (parsed.values.trust !== 'document' && parsed.values.trust !== 'app') {
      return usageError('--trust must be either document or app', io)
    }
    return await runDev(inputs[0] ?? '.', parsed.values.trust, parsed.values.out, io)
  }
  if (command === 'fmt') {
    if (inputs.length === 0) {
      return usageError('fmt requires at least one input file', io)
    }
    return await runFormat(inputs, parsed.values.check === true, parsed.values.json === true, io)
  }
  if (command !== 'build' && command !== 'check') {
    return usageError(
      command === undefined ? 'a command is required' : `unknown command: ${command}`,
      io,
    )
  }
  if (inputs.length === 0) {
    return usageError(`${command} requires at least one input file`, io)
  }
  if (parsed.values.trust !== 'document' && parsed.values.trust !== 'app') {
    return usageError('--trust must be either document or app', io)
  }
  if (command === 'check' && parsed.values.out !== undefined) {
    return usageError('--out is only valid with build', io)
  }
  if (parsed.values.json === true && parsed.values.out === '-') {
    return usageError('--json and --out - cannot both write to stdout', io)
  }

  const trust: TrustMode = parsed.values.trust
  const records: DiagnosticRecord[] = []
  const targets = new Map<string, OutputTarget>()
  const collisions = new Set<string>()
  const frontmatters = new Map<string, FrontmatterValue>()
  let ioFailed = false

  if (command === 'build' && parsed.values.out !== '-') {
    for (const input of inputs) {
      const target = outputTarget(input, parsed.values.out, io.cwd)
      if (target === undefined) {
        continue
      }
      if (!isInside(target.root, target.path)) {
        records.push({
          diagnostic: cliDiagnostic(
            'HMX3006',
            `Output path escapes its intended root: ${target.path}`,
          ),
          source: '',
          from: input,
        })
        continue
      }

      const key = process.platform === 'win32' ? target.path.toLowerCase() : target.path
      if (targets.has(key)) {
        collisions.add(key)
        records.push({
          diagnostic: cliDiagnostic('HMX5003', `Multiple inputs would write ${target.path}.`),
          source: '',
          from: input,
        })
      } else {
        targets.set(key, target)
      }
    }
  }

  for (const input of inputs) {
    const extension = extname(input).toLowerCase()
    if (extension !== '.md' && extension !== '.hmx') {
      records.push({
        diagnostic: cliDiagnostic(
          'HMX5002',
          `Unsupported input extension "${extension || '<none>'}".`,
        ),
        source: '',
        from: input,
      })
      continue
    }

    const inputPath = resolve(io.cwd, input)
    const target = command === 'build' ? outputTarget(input, parsed.values.out, io.cwd) : undefined
    if (target !== undefined && !isInside(target.root, target.path)) {
      continue
    }

    let source: string
    try {
      source = await readFile(inputPath, 'utf8')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      records.push({
        diagnostic: cliDiagnostic('HMX5004', `Could not read ${input}: ${detail}`),
        source: '',
        from: input,
      })
      ioFailed = true
      continue
    }

    // Component paths live in parsed frontmatter, so inspect it before the final pass that
    // receives the resolved registry and produces the document diagnostics.
    const inspected = compile(source, {
      trust,
      from: input,
      gfm: parsed.values.gfm,
    })
    if (inspected.frontmatter !== undefined) {
      frontmatters.set(input, inspected.frontmatter)
    }
    // The document's own directory is a legitimate component root even when the document
    // sits outside the working directory — `hmx build /elsewhere/page.md` must still find
    // `/elsewhere/components/`. Using only the cwd made that fail with a traversal error.
    const componentRoot = isInside(resolve(io.cwd), inputPath)
      ? resolve(io.cwd)
      : dirname(inputPath)
    const resolvedComponents = await resolveComponents(
      inputPath,
      input,
      componentRoot,
      inspected.frontmatter,
    )
    records.push(...resolvedComponents.records)
    if (resolvedComponents.ioFailed) {
      ioFailed = true
      continue
    }
    const authored = compileComponents(resolvedComponents.sources, {
      trust,
      gfm: parsed.values.gfm,
    })
    records.push(
      ...authored.diagnostics.map((diagnostic) => diagnosticRecord(diagnostic, '', input)),
    )

    const result = compile(source, {
      trust,
      from: input,
      gfm: parsed.values.gfm,
      components: authored.registry,
      inlineCss: command === 'build' && parsed.values.out === '-',
      inlineJs: command === 'build' && parsed.values.out === '-',
    })
    records.push(
      ...result.diagnostics.map((diagnostic) => diagnosticRecord(diagnostic, result.source, input)),
    )

    if (command !== 'build') {
      continue
    }
    if (parsed.values.out === '-') {
      io.stdout.write(result.html)
      continue
    }
    if (target === undefined) {
      continue
    }
    const key = process.platform === 'win32' ? target.path.toLowerCase() : target.path
    if (collisions.has(key) || targets.get(key)?.input !== inputPath) {
      continue
    }

    try {
      if (
        !(await prepareOutputTarget(target)) ||
        !(await prepareOutputTarget({
          ...target,
          path: target.cssPath,
        })) ||
        !(await prepareOutputTarget({
          ...target,
          path: target.jsPath,
        }))
      ) {
        records.push({
          diagnostic: cliDiagnostic(
            'HMX3006',
            `Output path escapes its intended root: ${target.path}`,
          ),
          source: result.source,
          from: input,
        })
        continue
      }
      await writeFile(target.path, result.html, 'utf8')
      await writeSidecar(target.cssPath, result.css)
      await writeSidecar(target.jsPath, result.js)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      records.push({
        diagnostic: cliDiagnostic('HMX5004', `Could not write ${target.path}: ${detail}`),
        source: result.source,
        from: input,
      })
      ioFailed = true
    }
  }

  const diagnostics = records.map((record) => record.diagnostic)
  if (parsed.values.json === true) {
    const frontmatter = jsonFrontmatter(inputs, frontmatters)
    const jsonDiagnostics = records.map((record) => ({
      ...record.diagnostic,
      from: record.from,
    }))
    io.stdout.write(
      `${JSON.stringify({ diagnostics: jsonDiagnostics, ...(frontmatter === undefined ? {} : { frontmatter }) })}\n`,
    )
  } else {
    for (const record of records) {
      io.stderr.write(
        `${renderDiagnostic(record.diagnostic, record.source, {
          color: io.color,
          from: record.from,
        })}\n`,
      )
    }
    io.stderr.write(summary(diagnostics, inputs.length))
  }

  if (ioFailed) {
    return 2
  }
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0
}
