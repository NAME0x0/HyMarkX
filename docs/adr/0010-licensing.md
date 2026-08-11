# ADR-0010 — Dual licence `MIT OR Apache-2.0`, with a separate trademark policy

**Status:** Accepted · 2026-08-11

## Context

HyMarkX needs a licence before anything is published. The decision is close to
irreversible: released code cannot be pulled back under stricter terms, and a language
nobody is legally comfortable adopting is a dead language.

Three properties of *this* project drive the choice, and they are not the generic ones:

1. **The runtime ships inside other people's projects.** From Phase 6, HMX emits runtime
   code that is embedded in every site built with it. Any licence with reciprocal
   obligations — MPL, LGPL, AGPL — turns "what licence is my website now?" into a question
   users must ask a lawyer. For a language, that question alone ends adoption.
2. **The whole dependency stack is MIT** — micromark, mdast, unified. Verified on npm,
   2026-08-11. Comparable projects are MIT too: MDX, Markdoc, Astro, Svelte, Vue, Vite.
   TypeScript is the notable Apache-2.0 outlier.
3. **The name is the asset.** HMX's compatibility guarantee is only meaningful if `.hmx`
   means one thing. That is a trademark concern, not a copyright one.

## Decision

**`MIT OR Apache-2.0`** — the recipient chooses. Both texts live at the repository root as
`LICENSE-MIT` and `LICENSE-APACHE`; every package manifest declares
`"license": "MIT OR Apache-2.0"`.

Alongside it:

- **`TRADEMARK.md`** reserves `HyMarkX`, `HMX`, `.hmx`, `hmx`, and `@hymarkx`. Trademark is
  independent of the code licence and survives permissive licensing. Forks are welcome;
  forks called HyMarkX are not.
- **An explicit output clause**, stated in `README.md` and here: *compiler output, and the
  runtime embedded in that output, impose no licensing obligation on the user's own
  content.* GCC required a formal Runtime Library Exception for this situation; under
  permissive licensing an unambiguous statement is sufficient, and its absence reliably
  causes confusion.
- **A CLA before the first outside contribution**, if relicensing or selling exceptions is
  ever wanted. A DCO certifies that a contributor had the right to submit their work; it
  does **not** grant the project rights to relicense. Conflating the two is how
  relicensing attempts fail years later.

Copyright is attributed to "The HyMarkX Authors" rather than an individual, so the
attribution does not need rewriting as contributors join.

## Alternatives considered

- **Plain MIT.** The ecosystem reflex and 95% as good. Rejected only because it offers no
  explicit patent grant and says nothing about trademark. Remains the sensible fallback if
  two licence files ever prove to be friction.
- **Plain Apache-2.0.** Best patent and trademark posture, and TypeScript's choice. Rejected
  because Apache-2.0 is incompatible with GPLv2, and HMX's runtime is embedded in user
  output — so a GPLv2-licensed site built with HMX would face a real conflict. Low
  probability, real consequence, entirely avoidable.
- **MPL-2.0.** File-level copyleft is a genuine middle ground, but it needs a runtime
  carve-out and guarantees a permanent stream of "is my site MPL now?" questions.
- **AGPL + commercial dual.** Preserves a monetisation path; many organisations ban AGPL by
  policy. For a language, that is adoption suicide.
- **BSL 1.1 / source-available.** Not open source. Blocks distro packaging, chills
  contribution, and signals "don't build on this" — the opposite of what a language needs.
- **Staying unlicensed until Phase 9.** Maximally reversible and briefly considered, since
  nothing usable ships before then. Rejected because clarity now costs nothing and removes
  a reason for early contributors and evaluators to hesitate.

## Consequences

- Anyone may use, fork, embed, and sell HMX. That is intended.
- Monetisation, if it ever happens, must come from hosting, tooling, support, or the
  trademark — not from the compiler's licence. This is accepted deliberately.
- Dual licensing is unusual in the JavaScript ecosystem and will occasionally prompt
  questions. Rust has run this model for a decade; the README answers it in one line.
- Dependency compatibility is automatic: MIT dependencies impose only attribution.
- Apache-2.0's NOTICE convention applies to the Apache option; no NOTICE file is required
  unless we add third-party code that carries one.

## Not legal advice

This ADR records an engineering decision. Anything commercial should be reviewed by a
lawyer before it matters.
