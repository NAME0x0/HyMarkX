# HyMarkX — Vision

**Status:** living document · **Language version:** 0.0.x (experimental)

## One sentence

HyMarkX (HMX) is a Markdown-compatible, progressively enhanced language for creating
documents, websites, interfaces, and interactive web applications while preserving the
simplicity and readability of ordinary Markdown.

## The problem

Web authoring has a cliff. Markdown is excellent up to the moment you need layout,
reuse, state, or interactivity — and then you fall into HTML, CSS, JSX, TypeScript,
component libraries, a bundler, and a framework, all at once. The cost is paid up
front, before the complexity is actually needed.

MDX narrows the cliff by allowing JSX inside Markdown. It does not remove it: the
moment you want a component you are writing JavaScript, and an MDX file is a
JavaScript module wearing a Markdown costume.

## The thesis

> Keep the author inside a Markdown-like mental model for as long as possible, while
> allowing the document to progressively become a complete web experience.

The intended progression is `MD → MDX → HMX`, where HMX's distinguishing property is
not "more syntax" but **a gentler cost curve**:

```
Plain text → Markdown → rich document → styled document → component document
          → interactive page → dynamic interface → full application
```

At no point should the language punish someone for having started simply.

## The line HMX crosses

The closest prior art is **Markdoc**, and the distinction is not cosmetic. Markdoc is a
declarative content-publishing format: it deliberately keeps arbitrary code out of
documents so they stay analysable, validatable, and safe to transform. Interactivity comes
from whatever component the host application registers behind a tag.

HMX takes the same starting point and crosses the line Markdoc chooses not to:

> **HyMarkX is a Markdown-first language in which documents can progressively become
> applications — with state, events, styling, and logic as native semantics the compiler
> owns, not as handoffs to components written elsewhere.**

Concretely, this must eventually be native HMX rather than a tag delegating to a React
component someone wrote separately:

```md
@state count = 0

[+](button) -> count++

Count: {count}
```

*(Illustrative. That syntax is not decided — see ADR-0002 and the caveats in §6.)*

If HMX ends up as Markdown + directives + variables + scoped styles, it has rebuilt
Markdoc with different punctuation and should not exist. `ROADMAP.md` puts an explicit
go/no-go gate at the end of Phase 3 for exactly this reason.

What HMX should take *from* Markdoc, without argument: **schema discipline.** Typed
attributes and declared allowed-children are what make a component model checkable by a
compiler, completable by an editor, and reliably generatable by a model.

## What HMX is not

HMX is **not** "MDX with more syntax." That is the project's primary failure mode and
the constraint that overrides feature enthusiasm. If a proposed capability makes the
native HMX experience approach the verbosity of writing a conventional frontend, the
capability is wrong even if it is useful.

Concretely, this is what we are trying **not** to make the default:

```tsx
<div className="grid grid-cols-3 gap-4">
  <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
    <CardContent>$42,500</CardContent></Card>
</div>
```

and this is the shape we are aiming at (illustrative, not normative):

```md
:::grid{columns=3 gap=4}
:::card
## Revenue
$42,500
:::
:::
```

TSX, JS, HTML and CSS remain available as escape hatches. They are not the native
authoring experience, and the language must never require them for ordinary work.

## Non-negotiables

1. **Markdown first.** A plain Markdown document is a valid, useful HMX document.
2. **Progressive enhancement.** You pay for a capability when you use it — in syntax,
   in runtime bytes, in build complexity, and in what you have to learn.
3. **Graceful degradation.** An HMX document that a non-HMX tool cannot fully render
   must still be *readable text*. We never promise that HMX behaviour executes in an
   arbitrary `.md` renderer — that promise would be false.
4. **Framework neutrality.** React may get an excellent adapter. The language is not
   defined in terms of React, and must not become so.
5. **Safe by default.** Rendering an untrusted document must not grant it code
   execution. The trust level is chosen by the host, never by the document.
6. **Escape hatches without contamination.** The power-user path must not tax the
   beginner path.

## The central product question

Applied to every proposed feature, forever:

> Does this capability make sophisticated web authoring materially easier **while
> preserving Markdown's simplicity**?

If the honest answer is no, the feature is rejected and the reason recorded in
[`BACKLOG.md`](BACKLOG.md).

## Success criterion

HyMarkX succeeds if a developer can truthfully say:

> "I started with Markdown, and I only added complexity when I actually needed it."

And can build documentation, a blog, a portfolio, a landing page, a dashboard,
interactive teaching material, or a small application — without frontend boilerplate
on line one.

## Secondary opportunity: AI-generated interfaces

Markdown-shaped text is the format language models produce most reliably. A
sufficiently expressive HMX could let a model emit a working dashboard in ~20 lines
instead of ~300 lines of scaffolding. We therefore value token efficiency,
deterministic formatting, recoverable syntax, shallow nesting, and schema-checkable
components.

But: **the language is not distorted for machines.** Humans remain first-class
authors. Where the two conflict, humans win.

## Honesty clause

Many systems combine Markdown with components, scripting, or web output — MDX,
Markdoc, Astro, Svelte, Vue SFCs, R Markdown, Quarto, Jupyter, Pandoc, and more.
HMX claims **no novelty in the combination itself.** Its value must come from the
specific mix of Markdown-first ergonomics, progressive enhancement, graceful
degradation, framework neutrality, output proportional to capability, a safe
execution boundary, and tooling quality. Any novelty claim must be evidence-based.
