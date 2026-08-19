import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compile, compileComponents } from '../../packages/compiler/src/index.js'
import { startDevServer } from '../../packages/cli/src/dev.js'

const root = mkdtempSync(join(tmpdir(), 'hmx-dev-'))
let server
let base

beforeAll(async () => {
  mkdirSync(join(root, 'components'))
  writeFileSync(
    join(root, 'components/Card.hmx'),
    '---\nprops:\n  title: { type: string, required: true }\n---\n\n:::note\n## {{ title }}\n\n::children\n:::\n',
  )
  writeFileSync(
    join(root, 'index.hmx'),
    '---\ntitle: Dev Home\n---\n\n# {{ title }}\n\n:::Card{title="Hi"}\nBody\n:::\n',
  )
  writeFileSync(join(root, 'other.md'), '# Other page\n')
  writeFileSync(join(root, 'secret.txt'), 'not a document')

  const cardSource = await readFile(join(root, 'components/Card.hmx'), 'utf8')
  const { registry } = compileComponents([{ name: 'Card', source: cardSource }])
  server = await startDevServer(
    { root, port: 0, trust: 'app' },
    { stderr: { write: () => {} } },
    async (path) => compile(await readFile(path, 'utf8'), { trust: 'app', components: registry }),
  )
  base = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await server?.close()
  rmSync(root, { recursive: true, force: true })
})

describe('hmx dev server', () => {
  it('serves a document at the root and expands its components', async () => {
    const body = await (await fetch(base)).text()

    expect(body).toContain('<h1>Dev Home</h1>')
    expect(body).toContain('hmx-note')
    expect(body).toContain('<style>')
  })

  it.each([
    ['/other', '<h1>Other page</h1>'],
    ['/other/', '<h1>Other page</h1>'],
  ])('resolves %s to a document', async (path, expected) => {
    expect(await (await fetch(base + path)).text()).toContain(expected)
  })

  /**
   * What the dev server shows must be what `hmx build` writes, or the server is previewing a
   * different artefact than the one that ships. It inlines rather than links because there are
   * no sidecar files on disk to point at.
   */
  it('serves a complete document with the reload client inside the body', async () => {
    const body = await (await fetch(base)).text()

    expect(body.startsWith('<!doctype html>')).toBe(true)
    expect(body).toContain('<meta charset="utf-8">')
    expect(body).toContain('<title>')
    expect(body.indexOf('<style>')).toBeLessThan(body.indexOf('</head>'))
    expect(body.indexOf('__hmx/reload')).toBeLessThan(body.indexOf('</body>'))
  })

  it('injects the reload client into every response', async () => {
    for (const path of ['/', '/other', '/missing']) {
      expect(await (await fetch(base + path)).text()).toContain('__hmx/reload')
    }
  })

  it('returns 404 for an unknown document without failing', async () => {
    const response = await fetch(`${base}/missing`)

    expect(response.status).toBe(404)
  })

  it('serves non-document files as static assets', async () => {
    const response = await fetch(`${base}/secret.txt`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('not a document')
  })

  // The dev server compiles local files in app trust mode, so escaping the root would hand
  // out arbitrary files to anything that can reach the port.
  it.each(['/../../../etc/passwd', '/..%2f..%2fpackage.json'])(
    'refuses to serve %s outside the root',
    async (path) => {
      const response = await fetch(base + path)

      expect([403, 404]).toContain(response.status)
      expect(await response.text()).not.toContain('root:')
    },
  )
})
