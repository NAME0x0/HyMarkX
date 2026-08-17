# HyMarkX — Architecture

**Status:** living document · applies to language version 0.0.x

This document describes how the HMX toolchain is structured and *why*. Decisions with
alternatives worth recording live in [`docs/adr/`](docs/adr/).

## 1. Pipeline

```
source (.hmx / .md)
  │
  ├─ 1. tokenize + parse ───────────────► micromark (CommonMark + GFM + HMX extensions)
  │
  ├─ 2. build HMX AST ─────────────────► @hymarkx/ast   (source-faithful, spans on every node)
  │
  ├─ 3. semantic analysis ─────────────► scopes, component resolution, expression checking,
  │                                       accessibility + security lint → Diagnostic[]
  │
  ├─ 4. transform passes ──────────────► normalization, lowering of HMX constructs
  │
  ├─ 5. [Phase 4+] HIR ────────────────► resolved, backend-neutral representation
  │
  ├─ 6. backend / emitter ─────────────► html-static (first), others later
  │
  └─ output: HTML + CSS + optional JS + metadata + diagnostics + source maps
```

Each stage is a pure function of its input plus a `CompileOptions` record. No stage
mutates its input. Diagnostics accumulate; they are never thrown as control flow
(except for genuinely unrecoverable I/O errors).

**Stage 5 does not exist yet.** An IR is added when a second backend or a real
optimization pass demonstrates the need (ADR-0006). Until then stage 6 consumes the
AST directly, behind a backend interface so that inserting an IR later is a change to
two packages rather than a rewrite.

## 2. Packages

Only boundaries that are load-bearing today exist as packages. Empty scaffolding for
future packages is not created.

```
packages/
  ast/              @hymarkx/ast       core shared vocabulary: node types, spans, builders,
                                       visitor, Diagnostic. Zero runtime dependencies.
  parser/           @hymarkx/parser    source → HMX AST. Only package allowed to import
                                       micromark/mdast.
  compiler/         @hymarkx/compiler  analysis, components, styles, expressions, state,
                                       HTML backend, emitted runtime. Owns diagnostics.
  formatter/        @hymarkx/formatter canonical formatting of HMX constructs.
  language-server/  @hymarkx/language-server  LSP over parser, compiler and formatter.
  cli/              @hymarkx/cli       `hmx` binary: build, check, fmt, dev.

editors/vscode/                        language contribution, TextMate grammar, LSP client.
prototypes/                            throwaway experiments, kept as evidence.
```

Still deliberately absent until earned: a separate `runtime` package (the emitted runtime is
small enough to live in the compiler) and `integrations/*`.

**Host packages.** `@hymarkx/cli` and `@hymarkx/language-server` may import `node:` builtins
and touch the filesystem. Every other package must run unchanged in a browser, which is what
the boundary check enforces — the rule is scoped to `packages/`, since `editors/` is host
code by definition.

### Dependency rule

```
cli → compiler → parser → ast
                    ↘──────↗
```

`ast` depends on nothing. `compiler` MUST NOT import `micromark`, `mdast-util-*`, or
any `unified` package. This is the AST-ownership boundary from ADR-0005 and is
enforced in CI by a dependency-graph check, not by convention.

## 3. AST ownership

The HMX AST is **defined by HMX**, in `@hymarkx/ast`, with its own TypeScript types.
For the Markdown subset the node shapes are *structurally compatible* with mdast, so
the parser package can use unified utilities internally at no conversion cost. That
compatibility is an implementation convenience, not a public contract, and it stops at
the parser boundary.

Every node carries a `position` with `start`/`end` `{ line, column, offset }`. Nodes
created by transforms carry the position of their origin plus a `synthetic: true`
marker. Losing spans is a bug, not a shortcut — diagnostics, source maps, the future
formatter, and the future language server all depend on them.

No AST stability promise before 1.0. The root node carries `hmxVersion` so tools can
detect mismatch.

