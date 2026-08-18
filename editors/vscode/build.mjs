/**
 * Bundles the extension and the language server into a single CommonJS file.
 *
 * Bundling is what makes the extension installable at all. The server is an ESM package with a
 * dependency tree reaching micromark and mdast; shipping that tree inside the VSIX would be
 * large, slow to activate, and dependent on npm resolution inside an extension host. One
 * bundled file has none of those problems.
 *
 * `vscode` is external because the extension host provides it at runtime — bundling it would
 * fail, and any copy would be the wrong one.
 *
 *   node editors/vscode/build.mjs [--watch]
 */
import { build, context } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('./', import.meta.url))

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [`${here}src/extension.js`],
  outfile: `${here}dist/extension.js`,
  bundle: true,
  platform: 'node',
  // CommonJS: the `main` entry of a VS Code extension is loaded with require().
  format: 'cjs',
  // Matches the `engines.vscode` floor. VS Code 1.90 ships Node 20.
  target: 'node20',
  external: ['vscode'],
  // The extension is deliberately outside the pnpm workspace: its manifest `name` is the
  // Marketplace extension id, and `hymarkx` is already taken by the npm installer package, so
  // two workspace members would share a name. Nothing needs resolving at runtime anyway —
  // esbuild inlines the server here, so a build-time alias is the whole dependency.
  alias: {
    '@hymarkx/language-server': `${here}../../packages/language-server/dist/index.js`,
  },
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options)
  await ctx.watch()
} else {
  const result = await build(options)
  if (result.errors.length > 0) {
    process.exitCode = 1
  }
}
