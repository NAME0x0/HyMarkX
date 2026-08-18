# Publishing

What 0.1 needs, split by who can do it. Everything a test can hold is held by
`tests/spec/publish-readiness.test.mjs`; the rest is here because it needs a person with
credentials and a decision.

A publish is one-way. npm allows unpublish only within 72 hours and only if nothing depends on
the package, so the fix for a wrong tarball is a new version, not an edit.

## Verified by the test suite

These are asserted for all six packages on every run, so they cannot rot between now and the
publish:

| Check | Why it is checked |
|---|---|
| `publishConfig.access` is `public` | Scoped packages default to restricted, and the failure reads like an auth problem |
| `exports["."]` resolves both `types` and `import` under `dist/` | A wrong entry point ships a package that cannot import itself |
| `files` includes `dist`, `README.md`, and both licences | npm renders README as the package page; a blank page reads as abandoned |
| Licence copies are byte-identical to the root ones | npm cannot include a file from outside the package, so copies exist and copies drift |
| `dist/` contains no `tsconfig.tsbuildinfo` | It defaulted there, and every tarball carried 11 kB of build cache |
| `repository.directory` names the subtree | Otherwise npm links every package at the monorepo root |
| `engines.node` is `>=22` | What CI actually tests. A lower floor would be a guess |
| The CLI's `bin` is `{ hmx: "./dist/bin.js" }` | The binary users type |
| Every README carries the pre-release warning | See below — this is the one that matters most |

## Requires a decision, and a person

### 1. Remove `"private": true` from all six manifests

It exists to make an accidental `npm publish` impossible during pre-alpha, and removing it *is*
the publish decision. The readiness test deliberately does not assert it in either direction,
so it will not fight the change.

### 2. Set the version

All six sit at `0.0.0`. They version together — the packages are meaningless apart, and a
consumer reasoning about which compiler goes with which parser should not have to consult a
table.

### 3. Publish in dependency order

`ast` → `parser` → `compiler` → `formatter` → `language-server` → `cli`. pnpm rewrites
`workspace:*` to the published version during packing, so a dependency published out of order
resolves to a version that does not exist yet.

```sh
pnpm build && pnpm check          # never publish an unverified tree
pnpm -r --filter "@hymarkx/*" publish --access public
```

### 4. Replace the `hymarkx` placeholder on npm

`hymarkx@0.0.1` is currently a placeholder holding the name. The CLI package is
`@hymarkx/cli`, but the name users install is `hymarkx`, which installs the `hmx` binary.

**`hmx` itself is not obtainable.** npm's typosquat filter rejects it as too similar to
existing packages (`h3`, `he`, `htm`, `has`, `hbs`, `pm2`, `sax`, `rx`, `rax`, `mz`). This is
not a naming preference that can be argued with — the registry refuses the publish. The binary
name is independent of the package name, so `npm install hymarkx` giving you `hmx` is the
outcome either way.

### 5. Decide what the pre-release warning says

Every package README currently states that HyMarkX is pre-release, that the syntax may change
without a migration path, and that it **must not be used to render untrusted content in
production**. `SECURITY.md` says the same.

That last sentence is the one to think hardest about before publishing. It is currently true:
one pass of fuzzing found a live denial of service, the security audit records two threats with
no test behind them, and there has been no external review. Publishing does not change any of
that, but it does put the software in front of people who will not read `SECURITY.md`. Keep the
warning in the README where npm renders it, not only in a file nobody clicks.

## After publishing

- Tag the commit and push the tag.
- Verify the published tarball rather than trusting the dry run: `npm pack @hymarkx/cli` from a
  clean directory, unpack it, and check that `dist/bin.js` runs.
- Install into a scratch project on Node 22 and run `hmx build` on a real document. The
  workspace resolves `@hymarkx/*` locally, so a broken published dependency graph is invisible
  from inside this repository.

## The VS Code extension

Published to a different marketplace, by a different tool, under a different identity from the
npm packages. None of the npm setup carries over.

### What it needs from you

**A Microsoft account you will still control in ten years.** The Marketplace runs on Azure
DevOps, and the same account has to own the Azure DevOps organisation, the token, and the
publisher. Avoid a work or university account: if you lose that tenant you lose the publisher,
and **the publisher ID can never be changed once created.**

1. Create an Azure DevOps organisation if you have none.
2. User settings → Personal access tokens → New Token.
   - **Organization: All accessible organizations.** Scoped to a single organisation the token
     fails in a way that reads like a permissions bug.
   - Scopes: Custom defined → Show all scopes → **Marketplace → Manage**.
3. Create the publisher at the Marketplace publisher management page, logged in with that same
   account. The publisher is **`name0x0`**, not `hymarkx`.

   A publisher is an account that can hold many extensions, not a project page — so it is named
   after the person who signs the releases rather than after one of them. That keeps it coherent
   with the personal Microsoft account, the personal domain used for verification, and the
   LinkedIn and Twitter links on the profile, and it means anything published later sits under
   the same identity instead of under a project it has nothing to do with. Users still see the
   extension titled *HyMarkX*; the publisher id only appears in `name0x0.hymarkx`.
4. `npx @vscode/vsce login name0x0`, then `pnpm --dir editors/vscode publish`.

**Personal access tokens retire on 1 December 2026.** Microsoft's replacement for automated
publishing is Entra ID with workload identity federation. A manual publish with a PAT works
until then; do not build a pipeline on one.

### What it needs from the repository

`pnpm build:extension` bundles the extension and the language server into a single CommonJS
file with esbuild. That bundle is the whole reason the extension is installable: it previously
resolved its server at a path *inside this monorepo*, which worked from a checkout and would
have failed for every real user.

CI builds and packages the extension on every run, because the bundle inlines the language
server — a change there can break the extension without touching anything the other suites
cover.

### Two traps

- **vsce rejects SVG images in README.md** unless they come from a trusted badge provider. The
  extension has its own README for this reason; the root one embeds `assets/evolution.svg` and
  `assets/dependency-graph.svg` and would be refused after all the account setup is done.
- **The extension is deliberately not a pnpm workspace member.** Its manifest `name` is the
  Marketplace extension id, and `hymarkx` is already the npm installer package, so including it
  would put two packages with one name in the workspace. esbuild resolves the server through a
  build-time alias instead, and `vitest.config.mjs` states the same alias for tests.
