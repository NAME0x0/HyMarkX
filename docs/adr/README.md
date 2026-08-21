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
| [0010](0010-licensing.md) | Dual licence `MIT OR Apache-2.0` + trademark policy | Accepted |
| [0011](0011-styling-model.md) | CSS with attribute scoping; no native style shorthand | Accepted |
| [0012](0012-interpolation-syntax.md) | Text interpolation is `{{ expr }}`, evaluated at compile time | Accepted |
| [0013](0013-component-model.md) | Authored components are `.hmx` files with props in frontmatter | Accepted |
| [0014](0014-state-and-events.md) | Component-local state, compiled reactivity, `@` family rejected | Accepted |
| [0015](0015-developer-experience.md) | Conservative formatter, full-reparse language server | Accepted |
| [0016](0016-foreign-components.md) | Foreign components are framework-agnostic islands, never run at build time | Accepted |
| [0017](0017-text-directive-flanking.md) | A text directive may not follow an alphanumeric character | Accepted |
| [0018](0018-attribute-value-escapes.md) | Backslash escapes quotes inside attribute values | Accepted |
| [0019](0019-declared-props-consume-universal-attributes.md) | A declared prop consumes its attribute instead of also emitting HTML | Accepted |

## Decisions still open

| Topic | Blocked until | Notes |
|---|---|---|
| Named derived state (state→state edges) | after Phase 6 ships | ADR-0014 defers it deliberately — it is where ordering, batching and cycles live |
| Sharing state between sibling components | first real complaint | ADR-0014 has no ambient store by design; needs its own ADR |
| Named slots for authored components | evidence from real documents | ADR-0013 defers them; caller-side syntax is where they turn verbose |
| A declared `title` prop also emitting an HTML tooltip | needs an ADR | see `BACKLOG.md`; accessibility concern against specified behaviour |
| CLA vs DCO for outside contributions | before the first external PR | ADR-0010: a DCO does not grant relicensing rights |
