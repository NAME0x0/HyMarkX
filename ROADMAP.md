# HyMarkX — Roadmap

Phases are ordered by dependency, not by calendar. A phase is not started until the
previous one meets its exit criteria. Scope creep across phase boundaries is a
process violation (see `CONTRIBUTING.md`).

## Phase 0 — Research and charter ✅

Competitive analysis, design principles, first ADRs, MVP definition, parser strategy,
architecture proposal. **Exit:** `VISION.md`, `ARCHITECTURE.md`, `SPEC.md` (draft),
`SECURITY.md`, ADR-0001…0009, `docs/research/prior-art.md`. No production code.

## Phase 1 — Markdown foundation ✅

Prove the boring part works perfectly before adding anything.

- pnpm workspace, TS 7 strict, vitest, oxlint, prettier, CI
- `@hymarkx/ast` — node types, spans, builder, visitor
- `@hymarkx/parser` — CommonMark + GFM → HMX AST
- `@hymarkx/compiler` — AST → HTML, diagnostics infrastructure
- `@hymarkx/cli` — `hmx build <file>`, `hmx check <file>`
- CommonMark + GFM conformance suites passing

**Exit:** `hmx build index.md` produces reference-identical HTML for the full
CommonMark suite; the parser→compiler boundary holds (no unified imports in
`compiler`); >0 diagnostics implemented with real spans.

## Phase 2 — First HMX extension: directives ✅

One carefully designed native construct, taken all the way.

- directive syntax (text/leaf/container) as a micromark extension, not preprocessing
- attributes incl. `#id` / `.class` shorthands, prototype-pollution guard
- frontmatter
- nesting, escaping, unclosed-fence recovery, `HMX1001`/`HMX2001`/`HMX2002`
- a small built-in component set to prove the mechanism (`card`, `note`, `grid`)
- **component schemas**: typed attributes, allowed children, validation diagnostics
- golden AST + HTML fixtures; Markdown-compatibility suite still green

**Exit:** the compatibility guarantee (SPEC §3) is mechanically verified; a
non-trivial document using directives compiles to correct, runtime-free HTML; an invalid
attribute value produces a useful diagnostic rather than being passed through.

## Phase 3 — Styling

Global styles, scoped styles, and the decision on whether native style shorthand earns
its place. Design tokens considered, not assumed. Exit: a styled page ships zero JS.

## Gate — "is this just Markdoc?" ✅ PASSED (2026-08-12)

**Run early, before Phase 3, so that styling was not built on an unanswered question.**

The evidence is `prototypes/interactivity/` (throwaway, task HMX-P01), verified
independently by the orchestrator rather than accepted on report.

**What was demonstrated.** A document using only syntax that already parses —
`::state{count=0}`, `:::button{on-click="count = count + 1"}`, `:v[count]` — compiles to a
working interactive page. Driven in a real DOM it goes `Count is 0.` → `Count is 3.` after
three clicks. Two-way input binding also works.

| | gzipped |
|---|---|
| **HMX counter, entire page** | **492 B** |
| Vanilla JS counter, total payload | 350 B |
| React counter, total payload | 47,750 B |

The runtime is 367 B gzipped. React is ~97× larger for the same counter, and hand-written
vanilla is the floor we are within 1.4× of.

**The mechanism is sound.** Expressions compile to a small instruction tree —
`["a","count",["b","+",["i","count"],["l",1]]]` — walked by a switch-based interpreter.
No `eval`, no `new Function`. `alert(1)`, `window.location`, `a.b`, `import('x')`,
`constructor`, `this`, and IIFEs are all rejected with precise messages, so ADR-0004's
restricted expression language is enforceable rather than aspirational.

**Output proportionality holds.** A document without state emits a 0-byte runtime, no
`<script>`, and HTML byte-identical to the production compiler. Verified by comparison, not
assumed.

**Verdict: continue.** Nothing in the AST, the parser, or the restricted expression model
blocks compiled small-runtime interactivity. HMX is not confined to Markdoc's territory.

**What this does NOT establish**, and must not be cited as if it did: production security
for expressions, SSR, hydration, component scoping, general attribute expressions, or
derived state. State here is page-level with a trivial dependency graph — the genuinely hard
parts of reactivity (derived values, update ordering, batching, cycles) are untested. Three
concrete gaps were found and recorded in `BACKLOG.md`.

---

### Original gate criteria (kept for the record)

At the end of Phase 3, HMX will be: Markdown + directives + schemas + variables + scoped
styles. That is substantially the territory Markdoc already occupies, and Markdoc occupies
it well. If the project stopped here it should not have been built.

Everything that makes HMX worth existing is on the far side of this gate: native state,
native events, a compiled minimal runtime, `.hmx` components authored without a separate
TSX file, and a real toolchain. Markdoc deliberately declines to cross that line; crossing
it is the entire thesis.

The review asks one question: **is there a credible, demonstrated path to native
interactivity, or are we building a content publisher with different punctuation?** A
throwaway prototype of the Phase 6 counter example is the evidence. If the answer is no,
the honest outcomes are to redesign or to stop — not to continue into Phases 4–8 on
momentum.

## Phase 4 — Expressions

Implement the restricted expression language from ADR-0004: grammar, evaluator, static
checker, diagnostics. Expression-valued attributes become legal. Exit: expressions are
provably pure — a fuzz corpus cannot reach a host object.

## Phase 5 — Components

HMX-authored reusable components: declaration, props, children/slots, scope,
resolution. Every question in charter §41 answered in the spec first.

## Phase 6 — Minimal interactivity

State, events, and the smallest runtime that can express them. Islands, not a
framework. Byte budget enforced by test.

## Phase 7 — Developer experience

`hmx dev` with fast reload, `hmx fmt`, language server, VS Code extension.

## Phase 8 — TS/TSX interoperability

Import TSX components from HMX; the reverse if justified. React adapter as one
backend, not as the definition of the language.

## Phase 9 — Production hardening

Fuzzing, security audit, performance targets from measured baselines, compatibility
suites, documentation completeness, 0.1 publish.

Publishing checklist: remove `"private": true` from every package manifest (it exists to
prevent an accidental pre-alpha release), confirm `publishConfig.access` is `public` on the
scoped packages, and replace the `hymarkx` placeholder on npm with the real CLI.

## Phase 10 — Ecosystem

Only after core utility is proven. Plugin API versioning, integrations, package names.

---

## The demo that decides whether this was worth building

Before Phase 7, build the *same* dashboard four ways — HTML/CSS/JS, React/TSX, MDX,
HMX — and measure lines, boilerplate, output bytes, runtime bytes, and readability.
The comparison must be honest; a rigged demo is worse than no demo. If HMX is not
materially better, the answer is to fix the language, not the marketing.
