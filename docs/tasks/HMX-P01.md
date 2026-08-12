# TASK HMX-P01 — Throwaway interactivity prototype (gate evidence)

**Status:** in progress · **Assignee:** Codex · **Not production code**

## CONTEXT

`ROADMAP.md` places a go/no-go gate before Phase 4: *is there a credible, demonstrated path
to native interactivity, or are we building a content publisher with different
punctuation?* The gate requires a working prototype as evidence, not an argument.

We are running it **before** Phase 3, because if the answer is no, styling was wasted work.

## THIS IS A PROTOTYPE

It lives in `prototypes/interactivity/`, is excluded from `pnpm build` and the published
packages, and **will be deleted or rewritten**. It exists to produce measurements and a
verdict. Do not integrate it into `packages/`. Do not let it change anything under
`packages/` except by adding nothing at all.

Code quality bar: readable and honest, with tests for the runtime's behaviour. Not
production hardening. No security model — the prototype is a lab experiment.

## OBJECTIVE

Compile this document — which parses **today**, with no new syntax — into a working
interactive page, and measure the result.

```md
# Counter

::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Count is :v[count].
```

Deliberately: `::state` is a leaf directive, `:::button` a container directive with an
attribute, and `:v[count]` a text directive. All three already parse. The final language
would sugar this — the prototype is testing semantics and output, not ergonomics.

## REQUIREMENTS

### 1. Pipeline

Use the real `@hymarkx/parser` and `@hymarkx/ast`. Do not fork them, do not preprocess the
source with regular expressions, and do not modify them. All prototype work happens as
passes over the AST.

```
source → @hymarkx/parser → AST → prototype transform → HTML + CSS + JS
```

### 2. Semantics to implement

- `::state{name=value}` declares reactive state. Values are numbers, strings, or booleans.
  Multiple attributes declare multiple variables. State is page-level for the prototype.
- `:v[name]` renders the current value and updates when it changes.
- `on-click="<expr>"` on any directive attaches a click handler.
- Expressions use a **restricted subset** per ADR-0004: identifiers, number/string/boolean
  literals, `+ - * /`, comparison, `&&`/`||`/`!`, parentheses, and assignment to a declared
  state variable. Nothing else. No property access, no calls, no `new`, no globals.
  **Write a real tiny parser and evaluator** — do not use `eval`, `new Function`, or string
  concatenation into a script tag. That shortcut would invalidate the whole experiment,
  because the entire question is whether this can be done safely and compiled small.

### 3. Reactivity model

Compile-time, Svelte-shaped, not a virtual DOM:

- The compiler knows at build time which text nodes depend on which variables.
- Emit HTML with a marker (for example `<span data-hmx="0">`) at each dependent position.
- The runtime holds state, and on mutation updates exactly the marked nodes that depend on
  the changed variable. No diffing, no re-render, no component tree.

### 4. Output proportionality — the measurement that matters

- A document with **no** `::state` MUST emit byte-identical output to today's compiler and
  **zero** JavaScript. Assert this in a test.
- A document with state emits HTML plus one inline `<script>` containing the runtime and
  the generated bindings.
- The runtime is written once, shared by all bindings, and must contain no feature the
  document did not use.

### 5. Measurements — the actual deliverable

Write `prototypes/interactivity/MEASUREMENTS.md` with real numbers, not estimates:

| Metric | Value |
|---|---|
| Runtime size, raw / minified / gzipped | |
| Generated bindings for the counter | |
| Total page bytes | |
| Same counter in React (CDN, `useState`) | |
| Same counter in hand-written vanilla JS | |
| Same counter in Svelte (compiled output, if obtainable) | |

Minify with any tool available; state which. If a comparison cannot be obtained honestly,
write "not measured" rather than estimating. **A rigged comparison is worse than none.**

Also record: HMX source lines and characters versus the React and vanilla equivalents.

### 6. A second, harder document

The counter is the easy case. Also build:

```md
::state{first=Ada last=Lovelace}

:::input{bind=first}
:::

Hello, :v[first] :v[last].

:::button{on-click="last = \"Byron\""}
Rename
:::
```

Two-way binding on an input is where naive reactivity designs fall apart. If it does not
work, **say so** — that is a finding, and a valuable one.

### 7. Tests

- The counter increments — drive it with a DOM implementation (`happy-dom` or `jsdom` as a
  prototype-only devDependency) and assert the rendered text changes.
- A static document emits zero JavaScript and unchanged HTML.
- The expression parser rejects `alert(1)`, `window.location`, `a.b`, `import('x')`, and
  `constructor` with a clear error.
- Assigning to an undeclared variable is an error.

## NON-GOALS

1. No new syntax in `packages/`. No parser or AST changes anywhere.
2. No SSR, no hydration strategy, no islands architecture, no components-with-props.
3. No security hardening, no trust modes, no sanitizer integration.
4. No CSS, no styling.
5. No formatter, no language server, no diagnostics polish.
6. Do not wire this into the `hmx` CLI.

## ACCEPTANCE CRITERIA

- [ ] The counter document compiles and actually works in a DOM test
- [ ] No `eval`, no `new Function`, anywhere
- [ ] Static documents still emit zero JavaScript
- [ ] `MEASUREMENTS.md` contains real measured numbers, with "not measured" where honest
- [ ] The two-way binding document either works or its failure is documented precisely
- [ ] `packages/` is untouched — `git status` shows changes only under `prototypes/`
- [ ] The existing 890 tests still pass

## REPORT BACK WITH

1. Summary · 2. Files created · 3. **The measurements table** · 4. What worked ·
5. **What did not work, and why** — this is the most valuable part of the report ·
6. Your honest assessment: is compiled, small-runtime interactivity achievable here, or
   does something fundamental get in the way?
