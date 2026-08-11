# Contributing to HyMarkX

The project is pre-alpha and not yet accepting outside contributions, but the workflow
below is normative for everyone working on it, human or machine.

## Development

```bash
pnpm install
pnpm build       # typecheck + build all packages
pnpm test        # vitest, all suites
pnpm lint        # oxlint
pnpm format      # prettier --write
pnpm check       # lint + typecheck + test — must pass before any commit
```

Requirements: Node ≥ 22.12, pnpm ≥ 9.

## Non-negotiable rules

1. **The compatibility guarantee.** Any input containing no HMX construct must produce
   Markdown-baseline output. The conformance suites enforce it; do not skip them.
2. **The parser boundary.** Only `@hymarkx/parser` may import micromark, mdast, hast, or
   unified packages. CI enforces this.
3. **Spans everywhere.** Every AST node carries a real source position. Dropping spans
   is a bug, not an optimization.
4. **No string preprocessing of HMX syntax.** All syntax goes through the tokenizer.
   Regex passes over source break code fences, escaping, and positions.
5. **Diagnostics, not throws.** Recoverable problems produce a `Diagnostic` with a
   stable code and a span. Never `throw` for user error.
6. **Both trust modes.** Every feature states its behaviour in `document` and `app`
   mode. "Not considered" is not reviewable.
7. **No `any`** without a comment justifying it.

## Change control for language syntax

Changing HMX syntax requires, in order:

1. A statement of the problem with real examples.
2. Alternatives compared, including doing nothing.
3. An ambiguity analysis against the CommonMark and GFM suites.
4. A Markdown-compatibility assessment (SPEC §3).
5. A migration-cost assessment.
6. An ADR in `docs/adr/`, and a `SPEC.md` update.
7. Implementation, with tests.
8. Documentation updates.

Grammar must never be changed directly in code. Code follows the spec, not the reverse.

## Definition of done

A change is done when **all** of the following hold:

- [ ] Behaviour is specified in `SPEC.md` (for language changes)
- [ ] Implementation exists and matches the spec, not a reinterpretation of it
- [ ] Tests pass, including the conformance suites
- [ ] Edge cases considered: nesting, escaping, malformed input, empty input, CRLF
- [ ] Diagnostics are useful — code, span, expectation, and where possible a suggestion
- [ ] Security implications reviewed for both trust modes
- [ ] Documentation and ADRs updated
- [ ] No known blocking regression

"It compiles" and "the tests I wrote pass" are not the definition of done.

## Bugs

For every reproducible bug: minimize the reproduction, state expected behaviour,
classify severity, add a regression test that **fails before the fix**, then fix it.
A fix without a failing-first test is not accepted.

## Scope discipline

Do not add unrelated improvements to a change. Record the idea in `BACKLOG.md` with a
priority and continue with the current objective. Silent scope expansion is the most
common way a change becomes unreviewable.
