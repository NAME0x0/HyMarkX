/**
 * Builds the site.
 *
 * Two steps, and the second exists because `hmx build` compiles documents and does not copy
 * static files — which is the right split, but a site still needs its favicon on disk.
 *
 * Deliberately not a workspace member: the site installs `hymarkx` from the registry like any
 * other user, so a broken publish fails here before it reaches anyone else.
 */
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, 'dist')

/** Every `.hmx` document at the site root, plus anything under `docs/`. */
async function documents() {
  const found = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.hmx')) {
      found.push(entry.name)
    }
  }
  try {
    for (const entry of await readdir(join(root, 'docs'), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.hmx')) {
        found.push(join('docs', entry.name))
      }
    }
  } catch {
    // No docs directory yet.
  }
  return found.sort()
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const inputs = await documents()
if (inputs.length === 0) {
  console.error('No .hmx documents found.')
  process.exit(1)
}

// `--trust document` deliberately: the site demonstrates the mode a host uses for content it
// did not write. Building it in `app` mode would prove nothing about the safe path.
const built = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['hmx', 'build', ...inputs, '--out', 'dist', '--trust', 'document'],
  { cwd: root, stdio: 'inherit' },
)
if (built.status !== 0) {
  process.exit(built.status ?? 1)
}

await cp(join(root, 'public'), out, { recursive: true })
console.log(`built ${inputs.length} document${inputs.length === 1 ? '' : 's'} into dist/`)
