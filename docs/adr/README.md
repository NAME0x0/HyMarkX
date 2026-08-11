# Architecture Decision Records

Decisions that are expensive to reverse live here, not in chat history. Each record
states Context, Decision, Alternatives considered, and Consequences. Records are
immutable once accepted; a reversal is a new ADR that supersedes the old one.

| # | Title | Status |
|---|---|---|
| [0001](0001-markdown-baseline.md) | Markdown baseline is CommonMark + GFM | Accepted |
| [0002](0002-directive-syntax.md) | Adopt generic directives for blocks and components | Accepted |
| [0003](0003-parser-stack.md) | Parser stack: micromark + mdast utilities | Accepted |
| [0004](0004-expression-language.md) | Expressions are a restricted pure sub-language | Accepted (direction) |
| [0005](0005-ast-ownership.md) | HMX owns its AST; mdast stops at the parser boundary | Accepted |
| [0006](0006-no-ir-yet.md) | No IR until a second backend needs one | Accepted, revisit Phase 4 |
| [0007](0007-trust-modes.md) | Two host-selected trust modes | Accepted |
| [0008](0008-no-plugin-api-yet.md) | No public plugin API before phases stabilize | Accepted, revisit Phase 9 |
| [0009](0009-implementation-language.md) | TypeScript 7, ESM only, Node ≥ 22.12 | Accepted |

## Decisions still open

| Topic | Blocked until | Notes |
|---|---|---|
| Styling model (scoped CSS, tokens, native shorthand?) | Phase 3 | ADR-0010 |
| `@`-statement family vs directive-only control flow | Phase 4 | evidence from real documents; see ADR-0002 |
| Component contract (props, slots, scope, typing) | Phase 5 | every question in charter §41 answered first |
| State and reactivity model | Phase 6 | lifecycle specified before syntax |
| Runtime/hydration strategy (islands granularity) | Phase 6 | |
| TSX interoperability direction | Phase 8 | |
| License | before first publish | owner's decision, not the toolchain's |
