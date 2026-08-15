# ADR-0013 — HMX-authored components: a `.hmx` file with declared props

**Status:** Accepted · 2026-08-15

## Context

Phase 5 must answer the dozen questions charter §41 poses before any code is written. The
constraint that shapes every answer: a component system that requires authors to learn a
second, code-shaped language would forfeit the thesis. Markdoc's split — developers
configure tags, authors write content — is explicitly what HMX is trying not to be
(`docs/research/prior-art.md`).

Verified before deciding: `:::Card{title="x"}`, `::children`, and `::slot{name=footer}` all
parse today with zero diagnostics. **This phase needs no parser or AST changes.**

## Decision

### A component is a `.hmx` file

No new file type, no new syntax, no code. A component is a document that declares what it
accepts and renders content using it.

```md
---
props:
  title: { type: string, required: true }
  tone:  { type: enum, values: [info, warning], default: info }
---

:::note{type={tone}}
## {{ title }}

::children
:::
```

### Props are declared in frontmatter, reusing the existing schema shape

The `props` mapping uses **the same `AttributeSchema` type built for built-in components in
HMX-005** — `type`, `values`, `required`, `default`, `min`, `max`, `description`. One schema
system serves built-ins and user components alike, validation is identical, and the
JSON-serializability that keeps the grammar-export path open (ADR-0011) is inherited for
free.

A component's props are its entire scope. It cannot see the caller's frontmatter, the
caller's props, or any global — there is nothing to reach. This is ADR-0004's closed scope
applied one level down, and it is what makes a component reasonable about in isolation.

Props are read with `{{ … }}` and in attribute positions with `{…}`, both already built in
Phase 4. Phase 5 changes what the scope *contains*, not how expressions work.

### Capitalised names are user components; lowercase are built-ins

`Card.hmx` registers as `Card`, used as `:::Card`. The name is the file's basename, matched
case-sensitively.

This borrows JSX's capitalisation convention, and it earns its keep here for the same
reason: a reader can tell at a glance whether `:::Card` is something in this project or
something the language provides. A user component may shadow a built-in, but doing so emits
`HMX2050` — silently replacing `note` for the whole document is the kind of surprise that
costs an afternoon.

### Children go where `::children` says

One default slot, placed by the component. Content the caller wrote between the fences is
rendered at that point.

**Named slots are deferred.** They are the natural next request, and the caller-side syntax
is where they turn ugly — nesting a `:::slot{name=footer}` block inside every call site adds
exactly the verbosity this language exists to avoid. Revisit with real documents that need
them, per the same evidence rule as ADR-0002.

`::children` appearing more than once is `HMX2053`: duplicating the caller's content is
never what was meant.

### Resolution happens in the host, never in the compiler

`compile()` already takes components as data through `options.components`. That does not
change, because **the compiler must not read the filesystem** — it has to run in a browser
(ADR-0009), and the dependency boundary check enforces it.

The CLI discovers `components/*.hmx` next to the document, or at the project root, compiles
each to a registry entry, and passes it in. Frontmatter `components:` may add or override
paths for the explicit case.

Convention gives the strong defaults that separate HMX from Markdoc; the explicit map is
there when convention is wrong. Neither requires configuration to start.

### Everything happens at build time

Components are expanded during compilation. A page using them ships **zero JavaScript**, and
component-scoped CSS is emitted once per component *used*, not per instance — output
proportionality extended one level down.

Components may contain `<style scoped>`. They may **not** contain state, events, or scripts
at this version; that is Phase 6, and it needs the reactivity model settled first.

### Recursion is bounded

A component may include another. Cycles are detected and reported as `HMX2054` naming the
cycle; expansion depth is capped with `HMX2055`. An unbounded expander is a build-time
denial of service, which is a real threat once components come from a repository.

## Alternatives considered

- **A `<script>`-based component definition**, Vue-SFC style. Rejected: it makes the first
  reusable component a coding task, which is exactly the cliff HMX exists to remove.
- **A dedicated `::prop` directive per prop.** More HMX-native in appearance, but it
  scatters the declaration through the file and gains nothing over a frontmatter mapping
  that is already parsed, validated, and serializable.
- **Auto-registering every `.hmx` file in the project.** Convenient and too magical: a file
  rename would silently change a component's name, and an unrelated document could shadow a
  component. The `components/` directory is the boundary.
- **Named slots in this phase.** Deferred as above.
- **Case-insensitive names.** Rejected: `:::card` and `:::Card` resolving to different
  things is confusing, but so is a rule that makes a built-in and a user component
  indistinguishable at the call site. Case sensitivity plus the capitalisation convention
  gives an unambiguous, readable answer.

## Consequences

- Phase 5 is compiler-only. No parser change, no AST change, no new syntax to specify —
  unusually cheap for the value delivered, because Phases 2–4 built the machinery.
- The component registry becomes the single extension point for both built-ins and user
  components, which strengthens the case that it should eventually be the plugin surface
  (ADR-0008, revisit at Phase 9).
- Deferring named slots and component state means Phase 5 ships composition only. That is
  worth saying plainly: a component that cannot hold state is a template, not a widget.
  Phase 6 makes it a widget.
- Props being the entire scope means a component cannot reach page metadata such as
  `{{ title }}` from the document's frontmatter. If that turns out to be a common need, the
  answer is an explicit prop, not an ambient scope.
