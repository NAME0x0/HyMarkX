# ADR-0008 — No public plugin API before the compiler phases stabilize

**Status:** Accepted · 2026-08-11 · revisit at Phase 9

## Context

An extension API is the hardest thing in a compiler to change after adoption: every
hook is a promise about internal structure. Exposing hooks now would freeze a pipeline
that ADR-0006 explicitly expects to grow an IR.

## Decision

No public plugin API in 0.0.x. Extensibility is delivered internally:

- built-in components registered through an internal registry
- transform passes composed inside `@hymarkx/compiler`
- backends behind the `Backend` interface (internal, unversioned)

The public surface is `compile()`, `parse()`, and the CLI. Nothing else is supported,
and `package.json` `exports` restricts deep imports so this is a mechanical fact rather
than a request.

## Consequences

- No third-party ecosystem yet. Correct for a language with unstable syntax.
- When an API arrives it is versioned independently of the compiler, with a stated
  stability tier per hook.
- If external demand appears before Phase 9, the answer is a documented fork point or a
  narrow, explicitly experimental component-registration API — not the whole pipeline.
