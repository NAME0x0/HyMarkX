import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const cliPath = resolve(repositoryRoot, 'packages/cli/dist/bin.js')
const typescriptPath = resolve(repositoryRoot, 'node_modules/typescript/bin/tsc')
const outputRoot = mkdtempSync(join(tmpdir(), 'hmx-e2e-'))

beforeAll(() => {
  execFileSync(process.execPath, [typescriptPath, '-b', '--pretty', 'false'], {
    cwd: repositoryRoot,
    stdio: 'pipe',
  })
})

afterAll(() => {
  rmSync(outputRoot, { recursive: true, force: true })
})

describe('built hmx CLI', () => {
  it('reports help and version from the built binary', () => {
    const help = spawnSync(process.execPath, [cliPath, '--help'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    const version = spawnSync(process.execPath, [cliPath, '--version'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })

    expect(help.status).toBe(0)
    expect(help.stdout).toContain('hmx build <input...>')
    expect(version.status).toBe(0)
    expect(version.stdout).toBe('0.0.0\n')
  })

  it('builds examples/hello-world and preserves its relative path under --out', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'build', 'examples/hello-world/index.md', '--out', outputRoot],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const actual = readFileSync(join(outputRoot, 'examples/hello-world/index.html'), 'utf8')
    const expected = readFileSync(
      resolve(repositoryRoot, 'examples/hello-world/index.html'),
      'utf8',
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('0 errors, 0 warnings in 1 file\n')
    expect(actual).toBe(expected)
  })

  it('prints only machine-readable diagnostics with --json', () => {
    const result = spawnSync(
      process.execPath,
      [cliPath, 'check', 'examples/hello-world/index.md', '--json'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ diagnostics: [] })
    expect(result.stderr).toBe('')
  })

  it('builds directive documents with warning-only diagnostics and exit code zero', () => {
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        'build',
        'fixtures/markdown/directives-basic/input.md',
        '--out',
        '-',
        '--trust',
        'app',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('<strong>Revenue</strong><p>Text <em>new</em>.</p>\n')
    expect(result.stderr).toContain('warning[HMX2002]: Unknown directive "card"')
    expect(result.stderr).toContain('warning[HMX2002]: Unknown directive "badge"')
    expect(result.stderr).toContain('0 errors, 2 warnings in 1 file')
  })

  it('uses exit code 1 for document diagnostics and 2 for usage or I/O failures', () => {
    const unsupported = spawnSync(process.execPath, [cliPath, 'check', 'README.txt', '--json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    const missing = spawnSync(process.execPath, [cliPath, 'check', 'missing.md', '--json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    const usage = spawnSync(process.execPath, [cliPath, 'unknown'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })

    expect(unsupported.status).toBe(1)
    expect(JSON.parse(unsupported.stdout).diagnostics[0].code).toBe('HMX5002')
    expect(missing.status).toBe(2)
    expect(JSON.parse(missing.stdout).diagnostics[0].code).toBe('HMX5004')
    expect(usage.status).toBe(2)
  })

  it('diagnoses colliding outputs and writes neither input over the other', () => {
    const collisionRoot = join(outputRoot, 'collision')
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        'build',
        'examples/hello-world/index.md',
        'examples/hello-world/index.md',
        '--out',
        collisionRoot,
        '--json',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).diagnostics[0].code).toBe('HMX5003')
    expect(existsSync(join(collisionRoot, 'examples/hello-world/index.html'))).toBe(false)
  })
})
