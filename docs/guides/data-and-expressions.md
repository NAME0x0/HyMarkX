# Data and expressions

How a document carries data, and what it may compute from it. Frontmatter holds the data,
`{{ }}` reads it, and everything is resolved at compile time — a document that only
interpolates values ships no JavaScript at all.

For the normative rules see [`SPEC.md`](../../SPEC.md) §4.3 and §4.4. For why the expression
language is deliberately small, see [ADR-0004](../adr/0004-expression-language.md).

## Frontmatter

A document may begin with a YAML mapping between `---` fences. It must be the first thing in
the file.

```md
---
title: Quarterly report
quarter: Q3
revenue: 42500
draft: false
tags:
  - finance
  - internal
---

# {{ title }}

Revenue for {{ quarter }} was {{ revenue }}.
```

Values may be strings, numbers, booleans, null, lists, and nested mappings. The YAML is parsed
with a deliberately reduced feature set — no custom tags, no merge keys, no alias expansion
beyond a small bound, string keys only. Those are security controls, not simplifications; see
`SECURITY.md` threats T11–T13.

**A leading `---` block is not always frontmatter.** `---\nFoo\n---` is a thematic break and a
setext heading in CommonMark, and both appear in the conformance suite. So a block is treated
as frontmatter only if its content parses as a YAML mapping. If it does not, the document is
ordinary Markdown and renders exactly as CommonMark requires.

That rule has a trap in it, and the compiler covers the trap: if the block *looks* intended as
frontmatter — it contains a `key:` line — but fails to parse, you get `HMX2021` rather than
silence. A typo in real frontmatter is reported; genuine Markdown is left alone.

## Interpolation

`{{ expression }}` in text or in an attribute value.

```md
---
user: Ada
count: 3
---

Hello, {{ user }}. You have {{ count }} messages, or {{ count * 2 }} after the sync.
```

Results are HTML-escaped in text positions and escaped per-context in attributes. There is no
way to interpolate raw markup; a value containing `<script>` renders as text.

To write `{{` literally, escape it:

```md
Use \{{ this }} to show the braces themselves.
```

Single braces are ordinary text and always were — `{a}` needs no escaping. This was measured
before the syntax was chosen: single braces appear in 4 of the 652 CommonMark conformance
examples, `{{` in none.

## Expression attributes

An attribute value written as a nested brace is an expression rather than a string.

```md
---
heading: Revenue
---

:::card{title={heading}}
Body content.
:::
```

The result is validated against the component's declared attribute type without string
coercion — a `number`-typed attribute given a string is `HMX2005`, not a silent parse.

## What the language can do

Literals, identifiers from scope, property and index access, optional chaining, arithmetic,
comparison, logical and conditional operators, array and object literals.

```md
---
price: 40
taxRate: 0.2
user:
  name: Ada
  address: null
---

Total: {{ price + price * taxRate }}
Name: {{ user.name }}
City: {{ user.address?.city }}
Status: {{ price > 30 ? "premium" : "standard" }}
```

## What it cannot do, and why

There are no function calls, no arrow functions, no assignment outside an event handler, no
`++`, no comma operator, no tagged templates. There is no way to reach a host object: `window`,
`document`, `fetch`, `process` and their relatives are not identifiers in scope, they are
rejected at compile time.

This is the point rather than a limitation to be worked around. Expressions are evaluated by
the compiler, and in `document` trust mode a document may be untrusted. An expression language
that could call a function would be an execution engine handed to whoever wrote the document —
so it compiles to an instruction tree and is interpreted, with no `eval` and no `new Function`
anywhere in the pipeline. `SECURITY.md` treats this as a boundary, not a convenience.

The practical consequence: **formatting is the host's job, not the document's.** There is no
`{{ format(price) }}`. If a value needs currency formatting, it arrives already formatted, or a
component renders it.

## Diagnostics you will actually hit

| Code | What happened |
|---|---|
| `HMX2040` | Identifier is not in scope. Suggests a near match when there is a good one |
| `HMX2044` | A construct outside the sub-language — usually a function call |
| `HMX2042` | Numeric result is not finite: division by zero, or overflow |
| `HMX2043` | An object or array rendered in a text position; render its fields instead |
| `HMX1020` | Interpolation was never closed |
| `HMX2021` | Frontmatter is not valid YAML |

Every code is listed in [`SPEC.md`](../../SPEC.md) Appendix B.

## Scope

Identifiers resolve from frontmatter, from a component's declared props inside that component,
and from `::state` inside an interactive component — see [Interactivity](interactivity.md).
Nothing else is in scope. There are no globals, no ambient helpers, and no imports.

Two documents with the same frontmatter and the same source produce byte-identical output.
Nothing in an expression can observe the clock, the filesystem, the environment, or the
network, which is what makes that guarantee hold.
