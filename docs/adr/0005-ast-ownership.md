# ADR-0005 — HMX owns its AST; mdast stops at the parser boundary

**Status:** Accepted · 2026-08-11

## Context

Using mdast types throughout the compiler is the path of least resistance and the way
most Markdown-superset projects become unable to change their parser. Once
`mdast-util-*` types appear in a public compiler API, every consumer depends on
upstream's node shapes, and the parser choice is permanent.

## Decision

`@hymarkx/ast` defines HMX's node types in TypeScript, with a `position` span on every
node. For the Markdown subset those shapes are *structurally compatible* with mdast so
that `@hymarkx/parser` can use unified utilities internally with no conversion cost.

That compatibility is an implementation convenience, **not** a public contract:

- `@hymarkx/compiler`, `@hymarkx/cli`, and every future package MUST NOT import
  micromark, mdast, hast, or unified packages.
- CI enforces this with a dependency-graph check.
- The AST root carries `hmxVersion`. No stability promise before 1.0.

Nodes produced by transforms carry the span of their origin plus `synthetic: true`.

## Alternatives considered

- *Use mdast directly everywhere.* Faster to start, permanently couples HMX to one
  parser ecosystem, and leaks node types HMX does not control into diagnostics,
  plugins, and eventually the language server.
- *Full conversion layer with distinct shapes.* Maximum independence, but a real
  per-parse cost and a large mapping surface to keep correct, bought before any second
  parser exists to justify it. Structural compatibility gets most of the benefit for
  none of the cost.

## Consequences

- Replacing the Markdown engine later touches one package.
- Diagnostics, the formatter, and the language server all consume one stable-ish model.
- Discipline required: it is always tempting to `import { visit } from 'unist-util-visit'`
  in the compiler. The CI check exists because the temptation is real.
