# HyMarkX — Backlog

Classification: **P0** blocks correctness/security · **P1** required for current
milestone · **P2** important near-term · **P3** desirable · **Research** ·
**Deferred** · **Rejected**.

Rejected items record *why*, so they are not relitigated without new evidence.

## P1 — Phase 1

| Item | Notes |
|---|---|
| Workspace + toolchain + CI | Codex task HMX-001 |
| `@hymarkx/ast` | node types, spans, visitor |
| `@hymarkx/parser` | micromark → HMX AST |
| `@hymarkx/compiler` | AST → HTML, diagnostics |
| `@hymarkx/cli` | `hmx build`, `hmx check` |
| CommonMark + GFM conformance suites | must be green before Phase 2 |

## P1 — Phase 2

| Item | Notes |
|---|---|
| **Component schemas** | Promoted from Research. A directive whose attributes are unvalidated strings is syntax, not a component model. Schemas are what turn `:::chart{type=line}` into something the compiler can check, an editor can complete, and a model can generate reliably. Markdoc demonstrates this works; it is the single most transferable idea from it. Required for Phase 2 exit. |

## P1 — carried into Phase 2

| Item | Notes |
|---|---|
| `containerDirective` traversal index | A container has two child arrays (`label`, `children`), so `visit` reports an index into their concatenation. Read-only passes are fine; index-based mutation is not. Settle the label representation when directives land, then fix `childrenOf` and drop the warning comment in `packages/ast/src/visit.ts`. |

## P2

- **Deep nesting overflows `mdast-util-gfm-autolink-literal`.** Its tree transform is
  recursive, so a document nested ~10,000 deep crashes it even though our converter and
  plain mdast handle it. Currently surfaced as diagnostic `HMX1002` rather than a
  `RangeError`. Real fixes: implement autolink-literal detection in our own iterative
  converter, or upstream an iterative transform. Relevant to threat T9.
- Diagnostic renderer with the framed source-excerpt format (ARCHITECTURE §4)
- `docs/diagnostics/` code registry, generated from source so it cannot drift
- Dependency-graph CI check enforcing the parser/compiler boundary
- Benchmark harness before Phase 3

## P3

- `hmx inspect` (dump AST/HIR for debugging)
- Source maps (must be designed in Phase 4, not retrofitted)
- Email-safe and PDF-oriented backends

## Research

- **`@`-prefixed statement family** (`@let`, `@if`, `@for`) — better ergonomics than
  `:::if{…}` but a second grammar and an ambiguity risk with prose starting `@`.
  Mitigation sketch: closed keyword set, block position only, `@name` + space.
  Decide in Phase 4 with real documents as evidence. See ADR-0002.
- Incremental parsing / tree-sitter grammar for editor tooling (Phase 7 input)
- Multi-line directive configuration. `{...}` attributes get unwieldy for a chart with
  six settings, but a YAML-ish directive body would be a *third* syntax family alongside
  attributes and frontmatter. Decide with real documents in Phase 2; do not add a third
  family casually.
- Whether HMX needs a native style shorthand at all, or CSS + scoping suffices

## Deferred

- IR / HIR layer — until a second backend or real optimization needs it (ADR-0006)
- Plugin API — compiler phases must stabilize first (ADR-0008)
- Routing, data loading, server functions, auth — Phase 9+, if ever
- Package registry — never; npm interop instead

## Rejected

| Idea | Why rejected |
|---|---|
| Hand-written Markdown parser | micromark is linear-time, CommonMark-conformant, extensible at the tokenizer level, and battle-tested. Rewriting it buys nothing and costs years. Revisit only if an HMX construct provably cannot be expressed as a micromark extension. |
| Regex/string preprocessing of HMX syntax before Markdown parsing | Breaks inside code fences, breaks escaping, destroys spans, produces unexplainable bugs. This is the single most common way Markdown-superset projects fail. |
| Defining HMX as "Markdown + React" | Contradicts framework neutrality; makes JSX the price of entry; the thing MDX already does. |
| Full JavaScript as the expression language | Kills `document` mode, static analysis, SSR portability, and framework neutrality. JS remains available as an `app`-mode escape hatch. (ADR-0004) |
| Rust/WASM compiler core now | No measurement identifies a bottleneck. Would halve contributor accessibility and complicate browser use. (ADR-0009) |
| Shipping a universal client runtime | Contradicts output proportionality; the main performance advantage over MDX/React. |
