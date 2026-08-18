import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The parts of the publish checklist a test can hold.
 *
 * A publish is one-way: a wrong `files` list ships a package that cannot resolve its own entry
 * point, and the fix is a new version rather than an edit. These assertions are the checks that
 * would otherwise be a human reading six manifests and comparing them by eye, which is exactly
 * the sort of comparison a human does correctly five times and then does not.
 *
 * `private: true` is deliberately *not* asserted either way. It is the intentional block on an
 * accidental pre-alpha release, and removing it is the publish decision itself — see
 * `docs/publishing.md`.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const packagesDirectory = `${repositoryRoot}packages/`

const manifests = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(`${packagesDirectory}${name}/package.json`))
  .map((name) => ({
    name,
    manifest: JSON.parse(readFileSync(`${packagesDirectory}${name}/package.json`, 'utf8')),
  }))

describe('publish readiness', () => {
  it('found every package', () => {
    expect(manifests).toHaveLength(6)
  })

  it.each(manifests.map(({ name }) => name))('%s declares the metadata npm shows', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)

    expect(manifest.name).toBe(`@hymarkx/${name}`)
    expect(manifest.description).toBeTruthy()
    expect(manifest.license).toBe('MIT OR Apache-2.0')
    expect(manifest.type).toBe('module')
    // Scoped packages default to restricted, which fails a publish with a permissions error
    // that reads like an auth problem rather than a configuration one.
    expect(manifest.publishConfig?.access).toBe('public')
  })

  it.each(manifests.map(({ name }) => name))('%s points npm at the right source', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)

    expect(manifest.repository?.url).toContain('github.com/NAME0x0/HyMarkX')
    // Without `directory`, npm links every package at the monorepo root and provenance tooling
    // cannot tell which subtree built the tarball.
    expect(manifest.repository?.directory).toBe(`packages/${name}`)
  })

  it.each(manifests.map(({ name }) => name))('%s ships its build and its README', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)

    expect(manifest.files).toContain('dist')
    // npm renders README.md as the package page. Without it the page is blank, which reads as
    // an abandoned package rather than a pre-release one.
    expect(manifest.files).toContain('README.md')
    expect(existsSync(`${packagesDirectory}${name}/README.md`)).toBe(true)
  })

  it.each(manifests.map(({ name }) => name))('%s resolves types and its entry point', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)
    const main = manifest.exports?.['.']

    expect(main?.import).toMatch(/^\.\/dist\/.+\.js$/)
    expect(main?.types).toMatch(/^\.\/dist\/.+\.d\.ts$/)
  })

  // CI runs Node 22 and 24. Declaring a floor below what is tested would be a guess, and
  // declaring none at all lets an old Node fail with a syntax error instead of a clear warning.
  it.each(manifests.map(({ name }) => name))('%s declares the Node versions CI tests', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)

    expect(manifest.engines?.node).toBe('>=22')
  })

  // The whole point of the CLI package. `hmx` is the binary name users type; the package it
  // installs from is `hymarkx`, because npm's typosquat filter refuses `hmx` as a package name.
  it('the CLI exposes the hmx binary from a file the build produces', () => {
    const { manifest } = manifests.find((entry) => entry.name === 'cli')

    expect(manifest.bin).toEqual({ hmx: './dist/bin.js' })
    expect(existsSync(`${packagesDirectory}cli/src/bin.ts`)).toBe(true)
  })

  /**
   * The licence text has to live inside each package directory, because npm cannot include a
   * file from outside it. Copies drift, so they are compared against the root byte for byte —
   * a package shipping a different licence from the project it belongs to is a legal problem,
   * not a tidiness one.
   */
  it.each(manifests.map(({ name }) => name))('%s ships both licences unmodified', (name) => {
    const { manifest } = manifests.find((entry) => entry.name === name)

    for (const licence of ['LICENSE-MIT', 'LICENSE-APACHE']) {
      expect(manifest.files).toContain(licence)
      expect(readFileSync(`${packagesDirectory}${name}/${licence}`, 'utf8')).toBe(
        readFileSync(`${repositoryRoot}${licence}`, 'utf8'),
      )
    }
  })

  // `tsBuildInfoFile` defaulted into `dist/`, so every tarball carried 11 kB of incremental
  // build cache. Harmless but wrong: it is a build artefact of this repository, not something a
  // consumer has any use for.
  it.each(manifests.map(({ name }) => name))('%s does not ship build cache', (name) => {
    expect(existsSync(`${packagesDirectory}${name}/dist/tsconfig.tsbuildinfo`)).toBe(false)
  })

  it('every package README states the pre-release warning', () => {
    for (const { name } of manifests) {
      const readme = readFileSync(`${packagesDirectory}${name}/README.md`, 'utf8')

      expect(readme).toContain('pre-release')
      expect(readme).toContain('must not')
    }
  })
})
