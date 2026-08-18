/**
 * Packs every publishable package into `.release/`, in dependency order.
 *
 * pnpm does the packing rather than npm because npm cannot resolve the `workspace:*` ranges
 * this monorepo uses — pnpm rewrites them to exact versions as it packs. npm then publishes the
 * finished tarballs, which it accepts as package specs, and handles the security-key 2FA that
 * pnpm's own publish does not implement.
 *
 * See docs/publishing.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const destination = `${repositoryRoot}.release`

// Dependency order, so the publish that follows cannot reference a version not yet on npm.
const packages = ['ast', 'parser', 'compiler', 'formatter', 'language-server', 'cli', 'hymarkx']

const version = JSON.parse(
  readFileSync(`${repositoryRoot}packages/cli/package.json`, 'utf8'),
).version

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })

// `pnpm.cmd` rather than `shell: true`: passing args through a shell concatenates rather than
// escapes them, which Node now warns about, and the destination path can contain spaces.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

for (const name of packages) {
  execFileSync(pnpm, ['pack', '--pack-destination', destination], {
    cwd: `${repositoryRoot}packages/${name}`,
    stdio: 'pipe',
  })
  console.log(`packed ${name}`)
}

console.log(`\n${packages.length} tarballs at ${version} in .release/`)
console.log('Publish from a real terminal: ./scripts/publish.ps1')
