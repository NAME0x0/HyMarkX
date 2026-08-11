# ADR-0006 — No intermediate representation until a second backend needs one

**Status:** Accepted · 2026-08-11 · revisit at Phase 4

## Context

The charter suggests an IR between the source AST and backends: AST records what the
author wrote, IR records what it means after resolution and lowering. That is sound
compiler design — and it is also the classic way a young project acquires a layer that
costs maintenance and buys nothing, because there is exactly one backend to serve.

## Decision

No IR in Phases 1–3. The HTML backend consumes the analysed AST directly, but does so
through a `Backend` interface:

```ts
interface Backend<TOptions = unknown> {
  readonly name: string
  emit(doc: AnalyzedDocument, options: TOptions): EmitResult
}
```

An IR is introduced when one of these is true, and not before:

1. A second backend exists and duplicates lowering logic the first backend already does.
2. An optimization pass needs a representation the source AST cannot express cleanly
   (likely at Phase 4 expressions or Phase 6 reactivity).
3. Source-map generation becomes intractable without an explicit lowering step.

## Consequences

- Less code now, and the code that exists is about HMX rather than about architecture.
- Inserting an IR later modifies `compiler` and each backend — bounded, because the
  interface already isolates emission.
- Risk accepted: if lowering logic accumulates inside the HTML backend before the
  trigger fires, extraction gets harder. Mitigation: lowering lives in
  `compiler/transform/`, never in the backend, and reviews enforce it.
