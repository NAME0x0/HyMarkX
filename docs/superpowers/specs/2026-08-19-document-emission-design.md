# Document emission — design

**Date:** 2026-08-19 · **Status:** approved, not yet implemented · **Ships as:** 0.0.4

## The problem

`hmx build` produces an HTML *fragment*. A document compiles to `<h1>Dashboard</h1>…` with no
`<!doctype>`, no `<html>`, no `<head>`. `hmx dev` does no better: it concatenates
`<style>` + fragment + `<script>` and serves that.

So a page built with HyMarkX today has:

- no `<title>` — the browser tab shows the URL
- no charset declaration — the same failure mode that produced mojibake in this repository's own
  SVGs, twice
- no viewport meta — unusable on a phone
- no `lang` attribute — a screen reader guesses the language

For a language whose stated purpose is documents that grow into **websites**, that is a gap in
the middle of the pitch. It was found by starting to build the project's own site: the first
question was "where does `<title>` come from" and there was no answer.

**Phase 2 anticipated this.** `title`, `description`, `layout`, `lang` and `draft` are already
reserved frontmatter keys with declared types and validation (`HMX2022`). Nothing consumes any
of them. This design finishes what was started rather than inventing anything.

## Decision

`compile()` does not change. It keeps returning `html`, `css` and `js` separately, because
embedding a fragment in a host page is a legitimate and common use, and because the
parser → compiler → emitter boundary should not acquire a "sometimes it's a whole page" mode.

Document assembly becomes a separate exported function:

```ts
renderDocument(result: CompileResult, options?: DocumentOptions): string
```

### The shell

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<meta name="description" content="…">
<link rel="stylesheet" href="index.css">
</head>
<body>
…fragment…
<script src="index.js"></script>
</body>
</html>
```

Minimal on purpose. No Open Graph tags, no favicon link, no generator meta. Each of those is a
defensible addition and none of them is needed to make a page valid; adding them now would be
guessing at requirements the site has not yet produced.

### Where each value comes from

| Slot | Source | When missing |
|---|---|---|
| `lang` | frontmatter `lang` | `en` |
| `<title>` | frontmatter `title` | first heading's text; then the input filename |
| `description` | frontmatter `description` | the whole `<meta>` is omitted, never emitted empty |
| stylesheet link | the CSS the compile produced | omitted when the CSS is empty |
| script tag | the JS the compile produced | omitted when the JS is empty |

`<title>` is required by HTML5, so it always appears. Falling back through heading and filename
is better than emitting a valid-but-useless empty title, and much better than emitting an invalid
document.

The CSS and JS references follow the rule the sidecar writer already follows: no file, no
reference. A static page links no stylesheet it does not have and loads no script that does not
exist.

`layout` and `draft` stay reserved and unimplemented. A layout system does not exist, and
`draft` is a site-generator concern with no obvious single meaning (skip the page? mark it?).
Claiming them here would be inventing semantics to fill a table.

### CLI

`hmx build` emits a document by default. `--fragment` restores today's behaviour.

This is a breaking change to the default output of the only command most users run, so it ships
as **0.0.4** and is stated plainly in the release notes rather than buried. It is the right
default: the command is called `build`, and what it built until now could not be opened in a
browser without someone hand-writing a shell around it.

`hmx dev` serves the same document, so what you see while writing is what gets built. It keeps
inlining the CSS and JS it already inlines — the dev server has no sidecar files to link — and
keeps appending its live-reload client inside the body.

`--out -` writes the document to stdout. With no files on disk to reference, that mode inlines
the CSS and JS rather than linking them, so a piped page is self-contained.

Stylesheet and script hrefs are bare filenames, not paths. The CLI already writes each sidecar
beside its HTML and preserves the input's relative directory under `--out`, so `index.css` next
to `index.html` resolves correctly at any depth without the emitter knowing where it sits.

## Security

This is the part that would be got wrong by rushing. Frontmatter is document-controlled data,
and this design routes it into three positions it has never reached before:

| Position | Risk |
|---|---|
| `<title>` text | `</title><script>alert(1)</script>` breaking out of the element |
| `<meta content="…">` | quote-breaking out of the attribute |
| `<html lang="…">` | attribute injection |

Text and attribute escaping already exist in the emitter and must be applied here — this is
threat **T1** and **T3** surface, not new machinery. `lang` additionally gets validated against
a BCP-47 shape (letters, digits and hyphens, bounded length) and falls back to `en` when it does
not match, because a language tag is a constrained vocabulary rather than free text and
validating is cheaper than trusting the escaper.

A rejected `lang` reports **`HMX2023`**, severity **warning** — it sits next to the existing
frontmatter codes `HMX2020`–`HMX2022`, and it is a warning rather than an error because the
document still renders correctly with the `en` fallback. Registered in `SPEC.md` Appendix B,
which `tests/spec/diagnostic-codes.test.mjs` enforces in both directions.

`docs/security-audit.md` gains these positions under T1 and T3, with the tests that cover them.

## Testing

Every one of these must fail if the behaviour it covers is removed:

- **Structure** — doctype first, `<html>` wrapping `<head>` then `<body>`, fragment inside body.
- **Title resolution** — from frontmatter; from the first heading when frontmatter has none;
  from the filename when there is no heading; always present.
- **Description** — emitted when present, the entire `<meta>` absent when not.
- **Lang** — default `en`; a valid tag passes through; an invalid one falls back and reports.
- **Escaping** — a `title`, `description` and `lang` each containing markup and quotes cannot
  break out of their position. These are the security tests.
- **Asset references** — CSS present links, CSS empty omits; same for JS.
- **`--fragment`** — byte-identical to 0.0.3 output, so the escape hatch is real.
- **Conformance untouched** — the CommonMark and GFM suites compare fragments and must not
  move. 652/652 and 40/40.

## What this does not do

- No layouts, no partials, no navigation. The site will hand-write those as authored components,
  which is the existing mechanism and is enough to find out whether it is sufficient.
- No `<head>` extensibility — a document cannot add arbitrary tags. If the site needs one, that
  requirement will arrive with evidence attached.
- No Open Graph or Twitter card tags, no favicon link, no canonical URL, no generator meta. All
  are defensible and none is needed for a valid page. The site will say which of them it
  actually wants, and that is a better basis than guessing now.
- No multi-page awareness: no sitemap, no cross-page links, no collections. Out of scope.

## Why this is worth doing before the site

The site was going to wrap fragments in a hand-written shell. That would have worked, and it
would have meant the language's own website demonstrating a workaround on its front page, with
byte counts that quietly excluded the shell nobody measured. Fixing it first costs a session and
means the site is the feature's first real consumer rather than its first workaround.
