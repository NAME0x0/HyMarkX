# Security audit — 0.1

**Date:** 2026-08-18 · **Scope:** `@hymarkx/{ast,parser,compiler,formatter,cli,language-server}`
at commit `ada0272` · **Auditor:** the project itself, which is the main thing to know about it.

This walks every threat in [`SECURITY.md`](../SECURITY.md) and names the test that would fail
if the control were removed. It is not an external review, and nothing here should be read as
one. HyMarkX is pre-release and `SECURITY.md` still says it must not be used to render
untrusted content in production; this document narrows *why* rather than lifting that.

Every reference below is checked by `tests/security/audit.test.mjs`, which fails if a named
file or test no longer exists. A rotted audit is worse than no audit, because it reads as
evidence.

## Verdict

Eleven of thirteen threats have a control with a test behind it. Two do not, and are stated as
open rather than argued away:

- **T5 (build-time RCE)** is closed by construction rather than by defence — there is nothing
  in 0.1 that executes at build time. That is a property of the current feature set, not a
  barrier, and it expires the moment a plugin API lands (ADR-0008 defers it for this reason).
- **T6 (supply chain)** has process, not a test. `pnpm audit` in CI and a pinned lockfile do
  not detect a dependency that is malicious rather than known-vulnerable.

The most substantive finding of this exercise was not in the table below. It was that the
fuzzer written for T9 found a live denial of service on its first run — see
[the writeup in `SECURITY.md`](../SECURITY.md#vulnerabilities-found-and-fixed). One pass of
real fuzzing found a real bug, which is the strongest available argument that the untested
areas above are untested rather than safe.

## Threat-by-threat

### T1 — Stored XSS

Untrusted document rendered on a site. Text positions are escaped, and raw HTML in `document`
mode is filtered against an element and attribute allowlist rather than a blocklist.

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `escapes text positions` |
| `tests/security/security.test.mjs` | `rejects prohibited raw HTML elements` |
| `tests/security/security.test.mjs` | `removes elements and attributes outside the allowlist` |
| `tests/security/security.test.mjs` | `escapes allowed raw-HTML attribute values` |
| `tests/security/security.test.mjs` | `escapes generated Markdown attribute values` |
| `tests/fuzz/pipeline.test.mjs` | `never emits a script tag or dangerous scheme in document trust mode` |
| `tests/security/security.test.mjs` | `cannot break out of the title element` |

The fuzz case matters more than the unit tests here: the unit tests check the inputs somebody
thought of, and 800 generated documents check the ones nobody did.

**Residual risk.** The allowlist is only as good as its contents, and mutation XSS — markup
that parses differently in a browser than in our sanitizer — is not specifically tested for.

### T2 — Scheme injection

`javascript:`, `data:`, `vbscript:` and `file:` URLs, including obfuscated spellings. The
allowlist is applied *after* expression evaluation, so a scheme assembled at compile time is
still checked.

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `drops javascript links` |
| `tests/security/security.test.mjs` | `drops javascript image sources` |
| `tests/security/security.test.mjs` | `drops entity-obfuscated URL schemes` |
| `tests/security/security.test.mjs` | `drops tab-obfuscated URL schemes` |
| `tests/security/security.test.mjs` | `drops data URLs from images` |

### T3 — Attribute injection

An expression result breaking out of the attribute it was interpolated into.

| Evidence | |
|---|---|
| `packages/compiler/test/expressions.test.ts` | `HTML-escapes interpolation results` |
| `tests/security/security.test.mjs` | `escapes generated Markdown attribute values` |
| `tests/security/security.test.mjs` | `cannot break out of the description attribute` |
| `tests/security/security.test.mjs` | `cannot inject through the language attribute` |

Document emission (0.0.4) routes frontmatter into `<title>` text, a `<meta content>` attribute
and the `lang` attribute. `lang` is additionally validated against a BCP-47 shape rather than
only escaped, because a language tag is a constrained vocabulary and escaping alone would leave a
safe attribute containing nonsense. Each of the three tests above was confirmed to fail with its
protection removed.

### T4 — Privilege escalation

A document trying to turn on scripting. The trust mode is a host parameter; no directive,
attribute or frontmatter key reads or writes it.

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `does not allow document content to escalate trust` |
| `tests/security/security.test.mjs` | `passes trusted raw HTML and schemes only when the host selects app mode` |
| `packages/compiler/test/islands.test.ts` | `refuses islands in document trust mode` |

### T5 — Build-time RCE — **open, closed by construction**

Nothing in 0.1 executes during a build. Foreign components are recorded as islands and never
resolved, imported or run by the compiler; the emitted output references them, and it is the
consuming bundler that ever loads them.

| Evidence | |
|---|---|
| `packages/compiler/test/islands.test.ts` | `records a reference and emits only a placeholder` |
| `packages/compiler/test/islands.test.ts` | `refuses the specifier %j` |
| `packages/compiler/test/islands.test.ts` | `reports the runtime cost so it is not silent` |

The specifier refusal list includes `//evil.test/x.js`. Protocol-relative URLs were not in the
first draft of that list and were added after the case was written out explicitly — worth
recording, because it is the shape of hole that a "rejects absolute URLs" check misses.

**Residual risk.** This is the absence of a feature, not a defence. A plugin API, a build-time
data loader, or executing a component to prerender it would each reopen it, and none would be
caught by the tests above.

### T6 — Supply chain — **open, process only**

| Control | Status |
|---|---|
| Minimal dependency set | ADR-0003 records the rationale for each |
| Pinned lockfile | committed |
| `pnpm audit` in CI | runs |
| Hand-written Node type declarations | no `@types/node`, bounding the host surface |

**Residual risk.** All of this detects *known-vulnerable* dependencies. None of it detects a
dependency that is deliberately malicious, and the parser depends on a dozen micromark and
mdast packages by design. No test can close this one.

### T7 — Secret leakage

The expression language cannot reach `process`, `env`, or any host object; identifiers resolve
from frontmatter and component-local state only.

| Evidence | |
|---|---|
| `packages/compiler/test/expressions.test.ts` | `resolves identifiers only from frontmatter` |
| `packages/compiler/test/expressions.test.ts` | `never exposes inherited or forbidden properties` |
| `packages/compiler/test/interactivity.test.ts` | `rejects host global %s at compile time` |
| `packages/compiler/test/interactivity.test.ts` | `rejects forbidden member access in a handler at compile time` |

The host-global rejection is compile-time and covers unreachable branches too — a handler that
touches `window` inside a branch that can never run is still refused, because "unreachable"
is a property of today's constant folding rather than a guarantee.

### T8 — Prototype pollution via attributes

| Evidence | |
|---|---|
| `packages/ast/test/attributes.test.ts` | `creates a null-prototype, last-wins record` |
| `packages/ast/test/attributes.test.ts` | `skips forbidden names without polluting Object.prototype` |
| `packages/ast/test/attributes.test.ts` | `matches forbidden names case-sensitively` |
| `packages/compiler/test/islands.test.ts` | `gives props a null prototype so a prop name cannot reach Object.prototype` |

Case sensitivity is tested deliberately: `__PROTO__` is not `__proto__` to a JavaScript object,
and a case-insensitive check that rejected it would give the wrong impression of what the
forbidden list is for.

### T9 — Parser denial of service

micromark is linear by construction, nesting depth is capped, and the whole pipeline is fuzzed.

| Evidence | |
|---|---|
| `tests/fuzz/pipeline.test.mjs` | `never throws, and always produces re-parseable output` |
| `packages/parser/test/hang-regression.test.ts` | `terminates for %s after an unterminated attribute block` |
| `packages/parser/test/hang-regression.test.ts` | `terminates for the original fuzz input` |
| `tests/benchmarks/performance.test.mjs` | `compile time grows about linearly with document size` |

This is the one threat where the control has been shown to work, because it caught a live
infinite loop reachable from untrusted input with default options. See `SECURITY.md`.

**Residual risk.** 2,800 fuzz cases from one seed is a smoke test, not a campaign — it is
seeded and reproducible rather than continuous, and it explores the fragment grammar it was
given. The linearity gate catches a quadratic only once it dominates the compile
([why](research/performance.md#what-the-gate-actually-catches)).

### T10 — Path traversal

Resolution is confined to the project root, checked against the *real* path so a symlink cannot
step outside it.

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `rejects an input-relative output path that escapes --out` |
| `tests/security/security.test.mjs` | `rejects an explicit component path outside the project root` |
| `tests/security/security.test.mjs` | `rejects a discovered component directory whose real path escapes the project root` |

### T11 — Entity-expansion denial of service in frontmatter

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `rejects billion-laughs expansion with HMX2021 in under two seconds` |

The time bound is part of the assertion. A test that only checked the diagnostic would pass
while the parser took a minute to produce it.

### T12 — Tag-driven object construction in frontmatter

YAML is parsed with `schema: 'core'`, `customTags: []`, `merge: false`, `stringKeys: true`.

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `does not construct values from language-specific tags` |

### T13 — Prototype pollution via frontmatter keys

| Evidence | |
|---|---|
| `tests/security/security.test.mjs` | `rejects forbidden keys and leaves Object.prototype unpolluted` |

Frontmatter reuses the same forbidden-key list as directive attributes, so the two cannot
drift apart.

## What was not audited

- **Timing side channels**, **enormous inputs**, and **malicious npm components in `app` mode**
  remain the declared non-goals in `SECURITY.md`. Unchanged.
- **The `app` mode surface** is only as safe as the host's decision to enable it. Its tests
  check that HMX still escapes text positions and still refuses to build `javascript:` URLs,
  not that a trusted document is harmless.
- **The generated runtime** (591 B) has not been reviewed as an attack surface in its own
  right, only tested for behaviour.
- **No external review, no third-party pentest, no bug bounty.** The auditor wrote the code.
