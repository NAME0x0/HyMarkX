# Agent instructions

For coding agents working in this repository: Codex, Claude Code, Cursor, Copilot, and
anything else that reads a conventions file.

**Read [`llms.txt`](llms.txt) first.** It is the canonical description of the language and
lists the mistakes that are actually common. Everything below is about working on the
*repository*, not about writing `.hmx` documents.

## Before changing anything

Read [`CLAUDE.md`](CLAUDE.md) for the hard invariants. The ones that get violated most:

1. **A document with no HMX construct must render as CommonMark + GFM.** The conformance
   suite (652 examples) is a CI gate and has never regressed across seven syntax additions.
   If your change moves that number, the change is wrong — do not adjust the suite.
2. **Only `@hymarkx/parser` may import micromark, mdast, hast, or unified.** Enforced by
   `scripts/check-boundaries.mjs`, not by convention.
3. **Only `@hymarkx/cli` and `@hymarkx/language-server` may touch `node:` builtins.**
   Everything else must run unchanged in a browser.
4. **Every AST node carries a real source span.** Dropping spans is a bug, not a shortcut.
5. **Recoverable problems are `Diagnostic`s with stable codes**, never thrown exceptions.
6. **Syntax changes need an ADR and a `SPEC.md` update before code.**

## Verification is not optional

```bash
pnpm check            # build, lint, typecheck, test, boundary check
pnpm format:check
```

`pnpm check` runs `pnpm build` first, because several suites import workspace packages by
name and resolve through `dist/`. A green local run without building proves nothing.

Do not report success on the basis that code compiles. Every task in this project that
reported success while carrying a real defect did so by trusting a step it had not run —
a failing typecheck, a hidden workaround, a conformance regression, a verification using a
library that was not installed.

## Where decisions live

Nothing important lives in commit messages or chat. If you are about to make a judgement
call, it is probably already recorded:

- [`docs/adr/`](docs/adr/) — 15 decision records, each with the alternatives that were
  rejected and why. Read the relevant one before re-opening a settled question.
- [`BACKLOG.md`](BACKLOG.md) — has a **Rejected** section. Ideas there were considered and
  declined with reasons; do not propose them again without new evidence.
- [`docs/tasks/`](docs/tasks/) — one brief per task, each with its review outcome, including
  what went wrong.

## Scope discipline

Do not add unrelated improvements to a change. Record the idea in `BACKLOG.md` and continue
with the current objective. Silent scope expansion is how a change becomes unreviewable.

If a task appears to require changing `@hymarkx/ast` or `@hymarkx/parser`, **stop and say
so** rather than changing them. Those are contracts; six of seven phases needed no change to
either.

## Documentation is executed

Every fenced `md` example in `README.md` and `docs/guides/` is compiled by the test suite
(`tests/guides/`). An example that stops working fails the build. Do not write plausible
examples — write ones you have compiled.

The same applies to `assets/evolution.svg`: it is generated from real compiler output by
`scripts/generate-evolution-svg.mjs`, and a test asserts its byte counts still match what
the compiler emits.
