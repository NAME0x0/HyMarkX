import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  it('discovers and expands an authored component twice with one copy of its CSS', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-discovery-'))
    mkdirSync(join(project, 'components'))
    writeFileSync(
      join(project, 'components/Card.hmx'),
      [
        '---',
        'props:',
        '  title: { type: string, required: true }',
        '---',
        '<style scoped>',
        'h2 { color: rebeccapurple; }',
        '</style>',
        '',
        '## {{ title }}',
        '',
        '::children',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(project, 'index.hmx'),
      [
        ':::Card{title="First"}',
        'Alpha',
        ':::',
        '',
        ':::Card{title="Second"}',
        'Beta',
        ':::',
        '',
      ].join('\n'),
    )

    const result = spawnSync(
      process.execPath,
      [cliPath, 'build', 'index.hmx', '--out', 'dist', '--trust', 'app'],
      { cwd: project, encoding: 'utf8' },
    )
    const html = readFileSync(join(project, 'dist/index.html'), 'utf8')
    const css = readFileSync(join(project, 'dist/index.css'), 'utf8')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('0 errors, 0 warnings in 1 file\n')
    expect(html).toMatch(/<h2 data-hmx-s-[a-f0-9-]+ title="First">First<\/h2>/)
    expect(html).toMatch(/<h2 data-hmx-s-[a-f0-9-]+ title="Second">Second<\/h2>/)
    expect(html).toContain('<p>Alpha</p>')
    expect(html).toContain('<p>Beta</p>')
    expect(css.match(/color: rebeccapurple/g)).toHaveLength(1)
    expect(`${html}${css}`).not.toContain('<script')
  })

  it('discovers components next to a document that lives outside the working directory', () => {
    // Component discovery was rooted at the process cwd, so building an absolute path from
    // elsewhere reported HMX3006 traversal instead of finding the sibling components/ dir.
    const project = mkdtempSync(join(outputRoot, 'authored-outside-cwd-'))
    mkdirSync(join(project, 'components'))
    writeFileSync(
      join(project, 'components/Card.hmx'),
      '---\nprops:\n  title: { type: string, required: true }\n---\n\n## {{ title }}\n\n::children\n',
    )
    writeFileSync(join(project, 'index.hmx'), ':::Card{title="Revenue"}\nBody\n:::\n')

    const result = spawnSync(
      process.execPath,
      [cliPath, 'build', join(project, 'index.hmx'), '--out', '-', '--trust', 'app'],
      { cwd: outputRoot, encoding: 'utf8' },
    )

    expect(result.stderr).not.toContain('HMX3006')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Revenue')
    expect(result.stdout).toContain('<p>Body</p>')
  })

  it('loads a frontmatter component path relative to the input document', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-explicit-'))
    mkdirSync(join(project, 'components'))
    mkdirSync(join(project, 'shared'))
    writeFileSync(join(project, 'components/Banner.hmx'), '## Convention\n')
    writeFileSync(
      join(project, 'shared/Banner.hmx'),
      [
        '---',
        'props:',
        '  message: { type: string, required: true }',
        '---',
        '## {{ message }}',
        '',
        '::children',
        '',
      ].join('\n'),
    )
    writeFileSync(
      join(project, 'index.hmx'),
      [
        '---',
        'components:',
        '  Banner: ./shared/Banner.hmx',
        '---',
        ':::Banner{message="Mapped"}',
        'Explicit child',
        ':::',
        '',
      ].join('\n'),
    )

    const result = spawnSync(process.execPath, [cliPath, 'build', 'index.hmx', '--out', 'dist'], {
      cwd: project,
      encoding: 'utf8',
    })
    const html = readFileSync(join(project, 'dist/index.html'), 'utf8')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('0 errors, 0 warnings in 1 file\n')
    expect(html).toContain('<h2>Mapped</h2>')
    expect(html).toContain('<p>Explicit child</p>')
    expect(html).not.toContain('Convention')
  })

  it('prefers components next to a nested input over project-root components', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-local-'))
    mkdirSync(join(project, 'components'))
    mkdirSync(join(project, 'pages/components'), { recursive: true })
    writeFileSync(join(project, 'components/Card.hmx'), '## Project root\n')
    writeFileSync(join(project, 'pages/components/Card.hmx'), '## Input local\n')
    writeFileSync(join(project, 'pages/index.hmx'), ':::Card\n:::\n')

    const result = spawnSync(
      process.execPath,
      [cliPath, 'build', 'pages/index.hmx', '--out', 'dist'],
      { cwd: project, encoding: 'utf8' },
    )
    const html = readFileSync(join(project, 'dist/pages/index.html'), 'utf8')

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('0 errors, 0 warnings in 1 file\n')
    expect(html).toContain('<h2>Input local</h2>')
    expect(html).not.toContain('Project root')
  })

  it('reports HMX5004 for a missing explicit component path', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-missing-'))
    writeFileSync(
      join(project, 'index.hmx'),
      [
        '---',
        'components:',
        '  Missing: ./absent/Missing.hmx',
        '---',
        ':::Missing',
        ':::',
        '',
      ].join('\n'),
    )

    const result = spawnSync(process.execPath, [cliPath, 'check', 'index.hmx', '--json'], {
      cwd: project,
      encoding: 'utf8',
    })
    const payload = JSON.parse(result.stdout)

    expect(result.status).toBe(2)
    expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['HMX5004'])
    expect(payload.diagnostics[0].message).toContain('absent')
    expect(payload.diagnostics[0].message).toContain('Missing.hmx')
  })

  it('renders authored-component diagnostics against the component source path', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-diagnostic-'))
    mkdirSync(join(project, 'components'))
    writeFileSync(
      join(project, 'components/Bad.hmx'),
      ['---', 'props:', '  value: { type: unsupported }', '---', '# Bad', ''].join('\n'),
    )
    writeFileSync(join(project, 'index.hmx'), ':::Bad\n:::\n')

    const result = spawnSync(process.execPath, [cliPath, 'check', 'index.hmx'], {
      cwd: project,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('error[HMX2051]')
    expect(result.stderr).toContain('Bad.hmx:2:1')
    expect(result.stderr).toContain('props:')
  })

  it('includes authored-component paths in JSON diagnostics', () => {
    const project = mkdtempSync(join(outputRoot, 'authored-json-diagnostic-'))
    mkdirSync(join(project, 'components'))
    writeFileSync(join(project, 'components/Bad.hmx'), '{{ missing }}\n')
    writeFileSync(join(project, 'index.hmx'), ':::Bad\n:::\n')

    const result = spawnSync(process.execPath, [cliPath, 'check', 'index.hmx', '--json'], {
      cwd: project,
      encoding: 'utf8',
    })
    const payload = JSON.parse(result.stdout)

    expect(result.status).toBe(1)
    expect(payload.diagnostics).toHaveLength(1)
    expect(payload.diagnostics[0].code).toBe('HMX2040')
    expect(payload.diagnostics[0].from.replaceAll('\\', '/')).toBe('components/Bad.hmx')
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
