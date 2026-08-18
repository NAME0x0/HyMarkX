import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every relative link between the project's Markdown files points at a file that exists.
 *
 * The documentation is heavily cross-referenced — SPEC to ADRs, ROADMAP to research, README to
 * everything — and a link that silently rots is how a reader concludes a document was never
 * written rather than moved. Cheap to check, so it is checked.
 *
 * External links are not fetched: a network call in the test suite trades a real guarantee for
 * an intermittent failure whenever somebody else's site is down.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Removes fenced blocks and inline code before scanning.
 *
 * Without this the scan reports `[x](javascript:…)` from SECURITY.md's threat table and
 * `[label](url)` from syntax examples — link-shaped text that documents a link rather than
 * being one. Every false positive found on the first run was of exactly that kind.
 */
function prose(markdown) {
  return markdown.replaceAll(/^```[\s\S]*?^```/gm, '').replaceAll(/`[^`\n]*`/g, '')
}

function markdownFiles() {
  return (
    execFileSync('git', ['ls-files', '*.md'], { cwd: repositoryRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      // `fixtures/` holds parser inputs, not documentation. `![alt](empty.png)` in a CommonMark
      // fixture is testing image syntax; the file it names is not supposed to exist.
      .filter((path) => !path.startsWith('fixtures/'))
  )
}

const files = markdownFiles()
const links = []
for (const file of files) {
  const source = prose(readFileSync(`${repositoryRoot}${file}`, 'utf8'))
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    if (/^(?:https?:|mailto:|#)/.test(target)) {
      continue
    }
    const [path] = target.split('#')
    if (path) {
      links.push({ file, target, path })
    }
  }
}

describe('documentation links', () => {
  it('found links to check', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(links.length).toBeGreaterThan(30)
  })

  it('every relative link resolves to a file that exists', () => {
    const broken = links
      .filter(({ file, path }) => {
        const resolved = resolve(repositoryRoot, dirname(file), decodeURIComponent(path))
        return !existsSync(resolved)
      })
      .map(({ file, target }) => `${file} -> ${target}`)

    expect(broken).toEqual([])
  })
})
