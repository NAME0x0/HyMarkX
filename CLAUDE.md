# HyMarkX — working agreement

Read these before acting; they are the source of truth, not this file:
`VISION.md` · `SPEC.md` · `ARCHITECTURE.md` · `SECURITY.md` · `ROADMAP.md` ·
`BACKLOG.md` · `CONTRIBUTING.md` · `docs/adr/`

## Roles

Claude orchestrates: spec, architecture, ADRs, task briefs, review, docs, acceptance.
Codex implements: production code, tests, tooling — one narrowly scoped brief at a time.
Claude reviews every diff hunk and runs the tests itself before accepting. Claude writes
production code only for edits smaller than the delegation overhead.

## Hard invariants

1. A document containing no HMX construct renders as CommonMark + GFM. Conformance
   suites are a CI gate.
2. Only `@hymarkx/parser` imports micromark / mdast / hast / unified.
3. Every AST node carries a real source span.
4. No regex/string preprocessing of HMX syntax — tokenizer extensions only.
5. Recoverable errors are `Diagnostic`s with stable codes and spans, never throws.
6. Trust mode is host-selected. No document construct can escalate it.
7. Static documents emit zero HMX JavaScript.
8. Syntax changes require an ADR + `SPEC.md` update before code.
9. TypeScript 7 strict, ESM only, no `any` without justification.
10. HMX is not "MDX with more syntax" — reject features that make native HMX approach
    conventional-frontend verbosity.

## Current state

Phases 0-6 complete: `@hymarkx/{ast,parser,compiler,cli}` compile Markdown plus HMX
directives to styled, interactive HTML at 652/652 CommonMark conformance — schema-validated
components, frontmatter, scoped CSS, compile-time expressions, .hmx components, and
component-local state with a 591-byte gzipped runtime. Static documents emit zero JS.

Interactivity is safe in document mode because expressions cannot reach a host object —
the runtime is a security boundary and must never gain an escape hatch without an ADR.

Phase 7 (developer experience: dev server, formatter, language server) is next.

## Naming

`HyMarkX` · `HMX` · `.hmx` · `hmx` · `@hymarkx/*`. No variants.
