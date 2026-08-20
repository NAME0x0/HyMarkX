import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * `--fragment` must reproduce what `hmx build` produced before 0.0.4, byte for byte.
 *
 * 0.0.4 changed the default output of `build` from a fragment to a complete document. That is a
 * breaking change with an escape hatch, and an escape hatch nobody has measured is a promise
 * rather than a guarantee. Asserting "it starts with `<h1>` and has no doctype" would have been
 * a weaker claim wearing the same words.
 *
 * The expected files were produced by the **published 0.0.3 CLI**, installed from npm and run
 * against these inputs, then committed. So this compares against what users actually had, not
 * against what this repository believes it used to emit.
 *
 * What this guarantees, precisely: `--fragment` produces a fragment, not a document, and its
 * shape does not drift by accident. It does not freeze rendering forever. When a deliberate
 * rendering change lands, this suite fails, the change is confirmed to be the intended one, and
 * the fixture is regenerated — that failure is the feature.
 *
 * Regenerations so far:
 *
 *   - 2026-08-20: `interactive.expected.html`, when `button` gained its `hmx-button` class. The
 *     only difference was that class; verified by diffing before replacing the file.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const cliPath = resolve(repositoryRoot, 'packages/cli/dist/bin.js')
const fixtures = resolve(repositoryRoot, 'fixtures/fragment-parity')
const outputRoot = mkdtempSync(join(tmpdir(), 'hmx-parity-'))

afterAll(() => {
  rmSync(outputRoot, { recursive: true, force: true })
})

describe('--fragment reproduces pre-0.0.4 output', () => {
  it.each([
    ['rich', [], 'headings, emphasis, code, links, notes, badges, nested grids, a GFM table'],
    ['interactive', ['--trust', 'app'], 'state, an event handler, and an emitted runtime'],
  ])('%s — %s', (name, extraArgs) => {
    const output = join(outputRoot, name)
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        'build',
        join(fixtures, `${name}.hmx`),
        '--out',
        output,
        '--fragment',
        ...extraArgs,
      ],
      { cwd: fixtures, encoding: 'utf8' },
    )

    expect(result.status).toBe(0)

    const produced = readFileSync(join(output, `${name}.html`), 'utf8')
    const expected = readFileSync(join(fixtures, `${name}.expected.html`), 'utf8')

    expect(produced).toBe(expected)
    // The thing that would make this vacuous: a document sneaking through as a "fragment".
    expect(produced).not.toContain('<!doctype')
  })
})
