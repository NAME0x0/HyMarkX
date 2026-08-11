# Prior Art — What HMX Should Learn and What It Should Refuse

**Compiled:** 2026-08-11 · Phase 0 deliverable (charter §25)
Version-specific claims were checked against npm and upstream docs on that date;
design characterisations are qualitative and stable.

HMX claims no novelty in "Markdown plus components." That combination has been built
many times. The point of this document is to be specific about *where each system's
cost curve bends*, because HMX's only defensible claim is a gentler one.

---

## CommonMark

**Does well.** A precise specification with a 650+ example conformance suite; ends
20 years of dialect ambiguity. The suite is a testable definition of "Markdown works."

**Where it stops.** No tables. No extension mechanism — extensions are per-implementation.

**Lesson.** Adopt the suite as a hard CI gate (ADR-0001). "Markdown-compatible" without
a passing conformance suite is a marketing claim, not an engineering one.

---

## GitHub Flavored Markdown

**Does well.** Tables, task lists, strikethrough, autolink literals — the constructs
people actually type. Specified as a CommonMark superset.

**Watch out.** Autolink literals and table pipes consume punctuation, constraining
where new syntax can live. Any HMX construct must be collision-checked against both
suites.

---

## MDX

**Does well.** Full JSX in Markdown; arbitrary component power; excellent React
integration; ESM imports and exports work as expected.

**Where the cost bends.** An MDX file compiles to a JavaScript module — the content
*is* code. Consequences: rendering untrusted MDX is running untrusted code; the
authoring model requires knowing JSX; interleaving Markdown and JSX has known
whitespace and indentation subtleties; and the output is React-shaped by default.
Once a component is needed, the author is writing frontend code.

**Deliberately not copied.** JSX as the primary component syntax; content-as-JS-module;
the implicit assumption that all documents are trusted.

**Fairness note.** For an application developer who already writes React, MDX is
excellent, and HMX should not pretend otherwise. HMX targets the case where the author
would rather not.

---

## Markdoc (Stripe)

**Does well.** The closest system in spirit. Custom tag syntax (`{% callout %}`) instead
of JSX, so content stays content and does not leak imports or code into the file.
Components declared in a **schema** with typed attributes, which enables validation,
editor support, and safe rendering. Renderer-agnostic AST.

**Where it stops.** Deliberately less powerful than MDX; no built-in reactivity or
client interactivity story; `{% %}` is a distinct visual register from Markdown and is
inert in a plain Markdown renderer.

**Lesson — the biggest one in this document.** Markdoc demonstrates that a
*non-JS, schema-validated* component layer is viable and pleasant. HMX takes the schema
idea (attribute validation, useful diagnostics, AI-checkable output) and diverges by
(a) using directive syntax rather than `{% %}`, and (b) intending to cross into
interactivity, which Markdoc declines.

**The overlap is large enough to be a project risk, not a footnote.** Markdoc already has
tags with attributes, nesting, variables, conditionals, functions, partials, an AST, a
serializable render tree, schema validation, and HTML/React/custom renderers. Its variables
are immutable during rendering and its stated position is that it is *not* a templating
language and does not mix arbitrary code with content — a deliberate design choice, not a
gap waiting to be filled.

Which means: **Markdown + directives + variables + conditionals + components is not a
product.** That combination is Markdoc. HMX's justification rests entirely on native state,
native events, compiled output proportional to capability, `.hmx` components authorable
without a separate framework file, and a real toolchain — the things Markdoc declines to
build because they would compromise its analysability.

Two structural ideas transfer directly and should be treated as decided:

1. **`parse → transform → render` with a serializable tree between transform and render.**
   Markdoc is independent evidence that AST → render-tree → backend is the right shape for
   Markdown-derived systems. It does not change ADR-0006 (no IR until a second backend
   needs one), but it does raise confidence that an IR is where we end up.
2. **Schema-declared components.** Promoted from research to a Phase 2 requirement.

One idea does *not* transfer: Markdoc's separation of "developer configures tags" from
"author writes content" is right for a documentation pipeline and wrong for HMX's stated
progression. `:::metric` should do something reasonable before anyone writes
`schema/Metric.ts`, `components/Metric.tsx`, and a renderer config. Strong defaults are
part of the thesis, not a convenience.

---

## Generic directives (`remark-directive` / `micromark-extension-directive`)

**Does well.** One extension mechanism for arbitrary block and inline constructs, with
settled semantics: `:x`, `::x`, `:::x`, labels, HTML-shaped attributes, `#id`/`.class`
shorthands, nesting by colon count. Widely deployed, so its edge cases are known
(`:red:` excluded to protect emoji shortcodes; no whitespace between colons and name;
labels cannot span lines).

**Where it stops.** Syntax only — no semantics, no validation, no component model, and
attributes are plain strings with no expression concept.

**Lesson.** Take the syntax wholesale (ADR-0002) and spend the saved design budget on
the semantics layer, which is where the actual product is.

---

## Astro

**Does well.** Islands architecture — ship HTML by default, hydrate only the components
that need it, with explicit client directives (`client:load`, `client:visible`). Content
collections give typed frontmatter with schema validation. Framework-agnostic component
support in one page.

