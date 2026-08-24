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
write. Three pages are exceptions: `index.hmx` and `play.hmx` declare islands, which are
`app`-mode only, and `gallery.hmx` runs a live counter. They compile in a second pass. The
exceptions are named entries in `build.mjs` rather than a flag on the whole site, so promoting a
page stays a visible decision — and `docs.hmx`, which is the largest page here, still ships zero
JavaScript.

## Layout

| Path | Holds |
|---|---|
| `index.hmx` | The landing page, including the four-step progression demo |
| `docs.hmx` | The whole documentation, in `document` trust |
| `gallery.hmx` | Every built-in component rendered beside its source |
| `play.hmx` | The playground, which runs the real compiler in the reader's browser |
| `components/Shell.hmx` | Every global rule on the site, via `:global(...)` inside `<style scoped>` |
| `components/Nav.hmx` | The header, reused by every page |
| `islands/` | The hero's WebGL gradient and the host adapter that mounts it |
| `public/` | Static files copied verbatim into `dist/` |
| `build.mjs` | Compile, bundle islands, copy static files |

## Typography

Two faces, one job each. **Geist** sets everything a reader works through — prose, navigation,
labels, subheadings. **Instrument Serif** sets `h1` and `h2` only: a high-contrast serif says
"document format" faster than the copy does, and every other developer tool on the internet is a
grotesque on a dark background.

Both are self-hosted and subset to Latin. Neither is linked from a font CDN — a page arguing
about what it costs a reader should not open a third-party connection to draw its own headline.

| File | From | Licence | Size |
|---|---|---|---|
| `public/fonts/geist-latin.woff2` | `geist@1.7.2` | SIL OFL 1.1 | 25 kB |
| `public/fonts/instrument-serif-latin.woff2` | `@fontsource/instrument-serif@5.3.0` | SIL OFL 1.1 (`instrument-serif-OFL.txt`) | 14 kB |

The serif was subset from the 21 kB Latin file the package ships:

```sh
pyftsubset instrument-serif-latin-400-normal.woff2 \
  --output-file=instrument-serif-latin.woff2 --flavor=woff2 \
  --layout-features='kern,liga,clig,calt' \
  --unicodes="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2010-2015,U+2018-201D,U+2026"
```

Its 14 kB is on the landing page's cost strip, next to the hero's 15 kB.

## The hero island

The gradient behind the headline is React Bits' `Grainient` shader (MIT, © React Bits), ported
to a plain module on [`ogl`](https://github.com/oframe/ogl) and mounted through a HyMarkX
island. HyMarkX emits `<div data-hmx-island="0">` and a manifest; it never imports or evaluates
the module. `build.mjs` bundles the adapter with esbuild and adds the script tag, because
mounting is the host's job (ADR-0016) and a document deliberately cannot ask for a script
(ADR-0020).

It costs **15 kB gzipped**, which the page says out loud rather than hiding.

It started at 186 kB — a three.js shader mounted by React. Two things were wrong with that:
three unpacks to 23 MB against ogl's 423 kB, and React was 60 kB of the bundle purely to render
one decorative `<div>`. An island export here is a plain function that takes an element, so the
site ships no framework at all.

Three deliberate constraints follow from islands having no server rendering:

- the hero is **decorative only** — the headline, the install command and the links are ordinary
  HTML above it, so the page is complete before any of this loads;
- it is skipped entirely for `prefers-reduced-motion`, and mounted after `load` so it is never
  what a reader waits on;
- it stops animating when scrolled offscreen or the tab is hidden.

This needs `hymarkx` **0.0.7 or later** for island manifests, and **0.0.8 or later** for
`box{as=}` page landmarks.

## Things this site found

Building it surfaced real gaps, each fixed in the language rather than worked around here:

- the document `<head>` could not carry a favicon, Open Graph tags, or a canonical URL
  (ADR-0020);
- `HMX2031` warned about a style block whose every rule was `:global`, which asks for no scope;
- there was no neutral block wrapper, so every layout container had to be a `grid` that then
  emitted `--hmx-grid-columns` it did not use — now `:::box`;
- `hmx build` wrote island placeholders with no manifest, so nothing could mount them;
- every wrapper was a `div` because `box` could emit nothing else — now `box{as=}`.
