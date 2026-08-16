# ADR-0014 — State is component-local, reactivity is compiled, and the `@` family is rejected

**Status:** Accepted · 2026-08-16

## Context

Phase 6 is the phase the whole thesis rests on: native interactivity without a framework.
`prototypes/interactivity/` proved the mechanism (gate passed 2026-08-12) — a counter in
492 bytes gzipped, expressions compiled to an instruction tree, no `eval`. What it did not
prove is a *model*: it used page-level state with a trivial dependency graph, which is
where reactivity is easy.

Charter §43 asks for the lifecycle to be defined before any syntax ships. This record does
that, and closes the syntax question ADR-0002 deferred twice.

## Decisions

### 1. The `@`-statement family is rejected

`@state count = 0` was the charter's north-star spelling and has been "decide later, with
evidence" since ADR-0002. The evidence is now in: **six phases have shipped entirely on
directive syntax with no recorded ergonomic complaint.** Directives carry components,
frontmatter, children markers, and expressions.

State uses `::state{count=0}`. It parses today, needs no tokenizer, and cannot collide with
prose — whereas a line beginning `@` is legal Markdown that appears in changelogs, mentions,
and email addresses, and would have to be defended against forever.

**HMX has one syntax family. It keeps it.** Reopening requires new evidence that authors are
materially hindered, not that another spelling reads slightly nicer in a slide.

`SPEC.md` Appendix A stops reserving leading `@`.

### 2. State is component-local

Each expansion of a component owns its state. Two `:::Counter` instances count
independently — the alternative is obviously wrong, and discovering it after shipping would
be a breaking change.

The page document is simply the outermost component, so "page-level state" is state declared
in the page. One rule, no special case.

State is **not** visible to child components. A child receives values through props, exactly
as in Phase 5. There is no ambient store, no context, no provide/inject. If that turns out to
be a real constraint, the answer is an explicit mechanism with its own ADR.

### 3. Reactivity is compiled, and Phase 6 ships state→view only

The compiler already knows which text and attribute positions depend on which names — that
is what the Phase 4 expression checker computes. It emits those dependencies as a table; the
runtime updates exactly the marked nodes when a name changes. No virtual DOM, no diffing, no
component re-render.

**Named derived state is deferred.** This is the load-bearing scope decision, so it is worth
being plain about why: without state→state edges there is no dependency *graph*, only a tree
of state→view edges. That removes update ordering, glitch avoidance, batching, and cycle
detection — the four problems that forced Svelte through several redesigns.

Expressions in text are still derived values; they simply cannot be named and reused. When
naming them is needed, it arrives with its own ADR and its own hard questions, rather than
being smuggled in alongside the first interactive release.

A document that cannot express a cycle cannot deadlock, and that is worth more in Phase 6
than expressiveness.

### 4. Events are an allowlist, and assignment is legal only inside them

`on-click`, `on-input`, `on-change`, `on-submit`, `on-focus`, `on-blur`, `on-keydown`.
An allowlist rather than `on-*`, so the runtime ships only what is used and no attribute can
smuggle in a handler the compiler has not seen.

ADR-0004 prohibits assignment in expressions. Event handlers are the **single** carve-out:
inside a handler, assignment to a declared state name is permitted, and nothing else changes.
An assignment to an undeclared name is a compile error.

### 5. Interactive documents are allowed in `document` mode

This is the payoff for ADR-0004 and it should be claimed deliberately.

Because expressions are a restricted pure sub-language with no `eval`, no host access, and no
function calls, a document can be interactive *and* untrusted at the same time. The runtime
exposes nothing beyond the state the document declared: no DOM handle, no network, no
storage, no globals. **MDX cannot offer this**, because its content is a JavaScript module.

Constraint that makes it true: a handler may only assign to declared state and read declared
state. If a future feature would let a handler reach further, it belongs behind `app` mode.

### 6. Rendering, serialization, hydration

Initial state values are compiled into the emitted HTML, so the page is correct before any
script runs. The runtime attaches listeners and patches the marked nodes — it never re-renders
from scratch, so there is no hydration mismatch to reconcile.

State values are the same restricted scalars expressions already handle: string, number,
boolean, null. Nothing else serializes, and nothing else needs to.

### 7. The runtime has a byte budget, enforced by test

The prototype's counter runtime was 367 bytes gzipped. The budget for the full Phase 6
feature set is **1.5 KB gzipped**, asserted in `tests/output-size/`. A document with no
interactive construct still emits **zero** bytes.

A budget that is not a failing test is a wish.

## Alternatives considered

- **Signals at runtime** (SolidJS-style). More flexible, and it moves dependency tracking
  into shipped bytes for a language whose advantage is doing that work at compile time.
- **Page-level state only**, as in the prototype. Simpler, and wrong the first time anyone
  uses a component twice.
- **Named derived state in Phase 6.** Rejected above; it is the whole hard part.
- **Interactivity restricted to `app` mode.** Safe and needlessly timid — it would discard
  the one capability the restricted expression language was designed to buy.
- **`@state` syntax.** Rejected on six phases of evidence.

## Consequences

- Phase 6 is genuinely shippable: state→view reactivity, component-local, no graph.
- The runtime must stay under budget as features arrive, which will force real decisions
  later. That is the intended pressure.
- Two components cannot share state. That will be the first complaint, and the honest answer
  is "not yet, and here is the ADR that would decide it".
- Allowing interactivity in `document` mode makes the runtime a security boundary. It must
  never gain an escape hatch without an ADR and a threat-model update.
