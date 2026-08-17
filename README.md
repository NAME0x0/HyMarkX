# HyMarkX

**Markdown that grows into a web app — and stops growing when you stop asking.**

`HyMarkX` (**HMX**, extension `.hmx`, CLI `hmx`) is a Markdown-compatible,
progressively enhanced language for documents, websites, interfaces, and interactive
web applications.

> ⚠️ **Status: pre-alpha.** Phases 0–7 of 10 are complete and the toolchain works, but
> nothing is published, syntax may still change without migration paths, and the language
> has no users. Do not depend on it yet.

<p align="center">
  <img src="assets/evolution.svg" alt="The same document from plain text to a working page: source on the left, rendered result on the right, and the bytes shipped at each step" width="900">
</p>

*Every frame above is generated from real compiler output by
[`scripts/generate-evolution-svg.mjs`](scripts/generate-evolution-svg.mjs) — the source, the
rendered preview, the colours, and the byte counts. A test asserts the numbers still match
what the compiler emits, so the picture cannot drift into marketing.*

## Why

Markdown is the best way to write content and the worst way to build an interface. The
moment you need layout, reuse, or interactivity, you fall off a cliff into HTML, CSS,
JSX, TypeScript, a component library, and a bundler — all at once, before you needed
any of it.

HMX tries to remove the cliff rather than narrow it:

```
Plain text → Markdown → styled document → components → interactivity → application
```

You pay for a capability when you use it — in syntax, in learning, in runtime bytes.

## What it looks like

Ordinary Markdown is already HMX:

```md
# Hello World

This is my website.

## Projects
- AVA
- HyMarkX
```

Components are directives, not JSX. A container's fence needs more colons than anything
it wraps:

```md
::::grid{columns=3 gap=4}

:::card
## Revenue
$42,500
:::

:::card
## Users
14,302
:::

::::
```

Not this:

```tsx
<div className="grid grid-cols-3 gap-4">
  <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
    <CardContent>$42,500</CardContent></Card>
</div>
```

Values come from frontmatter and resolve at compile time — a page using them still ships
zero JavaScript:

```md
---
title: Analytics
---

# {{ title }}
```

Reusable components are `.hmx` files declaring their props:

```md
---
props:
  title: { type: string, required: true }
---

:::note
## {{ title }}

::children
:::
```

Interactivity is native, and compiles to a **591-byte gzipped** runtime:

```md
::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Count is {{ count }}.
```

## Design commitments

| | |
|---|---|
| **Markdown first** | A plain `.md` file is a valid HMX document. Enforced by CommonMark + GFM conformance suites in CI — 652/652, unchanged across seven syntax additions. |
| **Pay for what you use** | A static document compiles to HTML + CSS and **zero** JavaScript. CSS is emitted only for components actually used. Byte budgets are tests. |
| **Safe by default** | Rendering an untrusted document does not run code — *including interactive ones*. Expressions are a restricted pure sub-language with no host access, so `window`, `fetch`, and `document` are compile errors, not sandboxed calls. |
| **Framework neutral** | React may get a good adapter. The language is not defined by it. |
| **Not MDX with more syntax** | If a feature makes native HMX approach the verbosity of a conventional frontend, the feature is wrong. |

HMX claims **no novelty** in combining Markdown with components — MDX, Markdoc, Astro,
Quarto and others got there first. See [`docs/research/prior-art.md`](docs/research/prior-art.md)
for an honest account of what each does better and what HMX is actually claiming.

## Try it

```bash
pnpm install && pnpm build

node packages/cli/dist/bin.js build page.hmx --out -   # compile to stdout
node packages/cli/dist/bin.js check page.hmx           # diagnostics only
node packages/cli/dist/bin.js fmt page.hmx --check     # formatting, CI mode
node packages/cli/dist/bin.js dev .                    # dev server with live reload
```

## Repository layout

```
packages/ast              node types, spans, visitors, diagnostics
packages/parser           source → HMX AST (the only package that may touch micromark/mdast)
packages/compiler         analysis, components, styles, expressions, HTML backend, runtime
packages/formatter        canonical formatting of HMX constructs
packages/language-server  LSP: diagnostics, completion, hover, formatting
packages/cli              the `hmx` binary
editors/vscode            language contribution, TextMate grammar, LSP client
prototypes/               throwaway experiments kept as evidence
```

Packages are created when a boundary is real, not to match a diagram.

## Documentation

| Document | What it is |
|---|---|
| [`VISION.md`](VISION.md) | Why the project exists and what would make it fail |
| [`SPEC.md`](SPEC.md) | Normative language specification (v0.0 draft) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Pipeline, packages, diagnostics, testing |
| [`SECURITY.md`](SECURITY.md) | Trust modes and threat model |
| [`ROADMAP.md`](ROADMAP.md) | Phases, exit criteria, and the Markdoc gate |
| [`BACKLOG.md`](BACKLOG.md) | Prioritised work, and rejected ideas with reasons |
| [`docs/adr/`](docs/adr/) | 15 Architecture Decision Records |
| [`docs/guides/`](docs/guides/) | Styling, components, interactivity, formatting, dev server, editors |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, change control, definition of done |

## Status

**Phases 0–7 complete.** 1,125 tests. CommonMark 652/652 and GFM 40/40, never regressed.

| Phase | |
|---|---|
| 0 Research and charter | ✅ |
| 1 Markdown foundation | ✅ |
| 2 Directives, schemas, frontmatter | ✅ |
| 3 Styling | ✅ |
| — *"is this just Markdoc?" gate* | ✅ passed on measured evidence |
| 4 Expressions | ✅ |
| 5 Authored components | ✅ |
| 6 State, events, runtime | ✅ |
| 7 Developer experience | ✅ |
| 8 TS/TSX interoperability | not started |
| 9 Hardening, fuzzing, 0.1 publish | not started |
| 10 Ecosystem | not started |

The gate at the end of Phase 3 was a genuine stop condition: without a demonstrated path to
native interactivity, HMX would have been Markdoc with different punctuation and should not
have continued. It passed on a working prototype — 492 bytes gzipped against React's 47,750
for the same counter — not on an argument. See [`ROADMAP.md`](ROADMAP.md).

**What is deliberately not built yet:** named derived state, shared state between siblings,
async or data loading, named slots, TSX interop, and author CSS in `document` mode. Each is
recorded with its reasoning rather than left as an implied promise.

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache License 2.0](LICENSE-APACHE), at
your option. Rationale in [ADR-0010](docs/adr/0010-licensing.md).

**Your content stays yours.** Compiler output — and the HMX runtime embedded in that
output — imposes no licensing obligation on the documents, sites, or applications you
build with HyMarkX.

The **name** is handled separately: `HyMarkX`, `HMX`, `.hmx`, `hmx`, and `@hymarkx` are
project marks, so that `.hmx` keeps meaning one thing. Forks are welcome under the code
license; see [`TRADEMARK.md`](TRADEMARK.md) for naming them.

Unless you state otherwise, any contribution you intentionally submit for inclusion is
dual licensed as above, with no additional terms.
