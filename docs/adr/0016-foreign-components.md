# ADR-0016 — Foreign components are framework-agnostic islands, never executed at build time

**Status:** Accepted · 2026-08-17

## Context

Phase 8 is TS/TSX interoperability. Charter §41 asks whether HMX can import TSX and whether
TSX can import HMX; charter §7 says TSX must remain an escape hatch rather than a
foundation.

Two measurements shape the answer. The four-way comparison
([`docs/research/comparison.md`](../research/comparison.md)) puts React's production runtime
at **45,083 B gzipped** — thirty times HMX's entire first-visit payload for the same
dashboard. And `SECURITY.md` threat T5 is build-time remote code execution, which any design
that runs an imported module during compilation walks straight into.

The reason someone reaches for TSX is also worth naming honestly: they need something HMX
cannot express — a chart, a map, a rich editor. Those run in a browser. Build-time-only
interop would be safe and largely useless for the actual motivating case.

## Decisions

### 1. The contract is framework-agnostic; React is an adapter, not a dependency

VISION lists framework neutrality as non-negotiable. Hardcoding React would make it false,
so the language defines a **foreign component contract** — a module path plus serialisable
props — and knows nothing about what renders it. A React adapter satisfies the contract. So
does anything else.

HMX will never import React. The adapter lives outside the compiler, and the compiler's
tests do not depend on any framework.

### 2. Foreign components are client islands, marked explicitly

```md
::island{from="./Chart.tsx" export="RevenueChart" series="monthly"}
```

The compiler emits a placeholder element and an entry in an **island manifest** on the
compile result. It does not resolve the path, read the file, or render anything.

Islands are explicit rather than inferred from an import statement, because the cost is
large and a reader deserves to see it at the call site.

### 3. The compiler never executes foreign code

This is the load-bearing security decision. `hmx build` does not import, transpile, or
evaluate the referenced module. It records a reference.

That closes threat T5 completely rather than mitigating it: there is no build-time execution
path to attack, so no sandbox to get wrong. The cost is that `hmx build` alone does not
produce a runnable island — bundling is a host responsibility (see 5).

### 4. `app` trust mode only, and the byte cost is reported

An island in `document` mode is `HMX3010` (error). An untrusted document cannot cause a host
to load arbitrary modules.

In `app` mode, every island emits `HMX2070` (info) naming the module and stating that a
framework runtime will be required. Making the cost visible in the diagnostic stream is the
same instinct as the runtime byte budget: a cost that is not surfaced becomes a cost nobody
notices.

### 5. HMX does not bundle, and does not pretend to

Charter §19 forbids a bespoke bundler. The compiler emits the manifest; a host integration —
Vite, esbuild, whatever — resolves and bundles the modules. That integration is Phase 10
work, not this phase.

Phase 8 therefore delivers a *contract with a proof*, not a turnkey feature. An end-to-end
demonstration lives under `benchmarks/`, using esbuild as a development dependency, so the
contract is shown to work without the compiler acquiring a bundler.

### 6. Props are the same restricted scalars as everywhere else

String, number, boolean, null — the values expressions already produce, serialised into the
manifest as JSON. No functions, no objects with behaviour, no children passed into a foreign
component at this version.

A prop that cannot be serialised is `HMX2071` (error). Passing a callback into a foreign
component would require a shared runtime bridge, which is a much larger design than this
phase should smuggle in.

### 7. TSX importing HMX is deferred

The reverse direction — a React app importing a `.hmx` file as a component — is a bundler
loader problem rather than a language problem. It belongs with the Phase 10 integrations, and
nothing in this ADR precludes it.

## Alternatives considered

- **Run the component at build time and inline its HTML.** Zero runtime, no framework
  shipped, and it walks directly into T5: compiling a document would execute code from a
  path the document chose. Also useless for the charts and editors that motivate interop.
- **Infer islands from ordinary `import` statements.** Familiar from MDX, and it hides a
  45 KB decision inside a line that looks like bookkeeping.
- **Depend on React directly** and ship a first-class React integration. Simpler, better
  ergonomics, and it makes "framework neutral" a marketing claim rather than a property.
- **Bundle with esbuild inside `hmx build`.** Convenient, and it makes the compiler a
  bundler — the thing charter §19 exists to prevent — while adding a native dependency that
  breaks the browser-safety rule for `@hymarkx/compiler`.

## Consequences

- A page with no island is byte-identical to today. Output proportionality survives: pages
  pay for a framework only when they ask for one.
- `hmx build` output for an island-using document is **not runnable on its own**. This is a
  real limitation and must be documented as such rather than glossed.
- The compiler stays free of framework dependencies and of any code-execution path, so this
  phase adds no new attack surface to the build.
- Passing children or callbacks into a foreign component is impossible today. That will be
  the first complaint, and the honest answer is that it needs a runtime bridge and its own
  ADR.
