# ADR-0019 — A declared prop consumes its attribute instead of also emitting HTML

**Status:** Accepted · 2026-08-21

## Context

`id`, `class`, and `title` are accepted on every component without declaration (`SPEC.md`
§4.2.1). For `id` and `class` that is right: both are structural, both mean the same thing on any
element, and merging an author's `class` with a component's own is exactly what an author wants.

`title` is the odd one out, because in HTML it does not mean *name*. It means *tooltip*.

So when a component declares a `title` prop and an author supplies it, the value is used twice —
once by the component, and once as a tooltip nobody asked for:

```md
:::Panel{title="Revenue"}
Body
:::
```

```html
<h2 title="Revenue">Revenue</h2>
```

The tooltip duplicates the visible heading exactly. This is not hypothetical: it is what this
repository's own `fixtures/markdown/components-authored/components/Card.hmx` produces, and
`docs/guides/components.md` teaches the pattern that causes it.

MDN's guidance on the attribute is blunt: its main legitimate use is labelling `<iframe>`
elements for assistive technology, and using it to label a control is "not good practice".
Charter §28 says HMX should make accessible output easier to produce than inaccessible output.
Emitting a redundant tooltip automatically, from a prop the author declared for another purpose,
does the opposite.

## History worth recording

This was noticed during the review of HMX-009 and I tried to fix it there and then. Three of the
implementer's tests failed. I narrowed the fix; they failed again. I reverted the whole thing.

The tests were right and the fix was wrong — not in its goal but in its standing. The behaviour
was specified: HMX-009's brief said universal attributes still apply, so the implementer built
what was asked for and defended it with tests. Changing it during a review meant changing the
specification by editing code, which is what invariant 8 exists to prevent.

That is why this is an ADR rather than a patch, months later.

## Options considered

**Drop `title` as a universal attribute entirely.** Simplest rule to state: a tooltip requires a
component that declares one. Rejected as too blunt — `:::note{title="Tip"}` on a component with
no `title` prop is an author asking for a tooltip explicitly and getting exactly that. The
problem is not that `title` reaches HTML; it is that it reaches HTML *when it has already been
consumed for something else*.

**Rename the universal attribute to `tooltip`.** Cleanest separation: `title` always means a
component prop, `tooltip` always means the HTML attribute, and neither can shadow the other.
Genuinely attractive, and rejected on cost: `title=` appears 29 times across this repository's
tracked documents, in the specification, three guides, two ADRs and the fixtures. Renaming would
invalidate every one of them to fix a collision that only bites when a component declares the
prop. The measurement is the argument, the same way it was for ADR-0012 and ADR-0018 — but here
it points the other way.

**Keep it and document the duplication.** Cheapest, and it leaves the project shipping an
accessibility anti-pattern in its own fixture while its charter claims the opposite. A document
explaining why the output is wrong is worse than no document.

## Decision

**When a component's schema declares an attribute, that attribute belongs to the component. It is
passed as a prop and is not also emitted as an HTML attribute of the same name.**

Stated generally rather than as a special case for `title`, because the reasoning is not about
`title`:

| Case | Behaviour |
|---|---|
| Component declares `title`; author writes `title="x"` | prop only — no HTML `title` |
| Component does not declare `title`; author writes `title="x"` | HTML `title="x"`, unchanged |
| `class` and `id`, declared or not | merged as today, unchanged |

`class` and `id` keep their current merging behaviour and are named explicitly as exceptions.
Both are structural: an author adding a class to a component intends it to reach the element
*alongside* whatever the component sets, and a component declaring a `class` prop is asking for
the same string. There is nothing to disambiguate, so nothing changes.

A component that genuinely wants a tooltip from a declared prop can still set one, by writing it
into the element the component renders. That is an explicit act rather than a side effect, which
is the whole point.

## Consequences

**The authored-component fixture stops duplicating its heading.** `Card.hmx` passes
`title={title}` into the built-in `card`; after this, the `<article>` loses its tooltip and keeps
its heading. The fixture is regenerated deliberately, and the diff is expected to be exactly the
removed attribute.

**`docs/guides/components.md` needs revisiting**, since it teaches the pattern that produced the
duplication.

**`SPEC.md` §4.2.1 gains the rule.** The current sentence — "`id`, `class`, and `title` are
accepted on every component without declaration" — stays true, and is qualified: a declared name
is consumed by the component.

**One behaviour becomes schema-dependent**, which is worth stating plainly because it is the
main cost. Whether `title="x"` reaches the HTML now depends on whether the component declares
`title`. That is a real thing an author has to know. It is defensible because the schema is
already what decides whether an attribute is valid at all, what type it has, and whether it is
required — this makes it decide one more thing, in the same place.

**No conformance impact.** Component attributes are HMX-only.
