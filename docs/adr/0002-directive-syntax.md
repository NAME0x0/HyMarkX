# ADR-0002 — Adopt the generic directives syntax for HMX blocks and components

**Status:** Accepted · 2026-08-11

## Context

HMX needs one way to express "a thing that is not plain prose": components, callouts,
layout, embeds. The charter's north-star sketch mixes two families — `:::card` blocks
and `@layout` / `@state` / `@if` lines — which would mean two grammars, two sets of
ambiguity risks, and two tooling paths.

Prior art is unusually clear here. The generic directives proposal
(`micromark-extension-directive` 4.0.0, `mdast-util-directive` 3.1.0,
`remark-directive`) defines three forms with settled semantics, and is deployed widely
enough that its edge cases are known rather than theoretical:

```
:name[label]{attrs}        text directive   (inline)
::name[label]{attrs}       leaf directive   (block, no children)
:::name[label]{attrs} … ::: container directive (block, children)
```

Attributes are HTML-shaped, with `{#id}` and `{.class}` shorthands. Nesting works by
increasing the outer fence's colon count. `:name:` is deliberately not a directive, so
emoji shortcodes survive.

## Decision

1. HMX's component/block syntax **is** the generic directives syntax. We do not invent
   a competing form.
2. The syntax is implemented as a **micromark syntax extension**. String preprocessing
   is prohibited (see `BACKLOG.md`, Rejected).
3. HMX **owns the semantics**: which names are components, what attributes mean,
   validation, diagnostics, and — from Phase 4 — expression-valued attributes, which
   the upstream extension does not have.
4. The `@`-prefixed statement family (`@let`, `@if`, `@for`) is **deferred to Phase 4**
   and tracked as Research, not adopted now.

## Alternatives considered

- *Invent HMX-specific block syntax.* Costs a new grammar, new ambiguity analysis, new
  editor support, and forfeits an ecosystem that already highlights `:::` blocks. No
  identified benefit that the semantics layer cannot deliver.
- *XML/JSX-style tags (`<Card>…</Card>`) as primary.* This is MDX. It is the failure
  mode the project exists to avoid. Available later as an interop escape hatch.
- *Adopt `@`-statements now.* Better ergonomics for control flow (`@if user.admin`
  reads better than `:::if{user.admin}`), but: a line starting with `@` is legal prose
  today, it needs a second tokenizer, and we have no real documents yet to judge the
  trade. Deciding now would be deciding without evidence.

## Consequences

- Phase 2 is materially smaller and lower-risk than a bespoke grammar would be.
- Control flow, when it lands, either uses directive form or triggers a reopened ADR
  with real-document evidence. Both paths are acceptable; guessing now is not.
- `Appendix A` of the spec reserves leading `@` so adopting it later is not breaking.
- We inherit upstream's constraints: no whitespace between colons and name; label and
  attributes cannot span lines. These are documented as normative in SPEC §4.1 rather
  than treated as implementation details we might quietly change.
- Because HMX-specific attribute semantics (expressions) exceed upstream's model, the
  parser package may need a forked or wrapped tokenizer at Phase 4. Flagged now so it
  is a planned cost rather than a surprise.
