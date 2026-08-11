# HyMarkX

**Markdown that grows into a web app — and stops growing when you stop asking.**

`HyMarkX` (**HMX**, extension `.hmx`, CLI `hmx`) is a Markdown-compatible,
progressively enhanced language for documents, websites, interfaces, and interactive
web applications.

> ⚠️ **Status: pre-alpha, Phase 0 → 1.** The language is unspecified in most areas,
> the compiler is being built, nothing is published, and syntax will change without
> migration paths. Not usable yet. Do not depend on it.

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

Components arrive as directives, not JSX *(Phase 2, in progress)*:

```md
:::grid{columns=3 gap=4}

:::card
## Revenue
$42,500
:::

:::card
## Users
14,302
:::

:::
```

Not this:

```tsx
<div className="grid grid-cols-3 gap-4">
  <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
    <CardContent>$42,500</CardContent></Card>
</div>
```

TSX, JS, HTML, and CSS remain available as escape hatches. They are never the price of
entry.

## Design commitments

| | |
|---|---|
| **Markdown first** | A plain `.md` file is a valid HMX document. Enforced by the CommonMark + GFM conformance suites in CI. |
| **Pay for what you use** | A static document compiles to HTML + CSS and **zero** HMX JavaScript. Byte budgets are tests. |
| **Safe by default** | Rendering an untrusted document does not run code. Trust level is chosen by the host, never by the document. |
| **Framework neutral** | React may get a great adapter. The language is not defined by it. |
| **Not MDX with more syntax** | If a feature makes native HMX approach the verbosity of a conventional frontend, the feature is wrong. |

HMX claims **no novelty** in combining Markdown with components — MDX, Markdoc, Astro,
Quarto and others got there first. See [`docs/research/prior-art.md`](docs/research/prior-art.md)
for an honest account of what each does better and what HMX is actually claiming.

## Documentation

| Document | What it is |
|---|---|
| [`VISION.md`](VISION.md) | Why the project exists and what would make it fail |
| [`SPEC.md`](SPEC.md) | Normative language specification (v0.0 draft) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Pipeline, packages, diagnostics, testing |
| [`SECURITY.md`](SECURITY.md) | Trust modes and threat model |
| [`ROADMAP.md`](ROADMAP.md) | Phases and exit criteria |
| [`BACKLOG.md`](BACKLOG.md) | Prioritised work, and rejected ideas with reasons |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, change control, definition of done |

## Repository layout

```
packages/ast        node types, spans, visitors
packages/parser     source → HMX AST (the only package that may touch micromark/mdast)
packages/compiler   analysis, transforms, HTML backend, diagnostics
packages/cli        the `hmx` binary
docs/               spec, architecture, ADRs, research
fixtures/ tests/    golden fixtures and conformance suites
```

Packages are created when a boundary is real, not to match a diagram.

## Status

Phase 0 (research and charter) is complete. Phase 1 (Markdown foundation) is under way.
Track progress in [`ROADMAP.md`](ROADMAP.md).

## License

Undecided — pending the project owner's explicit choice. Until a license file exists,
all rights are reserved.
