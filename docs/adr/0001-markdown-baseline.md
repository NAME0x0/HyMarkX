# ADR-0001 — Markdown baseline is CommonMark + GFM

**Status:** Accepted · 2026-08-11

## Context

"Markdown-compatible" is meaningless without naming a dialect. Candidates: original
Markdown.pl (underspecified, ~20 known ambiguities), CommonMark 0.31.2 (precisely
specified, 650+ example conformance suite, reference implementations), GFM (CommonMark
plus tables, task lists, strikethrough, autolinks — what people actually type), or a
kitchen-sink dialect (footnotes, definition lists, math, admonitions).

## Decision

The baseline is **CommonMark 0.31.2 + GFM**. A conforming processor must render the
full CommonMark example suite identically to the reference implementation.

Beyond GFM — footnotes, math, definition lists — are **extensions**, off by default,
enabled by configuration. They are not part of the compatibility guarantee.

## Alternatives considered

- *CommonMark only* — cleanest conformance story, but a table-less "Markdown" language
  in 2026 fails the "ordinary Markdown just works" promise on contact with reality.
- *Kitchen sink* — every extension enlarges the surface that HMX syntax must avoid
  colliding with, and weakens the claim that a document degrades gracefully elsewhere.

## Consequences

- The conformance suite is a hard CI gate from Phase 1 onward.
- Every HMX syntax proposal must be checked against both suites for collisions.
- GFM's autolink literals and tables constrain where new punctuation can live.
- Admonition syntaxes popular elsewhere (`> [!NOTE]`) are *not* baseline; if HMX wants
  them, they arrive as directives, keeping one extension mechanism.
