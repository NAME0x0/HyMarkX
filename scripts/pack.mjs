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

/**
 * Runs `pnpm pack` without going through a shell.
 *
 * `shell: true` would concatenate rather than escape the arguments — Node warns about it, and
 * the destination path can contain spaces. But naming the executable directly is its own trap:
 * on Windows pnpm is `pnpm.cmd` under PowerShell and a extensionless shell script under Git
 * Bash, so hardcoding either breaks the other.
 *
 * `npm_execpath` is set by pnpm when this runs as `pnpm run release:pack`, and points at
 * pnpm's own JavaScript entry point — running that with the current Node needs no shell and no
 * guess about file extensions. The candidate list is the fallback for a bare
 * `node scripts/pack.mjs`.
 */
function pack(cwd) {
  const options = { cwd, stdio: 'pipe' }
  const args = ['pack', '--pack-destination', destination]
  const execPath = process.env.npm_execpath

  if (execPath && /\.(?:c?js)$/.test(execPath)) {
    execFileSync(process.execPath, [execPath, ...args], options)
    return
  }

  for (const candidate of ['pnpm', 'pnpm.cmd']) {
    try {
      execFileSync(candidate, args, options)
      return
    } catch {
      // Try the next spelling.
    }
  }

  // Neither spelling is spawnable without a shell on Windows: under Git Bash `pnpm` is an
  // extensionless shell script, and Node refuses to spawn `pnpm.cmd` directly (EINVAL) as a
  // deliberate guard against command injection through `.cmd` files. Running through pnpm sets
  // `npm_execpath` and sidesteps both.
  throw new Error('Run this through pnpm so it can locate itself:\n\n  pnpm run release:pack\n')
}

for (const name of packages) {
  pack(`${repositoryRoot}packages/${name}`)
  console.log(`packed ${name}`)
}

console.log(`\n${packages.length} tarballs at ${version} in .release/`)
console.log('Publish from a real terminal: ./scripts/publish.ps1')
