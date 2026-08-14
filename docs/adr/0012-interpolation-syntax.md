# ADR-0012 — Text interpolation is `{{ expr }}`, evaluated at compile time

**Status:** Accepted · 2026-08-14

## Context

Phase 4 makes expressions real. Two placement questions follow: how an expression appears
in prose, and when it is evaluated.

`SPEC.md` Appendix A already reserves `{ident={...}}` for attribute values. Prose needs its
own form, and the choice is constrained by §3: whatever we pick must not change how existing
Markdown renders.

Candidates were measured against the CommonMark 0.31.2 corpus rather than argued about:

| Form | Examples containing it, of 652 |
|---|---|
| `{ … }` | **4** |
| `{{ … }}` | 0 |
| `${ … }` | 0 |

Single braces are out on evidence: four conformance examples contain them, so bare
`{count}` would either break them or require exceptions the compatibility guarantee does
not permit.

## Decision

**1. Text interpolation is `{{ expr }}`.**

Zero collisions in the corpus, and it is the form Vue, Angular, Handlebars, Liquid, and Jinja
all use — so it reads as "a value goes here" to most people on sight, with nothing to learn.

`${ … }` was the other zero-collision candidate and is rejected deliberately: in JavaScript
that sigil means *an arbitrary JavaScript expression*, and HMX's expressions are a restricted
pure subset (ADR-0004). Borrowing JavaScript's exact notation would promise a superset of
what the language delivers, and the first thing a JS developer would try is a function call.
`{{ }}` promises "template value", which is accurate.

A literal `{{` is escaped as `\{{`.

**2. Phase 4 expressions are evaluated at compile time**, over a scope consisting of the
document's frontmatter and nothing else.

This means `{{ title }}` is resolved during compilation and the result is written into the
HTML. A document using expressions still ships **zero JavaScript**. Runtime evaluation —
against mutable state — arrives with Phase 6, reusing the same grammar and checker.

Sequencing this way keeps output proportionality intact through Phase 4, gives frontmatter
an immediate purpose beyond metadata, and lets the grammar, the static checker, and the
diagnostics be built and hardened before reactivity introduces the harder questions.

## Alternatives considered

- **`{ expr }` single brace.** The most natural form and the one the charter's north-star
  sketch uses. Rejected on measured evidence: it collides with real CommonMark.
- **`:v[expr]` text directive**, as used by the interactivity prototype. Zero new syntax and
  it already parses — but `Count is :v[count].` reads poorly in prose, and prose is the
  medium HMX exists to serve. Kept as an implementation detail nobody has to type.
- **Runtime evaluation from the start.** Rejected: it would put JavaScript into documents
  that only need a title substituted, breaking the property that output is proportional to
  the capability used.

## Consequences

- `{{` becomes reserved. `SPEC.md` Appendix A must list it, and the escape `\{{` must work.
- Frontmatter becomes semantically load-bearing rather than passive metadata, so its
  validation matters more than it did.
- Phase 6 must extend evaluation to runtime **without changing the grammar**. If the same
  expression cannot be both compile-time evaluated and compiled to a runtime instruction
  tree, this decision is wrong and should be revisited then — the prototype suggests it can.
- An expression referencing something outside frontmatter is a compile error at this
  version, not a runtime `undefined`. That is the point of a closed scope.
