/**
 * Builds the site.
 *
 * Three steps: compile the documents, bundle whatever islands they declared, copy the static
 * files. `hmx build` does the first and deliberately not the others — the compiler is not a
 * bundler (ADR-0016) and does not copy assets, which is the right split even though it means
 * this file exists.
 *
 * Deliberately not a workspace member: the site installs `hymarkx` from the registry like any
 * other user, so a broken publish fails here before it reaches anyone else.
 */
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as esbuild } from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, 'dist')

/**
 * Documents that declare an island, and therefore must compile in `app` trust.
 *
 * Islands are `app`-mode only, so the landing page cannot build in `document` mode. Rather
 * than promote the whole site, the two are built in separate passes and this list is the
 * exception — kept explicit so that adding an island to a page is a visible decision.
 */
const APP_TRUST = new Set(['index.hmx'])

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

// Resolved rather than shelled out to. The first version ran `npx hmx`, which failed on a
// clean install with no output at all: spawn errors leave `status` null, so the script exited
// 1 in silence. Running the package's own entry point with this Node removes the shell, the
// PATH lookup, and the platform branch in one go.
// `HMX_CLI` points the build at a working copy of the compiler. The site otherwise consumes
// the registry like any other user, which is the point of it — but that also means it cannot
// exercise an unreleased fix, and this site is where those get found.
const cli = process.env.HMX_CLI ?? createRequire(import.meta.url).resolve('hymarkx/bin.js')

function compile(inputs, trust) {
  if (inputs.length === 0) {
    return
  }
  const result = spawnSync(
    process.execPath,
    [cli, 'build', ...inputs, '--out', 'dist', '--trust', trust],
    { cwd: root, stdio: 'inherit' },
  )
  if (result.error !== undefined) {
    console.error(`could not run the HyMarkX CLI: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

/*
 * Empty the directory rather than remove it.
 *
 * `rm -r dist` fails with EBUSY whenever anything holds the directory open — a local preview
 * server, a browser, an editor — which is most of the time while iterating. Deleting the
 * contents works regardless, because only `rmdir` needs the handle released.
 */
await mkdir(out, { recursive: true })
for (const entry of await readdir(out)) {
  await rm(join(out, entry), { recursive: true, force: true })
}

const inputs = await documents()
if (inputs.length === 0) {
  console.error('No .hmx documents found.')
  process.exit(1)
}

// `document` is the default and the mode a host uses for content it did not write. Only pages
// that actually need an island are promoted, and only they carry the cost.
compile(
  inputs.filter((input) => !APP_TRUST.has(input)),
  'document',
)
compile(
  inputs.filter((input) => APP_TRUST.has(input)),
  'app',
)

/** Bundles one entry with esbuild and reports what it cost. */
async function bundle(entry, outfile, label) {
  const built = await esbuild({
    entryPoints: [join(root, entry)],
    outfile: join(out, outfile),
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2022',
    logLevel: 'warning',
    metafile: true,
  })
  const bytes = Object.values(built.metafile.outputs)[0]?.bytes ?? 0
  console.log(`bundled ${label}: ${(bytes / 1024).toFixed(0)} kB minified`)
}

/**
 * The host wires its own runtime in.
 *
 * A document cannot ask for a script — ADR-0020 rejected a `scripts:` frontmatter key
 * deliberately, because a document that can introduce JavaScript is the escape hatch the trust
 * boundary exists to refuse. Mounting islands and adding copy buttons are the host's job
 * (ADR-0016), so the host adds the tags.
 */
async function addScript(page, src) {
  const file = join(out, page)
  const html = await readFile(file, 'utf8')
  await writeFile(file, html.replace('</body>', `<script src="${src}" defer></script>
</body>`), 'utf8')
}

// Enhancement is page-agnostic and cheap, so every page gets it.
await bundle('islands/enhance-entry.js', 'enhance.js', 'enhancement')
for (const input of inputs) {
  await addScript(input.replace(/\.hmx$/, '.html'), '/enhance.js')
}

// Islands are bundled only when a page actually declared one. `hmx build` writes the manifest
// beside the page and removes it when the island goes, so its presence is the whole condition.
if (existsSync(join(out, 'index.islands.json'))) {
  await bundle('islands/mount.js', 'islands.js', 'islands')
  await addScript('index.html', '/islands.js')
}

await cp(join(root, 'public'), out, { recursive: true })
console.log(`built ${inputs.length} document${inputs.length === 1 ? '' : 's'} into dist/`)
