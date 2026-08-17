---
name: hymarkx
description: Use when writing, editing, reviewing, or debugging HyMarkX (.hmx) documents and components, or when working in the HyMarkX repository. Covers directive syntax, fence nesting, expressions, component authoring, state, trust modes, and the diagnostics that explain failures.
---

# HyMarkX

HMX is Markdown that progressively becomes a web page. Ordinary Markdown is already valid
HMX. Static documents emit zero JavaScript.

**Canonical reference: [`llms.txt`](../../../llms.txt) at the repository root.** Read it
before generating content. This skill is the working checklist.

## The four mistakes that cause most failures

Observed while building the language — the first one shipped broken in this project's own
README for six phases.

**1. Nesting needs more colons on the OUTER fence.**

```md
::::grid{columns=2}

:::card
Inner content
:::

::::
```

Equal widths do not nest. `:::grid` wrapping `:::card` means the inner fence closes the
outer container, producing `HMX1001`. Count from the inside out: innermost is `:::`, its
parent `::::`, and so on.

**2. `{{ expr }}` for text, `{key={expr}}` for attributes.** Single braces in prose are
ordinary text.

**3. There is no `@` syntax.** `@state`, `@if`, `@for` appear in early design sketches and
were formally rejected (ADR-0014). Everything is a directive.

**4. Expressions are a restricted pure sub-language.** No calls, no member access on
built-ins, no globals. `window`, `fetch`, `document` are compile errors — not sandboxed,
simply not in scope. Assignment works only inside an event handler, only on declared state.

## Writing a document

```md
---
title: Dashboard
---

# {{ title }}

::::grid{columns=2}

:::metric[Revenue]
$42,500
:::

:::metric[Users]
14,302
:::

::::

:::note[Heads up]{type=warning}
Figures are preliminary.
:::
```

Built-ins: `note` (`type`), `card`, `grid` (`columns`, `gap`), `metric`, `badge` (`kind`),
`button` (`type`), `input` (`type`, `value`, `name`), `form`. `id`, `class` and `title`
work on all of them.

## Writing a component

`components/Card.hmx` — capitalised filename, props declared in frontmatter:

```md
---
props:
  title: { type: string, required: true }
  tone: { type: enum, values: [info, warning], default: info }
---

:::note{type={tone}}
## {{ title }}

::children
:::
```

Used as `:::Card{title="Revenue"}`. A component's props are its **entire** scope: it cannot
see the caller's frontmatter, the caller's props, or anything ambient. `::children` marks
where the caller's content goes, and may appear at most once.

## Adding interactivity

```md
::state{count=0}

:::button{on-click="count = count + 1"}
Increment
:::

Count is {{ count }}.
```

State is component-local — two uses of one component count independently. Events are
allowlisted: `on-click`, `on-input`, `on-change`, `on-submit`, `on-focus`, `on-blur`,
`on-keydown`. Anything else is `HMX2060`.

## Verifying

Always check generated documents rather than assuming:

```bash
hmx check page.hmx     # exit 0 means valid
hmx fmt page.hmx       # canonical formatting
```

Diagnostic codes are stable and carry spans. Common ones:

| Code | Means |
|---|---|
| `HMX1001` | container not closed — usually the fence-width mistake |
| `HMX1011` | a line looks like a directive but was not recognised (malformed attributes) |
| `HMX2001` | unknown attribute on a known component |
| `HMX2002` | unknown component; content renders without a wrapper |
| `HMX2004` | value outside an enum's permitted values |
| `HMX2040` | unknown identifier in an expression |
| `HMX2044` | prohibited expression construct, such as a function call |
| `HMX3001` | `<script>` or `<style>` in `document` trust mode |

## Do not generate these

Recorded decisions, not oversights: named derived state, shared or global state, named
slots, `if`/`for` constructs of any kind, `async` or data loading, effects or lifecycle
hooks, TSX interop, and author `<style>` in `document` trust mode.

If a document seems to need one, say so rather than inventing syntax — check
[`BACKLOG.md`](../../../BACKLOG.md), which records what was rejected and why.

## Working on the repository itself

Read [`AGENTS.md`](../../../AGENTS.md). The short version: `pnpm check` must pass, the 652
CommonMark conformance examples must never regress, only `@hymarkx/parser` may import
micromark or mdast, and syntax changes need an ADR before code.
