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

## P1 — carried into Phase 2

| Item | Notes |
|---|---|
| `containerDirective` traversal index | A container has two child arrays (`label`, `children`), so `visit` reports an index into their concatenation. Read-only passes are fine; index-based mutation is not. Settle the label representation when directives land, then fix `childrenOf` and drop the warning comment in `packages/ast/src/visit.ts`. |

## P2

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
- Schema-checkable components for reliable AI generation (charter §27)
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
