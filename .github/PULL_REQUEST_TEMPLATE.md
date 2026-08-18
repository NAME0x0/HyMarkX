## What this changes

<!-- One or two sentences. What behaviour is different afterwards? -->

## Why

<!-- What problem this solves. If it fixes a bug, what was the failure? -->

## Checklist

- [ ] `pnpm check` passes
- [ ] Tests cover the change, and I confirmed they **fail** without it
- [ ] Conformance suites still pass (`652/652` CommonMark, `40/40` GFM) — never regress these
- [ ] Syntax changes carry an ADR and a `SPEC.md` update (see `CONTRIBUTING.md`)
- [ ] New diagnostics are listed in `SPEC.md` Appendix B
- [ ] Generated assets regenerated if manifests or compiler output changed (`pnpm assets`)

## Notes for the reviewer

<!--
Anything you are unsure about, or a decision that could reasonably have gone the other way.
"I considered X and chose Y because Z" is more useful here than a clean summary.
-->
