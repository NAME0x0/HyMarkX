# ADR-0015 — Developer experience: conservative formatter, full-reparse language server

**Status:** Accepted · 2026-08-16

## Context

Phase 7 delivers `hmx dev`, `hmx fmt`, a language server, and editor support. It is the
largest remaining phase by volume and the first whose deliverable is *felt* rather than
measured — which makes it the easiest phase to get subtly wrong in ways tests do not catch.

Three questions need deciding before any of it is built: how aggressively the formatter
rewrites documents, whether the language server can afford to reparse on every keystroke,
and which of these earn new packages.

## Decisions

### 1. The formatter is conservative: it touches HMX constructs, never prose

`hmx fmt` normalises directive attribute spacing, expression spacing inside `{{ }}`,
frontmatter indentation, and — importantly — **container fence counts**. It does not reflow
paragraphs, rewrap lines, renumber lists, change emphasis markers, or reorder frontmatter
keys.

This is a deliberate departure from how Markdown formatters usually behave. The reasoning is
`§49`: HMX must stay pleasant in Git. A formatter that reflows prose turns a one-word edit
into a fifty-line diff, and the first thing a team does with such a tool is turn it off.
Prose belongs to the author.

The fence-count fix earns the formatter its place on its own. `:::grid` wrapping `:::metric`
silently closes the outer container — recorded as a usability trap in `BACKLOG.md` after I
hit it writing the first realistic dashboard. `hmx fmt` renumbering fences turns a confusing
failure into a non-event.

Formatting MUST be idempotent and deterministic: formatting twice equals formatting once,
and is asserted as such.

### 2. The language server reparses fully, with debounce

micromark is not incremental. Measured on a realistic HMX document — prose, directives,
expressions — on the development machine:

| Document | parse | compile |
|---|---|---|
| 2 KB | 11 ms | 11 ms |
| 10 KB | 43 ms | 39 ms |
| 50 KB | 216 ms | 212 ms |

Documentation pages live in the 2–10 KB band, where a full reparse is comfortably inside a
keystroke budget. At 50 KB it is not, and a debounce carries it.

So: **full reparse, debounced at 150 ms**, no incremental parsing. Adding an incremental
layer now would mean a second grammar to keep in sync with the first — the most expensive
kind of duplication a language can own — to fix a problem that does not exist at the sizes
people actually write.

The escape hatch stays where ADR-0003 put it: if profiling on real projects shows editing
latency is the binding constraint, tree-sitter becomes a second grammar serving the editor
only, with the micromark pipeline remaining the semantic source of truth. The trigger is a
measurement, not a feeling.

### 3. Completion and hover come from the schemas, not from a new source of truth

The component schemas built in Phase 5 already carry attribute types, permitted enum values,
required flags, and a `description` per attribute. That is exactly what an editor needs.

The language server MUST read them from the registry rather than maintaining its own
catalogue. A second list would drift, and the drift would be invisible until someone trusted
the wrong autocomplete.

This is the deferred payoff for insisting in ADR-0011 and ADR-0013 that schemas be pure
serializable data.

### 4. `hmx dev` serves output; it is not a bundler

Watch inputs, recompile changed documents, serve the result, reload the browser. No bundling,
no module graph, no transform pipeline — charter §19 forbids a bespoke bundler, and nothing
here needs one.

The reload client is injected **only** by `hmx dev` and MUST NOT appear in `hmx build`
output. A development convenience that leaks into a production build would break output
proportionality, which is one of the project's few genuine advantages.

### 5. Two new packages are now earned

`ARCHITECTURE.md` said `formatter` and `language-server` stay absent until justified. They
are justified now: both are real boundaries with their own consumers.

```
packages/formatter/         @hymarkx/formatter        AST → canonical source
packages/language-server/   @hymarkx/language-server  LSP over parser + compiler + formatter
editors/vscode/             extension, syntax grammar, client
```

The dependency rule extends unchanged: neither may import micromark, mdast, or unified, and
only the CLI and the language server may touch the filesystem.

## Alternatives considered

- **Prettier-style full formatting.** Familiar, and it would make every HMX repository's
  first `hmx fmt` commit a thousand-line diff nobody can review.
- **Incremental parsing from the start.** Correct eventually, wrong now: two grammars to
  maintain for a latency problem the measurements say we do not have.
- **A separate completion catalogue** for the language server. Faster to write, guaranteed to
  drift from the schemas it describes.
- **Building `hmx dev` on Vite.** Tempting — and it would put a bundler's module graph in the
  middle of a pipeline whose defining property is that it does not have one.

## Consequences

- `hmx fmt` will be criticised for doing too little. That is the intended trade, and the
  reasoning is written down so the criticism can be answered rather than relitigated.
- Editing latency on very large documents will be visible. The numbers above are the
  baseline against which any complaint gets measured.
- The schemas become load-bearing for tooling as well as compilation, which raises the cost
  of changing their shape. That cost was already accepted when they were made serializable.
- Phase 7 splits into three reviewable tasks: formatter, dev server, then language server
  with the editor extension. The formatter goes first because the language server formats
  through it.
