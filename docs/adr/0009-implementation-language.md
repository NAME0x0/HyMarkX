# ADR-0009 — TypeScript 7, ESM only, Node ≥ 22.12

**Status:** Accepted · 2026-08-11

## Context

HMX targets the web ecosystem, must interoperate with JS/TS, must run in a browser
(playground, in-page rendering), and needs contributors. Rust/WASM is the reflexive
choice for compiler projects and would cost browser simplicity, contributor
accessibility, and interop for a performance benefit nobody has measured a need for.

Versions verified on npm, 2026-08-11: TypeScript `7.0.2` (latest, the native port),
vitest `4.1.10`, micromark `4.0.2`.

## Decision

- **TypeScript 7**, `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  and `erasableSyntaxOnly`. `any` requires a comment justifying it.
- **ESM only.** No CJS build. The unified ecosystem is ESM-only already.
- **Node ≥ 22.12** for tooling; the compiler core imports no `node:` builtins, so it
  runs in browsers and edge runtimes. Only `@hymarkx/cli` touches the filesystem.
- **pnpm** workspaces; **vitest**; **oxlint**; **prettier**.

## Alternatives considered

- *Rust core + WASM.* Faster, and a browser story that means shipping a wasm blob,
  plus a second toolchain, plus far fewer contributors, for a bottleneck that has not
  been demonstrated. Revisit only with a benchmark showing parse or compile time is the
  binding constraint on real projects.
- *JavaScript with JSDoc types.* Cheaper build, weaker guarantees for a compiler where
  the AST is the product. Rejected.
- *TypeScript 6.* One major behind; TS 7 is the current stable release and its
  compile-speed improvement matters for a monorepo we will typecheck constantly.

## Consequences

- Migration risk from TS 7 being recent is real but bounded — it is `latest`, and
  pinning the lockfile contains it.
- Performance-sensitive hot paths may later become native addons or WASM *modules*
  behind an interface, without rewriting the project.
- `erasableSyntaxOnly` forbids enums and parameter properties, which keeps the code
  compatible with Node's native type stripping. Intentional constraint.
