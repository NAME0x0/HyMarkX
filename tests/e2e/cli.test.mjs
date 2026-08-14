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

  it('includes parsed frontmatter in check and build JSON output', () => {
    const input = 'fixtures/markdown/frontmatter/input.md'
    const check = spawnSync(process.execPath, [cliPath, 'check', input, '--json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    const build = spawnSync(
      process.execPath,
      [cliPath, 'build', input, '--out', outputRoot, '--json'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )

    expect(check.status).toBe(0)
    expect(build.status).toBe(0)
    expect(JSON.parse(check.stdout).frontmatter).toMatchObject({
      title: 'Frontmatter fixture',
      draft: false,
    })
    expect(JSON.parse(build.stdout).frontmatter).toEqual(JSON.parse(check.stdout).frontmatter)
    expect(check.stderr).toBe('')
    expect(build.stderr).toBe('')
  })

  it('builds component documents with warning-only diagnostics and exit code zero', () => {
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
    expect(result.stdout).toContain('<article class="hmx-card large" id="hero" title="Q1">')
    expect(result.stdout).toContain('<span class="hmx-badge hmx-badge-info"><em>new</em></span>')
    expect(result.stderr).toContain('warning[HMX2001]: Unknown attribute "bare"')
    expect(result.stderr).toContain('warning[HMX2001]: Unknown attribute "tone"')
    expect(result.stderr).toContain('0 errors, 3 warnings in 1 file')
  })

  it('writes proportional CSS beside HTML and inlines it for stdout builds', () => {
    const outputDirectory = join(outputRoot, 'styled')
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        'build',
        'fixtures/markdown/styled-note/input.md',
        '--out',
        outputDirectory,
        '--trust',
        'app',
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const css = readFileSync(
      join(outputDirectory, 'fixtures/markdown/styled-note/input.css'),
      'utf8',
    )
    const html = readFileSync(
      join(outputDirectory, 'fixtures/markdown/styled-note/input.html'),
      'utf8',
    )
    const stdout = spawnSync(
      process.execPath,
      [cliPath, 'build', 'fixtures/markdown/styled-note/input.md', '--out', '-', '--trust', 'app'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(css).toContain('.hmx-note')
    expect(css).not.toContain('.hmx-grid')
    expect(html).not.toContain('<style>')
    expect(stdout.status).toBe(0)
    expect(stdout.stdout.startsWith('<style>\n:where(:root)')).toBe(true)
    expect(stdout.stdout).toContain('<aside class="hmx-note')
    expect(stdout.stdout).not.toContain('<script')
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
