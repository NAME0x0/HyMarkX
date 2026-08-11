# ADR-0007 — Two host-selected trust modes

**Status:** Accepted · 2026-08-11

## Context

HMX will be used for two incompatible things: rendering content that may be untrusted
(a docs site accepting contributions, a CMS, a note-taking app, AI-generated output),
and building applications from content the developer wrote. A single mode cannot serve
both without either crippling applications or making untrusted rendering unsafe.

MDX resolves this by not resolving it: an MDX file *is* a JavaScript module, so
rendering untrusted MDX is equivalent to running untrusted code. HMX should not inherit
that property, because "safe by default" is one of the few things it can offer that
MDX structurally cannot.

## Decision

Two modes, `document` (default) and `app` (opt-in), with the boundary specified in
`SECURITY.md` and normatively in `SPEC.md` §7.

The decisive rule: **the mode is supplied by the host** — CLI flag, API option, or
project config. No construct inside a document can select, request, or escalate it.
Frontmatter cannot. A directive cannot. A comment cannot.

Defaulting to `document` means the unsafe path requires a deliberate act.

## Alternatives considered

- *Single trusted mode.* Simplest, and forfeits the differentiator plus every
  untrusted-content use case.
- *Per-document opt-in via frontmatter.* Ergonomic and fatally wrong: an attacker
  supplies the document, therefore an attacker supplies the frontmatter.
- *Capability grants per feature* (`--allow-scripts`, `--allow-net`). Finer-grained and
  attractive later; two coarse modes are easier to reason about and to test now. The
  mode record is a struct, not a boolean, so capabilities can be split later without a
  breaking change.

## Consequences

- Every feature added from here on must state its behaviour in both modes. A feature
  whose `document`-mode behaviour is "not available" is fine; a feature that has not
  considered the question is not reviewable.
- The security suite must include escalation attempts, which must fail.
- `hmx build --trust app` (or config) is the explicit gesture. Its name should make the
  user aware of what they are asserting.
