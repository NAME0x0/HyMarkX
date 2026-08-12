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

*The first three were found by the HMX-P01 interactivity prototype. All are bounded design
gaps, not blockers — see the gate verdict in `ROADMAP.md`.*

- **Render plans cannot emit void elements.** `RenderPlan.wrappers` describes paired tags
  only, so a component rendering `<input>` produces `<input ...></input>`. Browsers
  normalise it and behaviour is correct, but the serialised HTML is invalid. Needed before
  any component emits `input`, `img`, `br`, or `hr`. Add a `void: true` flag to
  `RenderedElement`.
- **Attribute values cannot contain escaped quotes.** `on-click="last = \"Byron\""` fails to
  parse — the backslash-escaped quote ends the attribute and the block degrades to prose
  with `HMX1011`. Single quotes work as a workaround. String literals inside event handlers
  are common enough that this needs deciding before Phase 4 syntax is settled; it is
  evidence for that decision, not merely a bug.
- **The AST records decoded attribute values but not how they were written.** Distinguishing
  `value=1` from `value="1"` currently requires re-reading the source through the
  attribute's spans. It works and stays AST-driven, but the expression phase would be
  cleaner with an explicit literal-kind field on `Attribute`.
- **Fence-count nesting is a usability trap.** Nesting containers requires the *outer*
  fence to carry more colons, so the natural `:::grid` wrapping `:::metric` silently closes
  the outer container. `HMX1001` reports it clearly, but every author will write it wrong
  first. Options: have the formatter renumber fences (Phase 7), or reconsider the nesting
  rule. Inherited from ADR-0002. Feed this into the Phase 3 gate — if the natural way to
  write nested components is wrong, that is evidence about the syntax, not the author.
- **Deep nesting overflows `mdast-util-gfm-autolink-literal`.** Its tree transform is
  recursive, so a document nested ~10,000 deep crashes it even though our converter and
  plain mdast handle it. Currently surfaced as diagnostic `HMX1002` rather than a
  `RangeError`. Real fixes: implement autolink-literal detection in our own iterative
  converter, or upstream an iterative transform. Relevant to threat T9.
- **Media components (`video`, `audio`, `embed`).** Verified 2026-08-11: images of every
  format — PNG, GIF, SVG, JPEG, WebP — work from any CDN in both trust modes via ordinary
  `![alt](url)`. But `<video>`, `<audio>`, `<iframe>`, and `<picture>` are outside the
  sanitizer allowlist, so they are stripped in `document` mode and available only through
  raw HTML in `app` mode. There is currently no safe native way to embed video. Built-in
  components with `url`-typed attributes would route through the existing scheme allowlist
  and work safely in `document` mode — precisely the case the schema system exists for.
  `embed` additionally needs a host allowlist, since `<iframe>` carries XSS and
  clickjacking risk that a scheme check alone does not address.
- Diagnostic renderer with the framed source-excerpt format (ARCHITECTURE §4)
- `docs/diagnostics/` code registry, generated from source so it cannot drift
- Dependency-graph CI check enforcing the parser/compiler boundary
- Benchmark harness before Phase 3

## P3

- `hmx inspect` (dump AST/HIR for debugging)
- Source maps (must be designed in Phase 4, not retrofitted)
- Email-safe and PDF-oriented backends

## Research

- **Grammar-constrained generation export.** Emit the component schemas and HMX grammar as
  JSON Schema plus a GBNF/EBNF grammar, so any language model generating `.hmx` can be
  constrained to structurally valid output rather than validated after the fact. Follows
  directly from schemas (HMX-005), the restricted expression language (ADR-0004), and
  deterministic formatting. MDX structurally cannot do this — its content is a JavaScript
  module, so the valid set is not expressible as a grammar. Design the schema format to be
  exportable from the start; the export itself is Phase 7–9, after the grammar stabilizes.
- **Suggestion diagnostics.** Edit-distance matching over known component and attribute
  names, so `:::mertic` proposes `metric`. Cheap, deterministic, and most of the felt
  "the compiler understands me" experience. Land alongside schemas.

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
| An LLM-shaped inference engine inside the compiler (custom tokenizer/encoder/decoder/chunking/attention "vertices" that infer author intent without a model) | Category error, not a scope problem. Those components are plumbing that feeds learned weights; without the weights a tokenizer is a lexer and attention vertices are an AST — both of which we already have. The blocker is information-theoretic: when an author writes `:::chart`, the information about what they meant is not in the document. An LLM appears to supply it by drawing on a corpus; with no corpus there is nothing to draw on. Building it would produce unpredictable, undebuggable behaviour — failure mode §52 "excessive magic" — in a tool whose entire value is determinism. The achievable version of "the language understands me" is schemas, strong defaults, suggestion diagnostics, and type-system-style contextual inference, all of which are already planned. The productive inversion is under Research: export a grammar that constrains models generating HMX, rather than imitating one. |
