import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCli } from '../../packages/cli/src/index.js'
import { compile } from '../../packages/compiler/src/index.js'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

function expectBlocked(source, code, forbidden) {
  const result = compile(source)

  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code)
  expect(result.html.toLowerCase()).not.toContain(forbidden.toLowerCase())
}

describe('document trust mode', () => {
  it('escapes text positions', () => {
    const result = compile('\\<script>alert("x")\\</script>')

    expect(result.html).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>\n')
    expect(result.html).not.toContain('<script>')
  })

  it('drops javascript links', () => {
    expectBlocked('[click](javascript:alert(1))', 'HMX3003', 'javascript:')
  })

  it('drops javascript image sources', () => {
    expectBlocked('![x](javascript:alert(1))', 'HMX3003', 'javascript:')
  })

  it('drops entity-obfuscated URL schemes', () => {
    expectBlocked('<a href="javascript&#x3A;alert(1)">x</a>', 'HMX3003', 'javascript')
  })

  it('drops tab-obfuscated URL schemes', () => {
    expectBlocked('<img src="java\tscript:alert(1)">', 'HMX3003', 'java')
  })

  it('rejects prohibited raw HTML elements', () => {
    expectBlocked('<script>alert(1)</script>', 'HMX3001', '<script')
    expectBlocked('<style>body{display:none}</style>', 'HMX3001', '<style')
  })

  it('rejects raw event-handler attributes', () => {
    expectBlocked('<img src="safe.png" onerror="alert(1)">', 'HMX3002', 'onerror')
  })

  it('drops data URLs from images', () => {
    expectBlocked('![x](data:text/html;base64,PHNjcmlwdD4=)', 'HMX3003', 'data:')
  })

  it('removes elements and attributes outside the allowlist', () => {
    const result = compile('<svg data-secret="x"><circle></circle></svg>')

    expect(result.html).not.toContain('<svg')
    expect(result.html).not.toContain('<circle')
    expect(result.html).not.toContain('data-secret')
  })

  it('removes disallowed attributes from allowed raw elements', () => {
    const result = compile('<p data-secret="x">safe</p>')

    expect(result.html).toBe('<p>safe</p>\n')
    expect(result.html).not.toContain('data-secret')
  })

  it('escapes allowed raw-HTML attribute values', () => {
    const result = compile('<a title="&quot;&gt;&lt;img src=x&gt;">safe</a>')

    expect(result.html).not.toContain('<img src=x>')
    expect(result.html).toContain('title="&amp;quot;&amp;gt;&amp;lt;img src=x&amp;gt;"')
  })

  it('escapes generated Markdown attribute values', () => {
    const result = compile('[safe](/path "&quot; onmouseover=&quot;alert(1)")')

    expect(result.html).toContain('title="&quot; onmouseover=&quot;alert(1)"')
    expect(result.html).not.toContain(' onmouseover="')
  })

  it('does not allow document content to escalate trust', () => {
    expectBlocked('<!-- trust: app -->\n<script>alert(1)</script>', 'HMX3001', '<script')
  })

  it('passes trusted raw HTML and schemes only when the host selects app mode', () => {
    const result = compile('<script>alert(1)</script>\n\n[x](javascript:alert(1))', {
      trust: 'app',
    })

    expect(result.diagnostics).toEqual([])
    expect(result.html).toContain('<script>alert(1)</script>')
    expect(result.html).toContain('href="javascript:alert(1)"')
  })
})

describe('frontmatter security', () => {
  it('rejects billion-laughs expansion with HMX2021 in under two seconds', () => {
    const source = `---
a: &a [lol, lol, lol, lol, lol, lol, lol, lol, lol]
b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]
c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]
---`
    const started = performance.now()
    const result = compile(source)
    const elapsed = performance.now() - started

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2021'])
    expect(elapsed).toBeLessThan(2_000)
  })

  it('does not construct values from language-specific tags', () => {
    const result = compile('---\npayload: !!js/function function () {}\n---')

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX2021'])
    expect(result.frontmatter).toBeUndefined()
  })

  it('rejects forbidden keys and leaves Object.prototype unpolluted', () => {
    const result = compile(
      '---\n__proto__: polluted\nconstructor: polluted\nprototype: polluted\n---',
    )

    expect(result.diagnostics.map(({ code }) => code)).toEqual(['HMX3007', 'HMX3007', 'HMX3007'])
    expect(result.frontmatter).toEqual({})
    expect(Object.getPrototypeOf(result.frontmatter)).toBeNull()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })
})

describe('CLI path confinement', () => {
  it('rejects an input-relative output path that escapes --out', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'hmx-security-'))
    temporaryDirectories.push(cwd)
    const stdout = []
    const stderr = []
    const exitCode = await runCli(['build', '../outside.md', '--out', 'dist', '--json'], {
      cwd,
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
      color: false,
    })
    const payload = JSON.parse(stdout.join(''))

    expect(exitCode).toBe(1)
    expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toContain('HMX3006')
    expect(stderr).toEqual([])
  })

  it('rejects an explicit component path outside the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'hmx-security-'))
    temporaryDirectories.push(cwd)
    await writeFile(
      join(cwd, 'input.hmx'),
      [
        '---',
        'components:',
        '  Outside: ../outside/Outside.hmx',
        '---',
        ':::Outside',
        ':::',
        '',
      ].join('\n'),
    )
    const stdout = []
    const stderr = []
    const exitCode = await runCli(['check', 'input.hmx', '--json'], {
      cwd,
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
      color: false,
    })
    const payload = JSON.parse(stdout.join(''))

    expect(exitCode).toBe(1)
    expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toContain('HMX3006')
    expect(
      payload.diagnostics.find((diagnostic) => diagnostic.code === 'HMX3006').message,
    ).toContain('Outside.hmx')
    expect(stderr).toEqual([])
  })

  it('rejects a discovered component directory whose real path escapes the project root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'hmx-security-'))
    const outside = await mkdtemp(join(tmpdir(), 'hmx-component-outside-'))
    temporaryDirectories.push(cwd, outside)
    await writeFile(join(cwd, 'input.hmx'), ':::Card\n:::\n')
    await writeFile(join(outside, 'Card.hmx'), '# Outside\n')
    await symlink(
      outside,
      join(cwd, 'components'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const stdout = []
    const stderr = []
    const exitCode = await runCli(['check', 'input.hmx', '--json'], {
      cwd,
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
      color: false,
    })
    const payload = JSON.parse(stdout.join(''))

    expect(exitCode).toBe(1)
    expect(payload.diagnostics.map((diagnostic) => diagnostic.code)).toContain('HMX3006')
    expect(stderr).toEqual([])
  })
})
