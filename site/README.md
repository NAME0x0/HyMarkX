# hymarkx.afsah.xyz

The HyMarkX site, written in HyMarkX.

It is **not** a workspace member. It installs `hymarkx` from the registry the way any other user
would, so a broken publish fails here before it reaches anyone else — and the site is a
standing test that the published package actually works.

```sh
npm install
npm run build     # → dist/
npm run dev       # hmx dev, live reload
```

Documents build in `--trust document` by default — the mode a host uses for content it did not
write. `index.hmx` is the exception: it declares an island, islands are `app`-mode only, so it
compiles in a second pass. The exception is one named entry in `build.mjs` rather than a flag on
the whole site, so promoting a page stays a visible decision.

## Layout

| Path | Holds |
|---|---|
| `index.hmx` | The landing page, including the four-step progression demo |
| `components/Shell.hmx` | Every global rule on the site, via `:global(...)` inside `<style scoped>` |
| `components/Nav.hmx` | The header, reused by every page |
| `islands/` | The hero's WebGL field and the host adapter that mounts it |
| `public/` | Static files copied verbatim into `dist/` |
| `build.mjs` | Compile, bundle islands, copy static files |

## The hero island

The field behind the headline is [`@designcodeio/threeui`](https://threeui.com) (MIT, © Meng To)
mounted through a HyMarkX island. HyMarkX emits `<div data-hmx-island="0">` and a manifest; it
never imports or evaluates the module. `build.mjs` bundles the adapter with esbuild and adds the
script tag, because mounting is the host's job (ADR-0016) and a document deliberately cannot ask
for a script (ADR-0020).

It costs **186 kB gzipped**, which the page says out loud rather than hiding.

Two deliberate constraints follow from islands having no server rendering:

- the hero is **decorative only** — the headline, the install command and the links are ordinary
  HTML above it, so the page is complete before any of this loads;
- it is skipped entirely for `prefers-reduced-motion`, and mounted after `load` so it is never
  what a reader waits on.

The package's stylesheet is 57 kB for 109 components and this page uses one class from it, so
the single rule it needs is reproduced in `Shell.hmx` under the package's MIT licence instead.

This needs `hymarkx` **0.0.7 or later**: earlier versions emitted the island placeholder without
a manifest, so there was nothing for the host to mount.

## Why the CSS lives in a component

Page-level `<style>` is rejected in `document` mode, but a component may carry `<style scoped>`,
and `:global(...)` inside it emits unscoped CSS. So `Shell.hmx` is a styles-only component: it
renders nothing and exists to carry the stylesheet. Calling it is what pulls the CSS in.

## Things this site found

Building it surfaced real gaps, each fixed in the language rather than worked around here:

- the document `<head>` could not carry a favicon, Open Graph tags, or a canonical URL
  (ADR-0020);
- `HMX2031` warned about a style block whose every rule was `:global`, which asks for no scope;
- there was no neutral block wrapper, so every layout container had to be a `grid` that then
  emitted `--hmx-grid-columns` it did not use — now `:::box`.
