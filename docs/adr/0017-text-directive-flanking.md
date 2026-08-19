# ADR-0017 — A text directive may not follow an alphanumeric character

**Status:** Accepted · 2026-08-19

## Context

`:name` is valid text-directive syntax (ADR-0002, `SPEC.md` §4.1). That means the colon in
ordinary prose can start a directive:

```md
The meeting is at 12:30 tonight.
```

`:30` parses as a text directive named `30`. It has no registered component, so the compiler
reports `HMX2002` and renders the directive's children — of which there are none, because a
bare `:name` has no label. The output is:

```html
<p>The meeting is at 12 tonight.</p>
```

The time is gone. Same for `Ratio 3:4`, for `a:b`, and for anything else of the shape
`word:word`.

This breaks the rule the whole language rests on. **SPEC §3:** any input containing no HMX
construct must produce output equivalent to the Markdown baseline. The author of that sentence
wrote no HMX. They wrote a time.

It also contradicts **SPEC §5**, which says a directive with no registered component renders
its children — *"degradation over data loss"*. For a container that works, because a container
has children. For a bare text directive it is vacuous: there are no children, so the rule is
satisfied by rendering nothing, and the source text is destroyed.

The compatibility suite (`tests/compatibility/`) found this by compiling every Markdown file in
the repository against a reference renderer. It is not hypothetical, merely rare: **zero
occurrences across the 74 Markdown files here**, because technical prose says `12:30` less often
than it says almost anything else. Rarity is why it survived nine phases, not a reason to keep
it.

## Options considered

**Render an unknown text directive's source text literally.** Stops the data loss without a
syntax change. Rejected: it treats the symptom. `12:30` would still be *parsed* as a directive,
still emit `HMX2002`, and still warn the author about a component they never referenced. A
document full of times would be a document full of warnings.

**Require a label or attributes: `:name[…]` or `:name{…}`.** Kills the collision completely,
since `:30` has neither. Rejected as too expensive: it removes the bare `:name` form for every
legitimate inline component, and there is nothing wrong with `:sparkles` or `:br` as syntax. The
problem is not the form, it is *where* the form is allowed to appear.

**Make recognition depend on the component registry.** `:30` is not registered, so it would not
be a directive. Rejected outright: it makes parsing context-sensitive on compiler state, so the
same document would tokenize differently depending on which components a host had registered.
`ARCHITECTURE.md` keeps the parser ignorant of the registry precisely so that cannot happen.

## Decision

**A text directive is recognized only when the character immediately before its `:` is not
alphanumeric.** Start of line, whitespace, and punctuation all still open a directive.

This is a flanking rule, and CommonMark already reasons this way — emphasis delimiters are
left- and right-flanking depending on the characters around them. The colon is being treated the
same way: as a delimiter whose meaning depends on what it is attached to.

| Input | Before | After |
|---|---|---|
| `12:30 tonight` | `12 tonight` + `HMX2002` | `12:30 tonight` |
| `Ratio 3:4` | `Ratio 3` + `HMX2002` | `Ratio 3:4` |
| `a:b` | `a` + `HMX2002` | `a:b` |
| `:badge[ok]` at line start | directive | directive |
| `Status: :badge[ok]` | directive | directive |
| `(:badge[ok])` | directive | directive |

Leaf (`::name`) and container (`:::name`) directives are unaffected. Both are block constructs
that must begin a line, so no preceding character exists to test.

## Consequences

**A text directive cannot be attached directly to a word.** `word:badge[x]` is now literal text.
This is a real restriction, and it is the point: that shape is far more likely to be a time, a
ratio, or a namespace than an intended directive. Anyone who wants a directive there can put a
space before it.

**Nothing that previously worked in a document stops working, unless it relied on that shape.**
The conformance suites are unaffected — a stricter rule can only ever reduce the set of inputs
treated as directives, and CommonMark contains no directives to begin with.

**`SPEC.md` §4.1 gains the rule.** It sits beside the existing `:name:` exclusion, which exists
for the same reason: a colon in prose is usually punctuation, and the language should assume so
until the surrounding characters say otherwise.

**This does not fix every colon collision.** `a:b` inside a code span was never affected;
`12:30` at the start of a line — with the colon still preceded by a digit — is fixed; but a
document that genuinely begins a line with `:30 minutes later` will still see a directive. That
residue is much smaller than the original problem and no rule short of registry-dependent
parsing removes it entirely.
