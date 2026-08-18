import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The only configuration vitest needs here: a stand-in for the `vscode` module.
 *
 * `vscode` exists only inside the extension host — it is not on npm and cannot be installed.
 * Without an alias, the VS Code extension is code that ships to users and can never be executed
 * by a test, which is how it came to claim completion, hover and formatting in its description
 * while wiring up none of them.
 */
export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./tests/editors/vscode-stub.mjs', import.meta.url)),
      // Stated rather than left to node_modules resolution. The extension sits outside the
      // pnpm workspace on purpose — its manifest `name` is the Marketplace id and collides with
      // the npm installer package — so nothing guarantees a link exists in a fresh clone.
      // Pointing at source also matches every other test here, which runs against `src`.
      '@hymarkx/language-server': fileURLToPath(
        new URL('./packages/language-server/src/index.ts', import.meta.url),
      ),
    },
  },
})
