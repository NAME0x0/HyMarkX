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

Everything is built in `--trust document`, the mode a host uses for content it did not write.
Building in `app` mode would prove nothing about the safe path.

## Layout

| Path | Holds |
|---|---|
| `index.hmx` | The landing page, including the four-step progression demo |
| `components/Shell.hmx` | Every global rule on the site, via `:global(...)` inside `<style scoped>` |
| `components/Nav.hmx` | The header, reused by every page |
| `public/` | Static files copied verbatim into `dist/` |
| `build.mjs` | `hmx build` over every document, then the copy step |

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