## 4. Diagnostics

Diagnostics are the language's user interface for failure, and are treated as a
feature, not an afterthought (§46 of the charter).

```ts
interface Diagnostic {
  code: string            // stable, e.g. "HMX1023"
  severity: 'error' | 'warning' | 'info'
  message: string         // what went wrong, one line, no jargon
  span: Span              // primary source range
  expected?: string       // what the parser wanted
  suggestion?: Suggestion // optional machine-applicable fix
  related?: RelatedSpan[] // e.g. "directive opened here"
  url?: string            // docs link, once docs exist
}
```

Code ranges:

| Range     | Meaning                                    |
|-----------|--------------------------------------------|
| HMX1xxx   | Lexical / syntax                            |
| HMX2xxx   | Semantic (scopes, components, expressions)  |
| HMX3xxx   | Security / trust-mode violations            |
| HMX4xxx   | Accessibility                               |
| HMX5xxx   | Configuration, I/O, CLI                     |

Codes are permanent once shipped. Retired codes are tombstoned in the registry
(`docs/diagnostics/`), never reused.

Target rendering:

```
error[HMX1023]: expression was not closed
  ┌─ dashboard.hmx:14:7
  │
14 │ :::card{title={user.name}
  │              ^ expected `}` before end of directive attributes
  │
help: :::card{title={user.name}}
```

## 5. Trust model (summary)

Two modes, selected by the **host**, never by the document. See [`SECURITY.md`](SECURITY.md)
and ADR-0007.

| | `document` (default) | `app` (opt-in) |
|---|---|---|
| `<script>` / event handlers | rejected with HMX3xxx | allowed |
| raw HTML | sanitized allowlist | passed through |
| URL schemes | `http(s)`, `mailto`, relative | plus author-configured |
| imports | none | resolved from project |
| expressions | pure subset, no host access | pure subset + declared bindings |

A document can never escalate its own mode. There is no in-document directive that
turns scripts on.

## 6. Output proportionality

Static input produces `HTML + CSS` and **zero** HMX JavaScript. The emitter tracks
which runtime features the document actually used and emits only those. A page with
one counter must not ship a general-purpose reactive framework.

This is verified, not assumed: `tests/output-size/` asserts an exact byte budget for
representative documents, and the budget is a failing test, not a dashboard.

## 7. Implementation stack

- **TypeScript 7** (`strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`), ESM only.
- **Node ≥ 22.12** runtime target; the compiler must also run in a browser (no `node:`
  imports outside `cli`).
- **pnpm** workspaces, **vitest** for tests, **oxlint** + **prettier** for lint/format.
- **micromark 4 / mdast-util-* 3.x** as the Markdown engine (ADR-0003).

Rust/WASM is not on the table until a benchmark identifies a real bottleneck (ADR-0009).

## 8. Testing architecture

| Suite | Location | Asserts |
|---|---|---|
| CommonMark conformance | `tests/conformance/` | HMX renders the CommonMark spec suite identically to reference |
| GFM conformance | `tests/conformance/` | tables, task lists, strikethrough, autolinks |
| Golden | `fixtures/**/{input.hmx,expected.html,expected.ast.json}` | source → AST and source → HTML |
| Diagnostics | `fixtures/invalid/**` | exact code + span + message for malformed input |
| Unit | per package | construct-level behaviour |
| Security | `tests/security/` | XSS vectors, scheme injection, mode escalation attempts |
| Output size | `tests/output-size/` | byte budgets |
| E2E | `tests/e2e/` | `hmx build` on real projects |

Snapshots are permitted for large HTML blobs only, and never as the *only* assertion
for a behaviour.

## 9. Performance discipline

No performance promises before measurement. Benchmarks (`benchmarks/`) establish a
baseline for parse time, compile time, and output size before Phase 3; targets are set
from that baseline, and regressions of >10% fail CI once the baseline is stable.
