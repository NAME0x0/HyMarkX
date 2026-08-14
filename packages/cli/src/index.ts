import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { compile, renderDiagnostic } from '@hymarkx/compiler'
import type { CompileResult, FrontmatterValue, TrustMode } from '@hymarkx/compiler'

/** Current CLI package version. */
export const VERSION = '0.0.0'

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
}

const ZERO_SPAN = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
} as const

const HELP = `Usage: hmx <command> [options]

Commands:
  hmx build <input...> [--out <dir>] [--trust document|app] [--no-gfm] [--json]
  hmx check <input...> [--trust document|app] [--no-gfm] [--json]

Options:
  --out <dir>                 Output directory; use - for stdout
  --trust document|app        Host-selected trust mode (default: document)
  --no-gfm                    Disable GFM extensions
  --json                      Print diagnostics as JSON
  --help                      Show help
  --version                   Show version
`

function cliDiagnostic(code: string, message: string): Diagnostic {
  return { code, severity: 'error', message, span: ZERO_SPAN }
}

function isInside(root: string, path: string): boolean {
  const candidate = relative(root, path)
  return (
    candidate === '' ||
    (!isAbsolute(candidate) && candidate !== '..' && !candidate.startsWith(`..${sep}`))
  )
}

function outputName(path: string, extension: '.html' | '.css'): string {
  return `${basename(path, extname(path))}${extension}`
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

    const result = compile(source, {
      trust,
      from: input,
      gfm: parsed.values.gfm,
      inlineCss: command === 'build' && parsed.values.out === '-',
    })
    records.push(
      ...result.diagnostics.map((diagnostic) => ({
        diagnostic,
        source: result.source,
        from: input,
      })),
    )
    if (result.frontmatter !== undefined) {
      frontmatters.set(input, result.frontmatter)
    }

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
      await writeFile(target.cssPath, result.css, 'utf8')
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
    io.stdout.write(
      `${JSON.stringify({ diagnostics, ...(frontmatter === undefined ? {} : { frontmatter }) })}\n`,
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
