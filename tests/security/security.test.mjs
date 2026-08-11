import { mkdtemp, rm } from 'node:fs/promises'
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
})
