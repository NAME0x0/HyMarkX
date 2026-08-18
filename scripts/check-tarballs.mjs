/**
 * Inspects the packed tarballs the way npm's registry will receive them.
 *
 * `tests/spec/publish-readiness.test.mjs` checks the manifests. This checks the artefact, which
 * is not the same thing: `files`, `.npmignore`, and pnpm's `workspace:` rewriting all sit
 * between a correct manifest and a correct tarball, and only the tarball gets published.
 *
 * Every defect it looks for is one that actually shipped or nearly shipped:
 *
 *   - a tarball carrying 11 kB of `tsconfig.tsbuildinfo` build cache
 *   - packages with no README, so every npm page would have rendered blank
 *   - no licence text in a dual-licensed project
 *   - `workspace:*` reaching the registry, which resolves to nothing
 *   - `private: true` surviving into a package meant to be public
 *
 * Run after `pnpm run release:pack`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const releaseDirectory = `${repositoryRoot}.release`

if (!existsSync(releaseDirectory)) {
  console.error('No .release directory. Run `pnpm run release:pack` first.')
  process.exit(1)
}

const tarballs = readdirSync(releaseDirectory).filter((name) => name.endsWith('.tgz'))
const problems = []

// tar runs from inside `.release` with a bare filename. Handed an absolute Windows path, GNU
// tar reads the drive letter as a remote host and tries to connect to a machine called `D`.
const inRelease = { cwd: releaseDirectory, encoding: 'utf8' }

/** Lists a tarball's entries without unpacking it. */
function entries(tarball) {
  return execFileSync('tar', ['-tzf', tarball], inRelease)
    .trim()
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^package\//, '')
        .replace(/\/$/, ''),
    )
    .filter(Boolean)
}

/** Reads one file out of a tarball. */
function read(tarball, path) {
  return execFileSync('tar', ['-xzOf', tarball, `package/${path}`], inRelease)
}

if (tarballs.length !== 7) {
  problems.push(`expected 7 tarballs, found ${tarballs.length}`)
}

const versions = new Set()

for (const tarball of tarballs) {
  const files = entries(tarball)
  const manifest = JSON.parse(read(tarball, 'package.json'))
  const report = (message) => problems.push(`${manifest.name}: ${message}`)

  versions.add(manifest.version)

  if (manifest.private) {
    report('is marked private and cannot be published')
  }
  if (manifest.publishConfig?.access !== 'public') {
    report('does not set publishConfig.access to public')
  }
  if (!files.includes('README.md')) {
    report('has no README, so its npm page would be blank')
  }
  for (const licence of ['LICENSE-MIT', 'LICENSE-APACHE']) {
    if (!files.includes(licence)) {
      report(`is missing ${licence}`)
    }
  }
  for (const file of files) {
    if (file.endsWith('.tsbuildinfo')) {
      report(`ships build cache: ${file}`)
    }
    if (file.includes('/test/') || file.endsWith('.test.js') || file.endsWith('.test.d.ts')) {
      report(`ships a test file: ${file}`)
    }
  }
  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    if (range.startsWith('workspace:')) {
      report(`dependency ${name} still uses ${range}, which does not resolve on the registry`)
    }
  }

  const main = manifest.exports?.['.']?.import
  if (main && !files.includes(main.replace('./', ''))) {
    report(`entry point ${main} is not in the tarball`)
  }
  for (const command of Object.values(manifest.bin ?? {})) {
    if (!files.includes(command.replace('./', ''))) {
      report(`bin ${command} is not in the tarball`)
    }
  }
}

if (versions.size > 1) {
  problems.push(`tarballs carry different versions: ${[...versions].sort().join(', ')}`)
}

if (problems.length > 0) {
  console.error('Tarball problems:')
  for (const problem of problems) {
    console.error(`- ${problem}`)
  }
  process.exit(1)
}

console.log(`${tarballs.length} tarballs at ${[...versions][0]} are publishable.`)