**Where the cost bends.** Astro is a *framework*, not a language: it owns routing, the
build, and the project layout. Its `.astro` component format is HTML-with-frontmatter,
so component authoring is still web development.

**Lesson.** Islands and explicit hydration directives are the right model for HMX
Phase 6. Copy the principle, not the framework scope — HMX is a language that a
framework can consume.

---

## Svelte

**Does well.** Compiler-first reactivity: no virtual DOM, output proportional to what
the component uses. Template control flow (`{#if}`, `{#each}`) is readable to people who
do not think in JSX. Scoped styles by default, with unused-selector warnings.

**Where the cost bends.** Reactivity semantics have needed multiple redesigns; the
template language is a genuine second language to learn; single-file components are
still code files.

**Lesson.** Compile-time reactivity with a small runtime is the model for Phase 6.
Scoped-by-default styles are the model for Phase 3. And the redesign history is a
warning: **do not ship a state model before its lifecycle is specified** (charter §43).

---

## Vue SFC

**Does well.** Clear `<template>` / `<script>` / `<style scoped>` separation; template
expressions are a *restricted* subset rather than arbitrary JS, which is precedent for
ADR-0004; excellent tooling from a well-defined file format.

**Where the cost bends.** An SFC is entirely a code file — there is no "just write
prose" entry point. Directive attributes (`v-if`, `v-for`, `:bind`, `@click`) accumulate
into their own dense sub-language.

**Lesson.** Restricted template expressions are proven at scale. Also a warning about
attribute-sigil proliferation: each one is cheap alone and expensive in aggregate.

---

## JSX / TSX

**Does well.** Expressive, typed, universally known among frontend developers,
outstanding editor support.

**Where the cost bends.** Verbosity for content-shaped work; `className`; closing-tag
noise; deep nesting; requires the whole toolchain. The charter's `<Card><CardHeader>…`
example is the canonical illustration.

**Lesson.** Keep it as an interop escape hatch (Phase 8). It must never be the price of
entry.

---

## HTML custom elements / Web Components

**Does well.** A platform-native component model with no framework, real encapsulation
via shadow DOM, and no build step required.

**Where the cost bends.** Verbose registration; SSR and hydration remain awkward;
styling across the shadow boundary is its own topic.

**Lesson.** A plausible *backend target* (charter §8), not an authoring model. Reinforces
that HMX should not invent a competitor to semantic HTML — it should emit it.

---

## Templating languages (Liquid, Jinja, Handlebars, Nunjucks)

**Does well.** Decades of evidence that restricted, sandboxed expression languages are
sufficient for real work, and that `{% for %}` / `{{ value }}` is learnable by
non-programmers.

**Where the cost bends.** Logic-in-templates degenerates; no component model in the
modern sense; string-based rendering rather than a tree, so escaping bugs are endemic.

**Lesson.** Supports ADR-0004's restricted expressions. The escaping failures are the
reason HMX renders from a tree with context-aware escaping, never by concatenation.

---

## Static site generators (Jekyll, Hugo, Eleventy, Docusaurus)

**Does well.** Frontmatter as a de facto standard; file-based routing as an intuitive
convention; content and layout separation.

**Where the cost bends.** Configuration surface tends to exceed the content it serves;
layouts and shortcodes are per-generator and non-portable.

**Lesson.** Keep frontmatter conventional. Keep file-based routing in *tooling*, never
in the language (charter §45). Resist configuration as a substitute for language design.

---

## Literate programming (R Markdown, Quarto, Jupyter, Org-mode, Pandoc)

**Does well.** Executable documents that produce many output formats from one source;
Pandoc's AST demonstrates the value of a backend-neutral tree; Quarto shows Markdown can
carry substantial application-grade metadata without becoming unreadable.

**Where the cost bends.** Execution is trusted by construction — an untrusted notebook
is an untrusted program. Jupyter's `.ipynb` is JSON, which destroys the diff and
plain-text-readability properties HMX prizes.

**Lesson.** A backend-neutral AST is right (ADR-0005). Executable-by-default is exactly
wrong for HMX (ADR-0007). And the `.ipynb` format is the argument for staying plain text
(charter §49).

---

## Synthesis — the specific gap HMX is claiming

None of the above occupies this precise position:

1. Markdown-first authoring with a **conformance-tested** compatibility guarantee
2. Component syntax that is **not** JSX and **not** a bespoke sigil family
3. A **restricted, analysable** expression language rather than arbitrary JS
4. **Safe-by-default** rendering with a host-selected trust boundary
5. **Output proportional to capability** — zero JS for static documents
6. **Framework neutrality** at the language level, adapters at the backend level
7. A gentle progression from prose to application with no cliff

Markdoc has 1, 2 (differently), 3, and 4, and declines 7. Astro has 5 and 6 as a
framework, not a language. MDX has 7's endpoint but not its beginning. Svelte has 5 but
starts from code.

If, during implementation, HMX turns out to be Markdoc with directives and no
meaningful path to interactivity, that is a finding to report honestly, not to market
around.
