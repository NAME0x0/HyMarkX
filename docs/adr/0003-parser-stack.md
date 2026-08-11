# ADR-0003 — Parser stack: micromark + mdast utilities

**Status:** Accepted · 2026-08-11

## Context

The parser is the decision hardest to reverse. Candidates evaluated (versions checked
against npm on 2026-08-11):

| Option | CommonMark | Extension model | Spans | Notes |
|---|---|---|---|---|
| micromark 4.0.2 + mdast-util-* 3.x | yes, reference-grade | state-machine syntax extensions at the tokenizer level | precise | powers remark/MDX/Astro; linear time; ESM; typed |
| markdown-it | yes | rule injection, but token-stream oriented | line-level, coarser | large plugin ecosystem; weaker for a compiler that needs exact spans |
| tree-sitter-markdown | approximate | grammar fork | precise, incremental | excellent for editors, weaker as a semantic source of truth; native binding cost |
| hand-written | must be built | total control | total control | years of work to reach parity; see BACKLOG "Rejected" |

## Decision

Use **micromark 4** for tokenization and **mdast-util-from-markdown 2 / mdast-util-gfm 3**
for tree construction, inside `@hymarkx/parser` only. HMX syntax is added as micromark
syntax extensions.

`@hymarkx/parser` is the **only** package permitted to import micromark, mdast, or
unified packages. Enforced by a CI dependency check, not by convention.

## Alternatives considered

Rejecting a hand-written parser is the important one: micromark is linear-time by
construction (relevant to threat T9), passes the CommonMark suite, and exposes exactly
the extension point HMX needs. Writing our own would consume the entire project budget
to arrive at a worse starting position.

tree-sitter is not rejected forever — it is the likely answer for incremental editor
parsing in Phase 7, as a *second* grammar serving the language server, with the
micromark pipeline remaining the semantic source of truth.

## Consequences

- We inherit micromark's extension idioms and its performance characteristics.
- We inherit its maintenance risk; mitigated by the boundary — replacing the engine is
  a rewrite of one package, not of the compiler.
- Dependency footprint stays small: micromark + a handful of mdast utilities, all from
  one maintained ecosystem, all ESM, all typed.
- Browser use works: no `node:` imports in the parser path.
