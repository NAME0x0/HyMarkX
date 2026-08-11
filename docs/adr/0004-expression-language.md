# ADR-0004 — Expressions are a restricted pure sub-language, not JavaScript

**Status:** Accepted (direction) · 2026-08-11 · implementation deferred to Phase 4

## Context

The single most consequential language decision. Options:

1. **Full JavaScript expressions** (MDX's answer). Familiar, zero design work, infinite
   power.
2. **A restricted expression language** (Markdoc's answer, Vue template expressions,
   Liquid). Analysable, sandboxable, portable.
3. **Typed DSL** with its own type system. Maximum safety, maximum cost.

Full JS is convenient and it is also the thing that makes `document` mode impossible.
If an expression can reach `globalThis`, then "render this untrusted document safely"
cannot be honoured, static analysis degrades to "run it and see", SSR/CSR parity
becomes a runtime question, and the language quietly becomes JavaScript-defined —
which forfeits framework neutrality.

## Decision

HMX expressions are a **restricted, pure, side-effect-free sub-language**:

Permitted: literals (string, number, boolean, null), identifiers bound in the current
scope, member access `a.b`, index access `a[b]`, unary `! - +`, binary arithmetic and
comparison, `&&` `||` `??`, ternary, optional chaining, array/object literals, and
calls to **explicitly registered** functions only.

Prohibited: assignment (outside event handlers, Phase 6), `new`, function/arrow
literals, `this`, template literals with tagged functions, `import`, `await`,
generators, regex literals, and any reference not resolvable in the declared scope.
Unresolvable identifiers are a **compile error** (`HMX2020`), not `undefined`.

Full JavaScript stays available in `app` mode through `<script>` — the escape hatch,
explicitly gated, not the default.

## Alternatives considered

- *Full JS.* Rejected: kills `document` mode (SECURITY T1/T5/T7), kills static
  analysis, makes SSR semantics implementation-defined. Recorded in `BACKLOG.md`.
- *Typed DSL.* Deferred: type inference over template expressions is a large project
  with unclear payoff before we have component props to type. Phase 8 may revisit once
  TSX interop defines a type source.

## Consequences

- `document` mode can evaluate expressions safely — a genuine capability MDX cannot
  offer, and part of HMX's differentiation.
- Errors improve: "unknown identifier `usre`, did you mean `user`?" is possible because
  the scope is closed.
- Static analysis, dead-code elimination, and pre-rendering of constant subtrees all
  become tractable.
- Cost: we own a grammar, a parser, an evaluator, and a checker. Roughly 1500 lines,
  and every "why can't I just…" question forever after. Accepted deliberately.
- The syntax should be a strict subset of JavaScript's expression grammar so that
  editors, highlighters, and human intuition transfer. Deviating from JS syntax while
  restricting JS semantics would be the worst of both.
