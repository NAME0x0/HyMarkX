# ADR-0021 — Containers nest by matching, and code fences are opaque

**Status:** Accepted · 2026-08-23

## Context

Two problems with container fences, found the same afternoon while building this project's own
documentation page. They look like one problem to an author, so they are decided together.

### A closing fence is recognised inside a fenced code block

```md
:::box
```md
:::note
Body
:::
```
:::
```

The `:::` that closes the *sample* closes the `box`. The code block is truncated at that line,
the container ends early, the rest of the document is reparsed as top-level content — and **no
diagnostic is emitted**. The author sees a page that is silently wrong.

Reproduced against `micromark-extension-directive` directly, so this is inherited rather than
introduced here: the container's continuation tests each line for a closing fence before the
line reaches the flow tokenizer, and therefore cannot know it is inside a code fence.

CommonMark is unambiguous that a fenced code block's content is literal. A construct that reads
inside one is reading text that, by the specification, is not markup.

### Nesting requires the *outer* fence to be longer

Inherited from ADR-0002, which took the rule from CommonMark's code fences. It is correct there
because code content is opaque and cannot be parsed. Directive content is parsed as blocks, so
the reason does not carry over — but the cost does.

Building the landing page, the stepper needed `::::::` at its outermost wrapper. Adding the
documentation page pushed it to `:::::::`, because a page that *shows* `:::note` needs every
wrapper around the sample to be longer than the sample. Depth is now a function of what a
document quotes, not of how it is structured.

That is not merely ugly. It is disqualifying for three things already planned:

- **Documentation.** Every page that teaches the syntax quotes it. The cost compounds per level.
- **The visual builder.** A drag-and-drop canvas produces nested containers by its nature, and
  the output is meant to be a file people can read and hand-edit. Nobody hand-edits seven colons.
- **Round-trip editing.** Dropping a block into a container changes nesting depth, which under
  the current rule rewrites the *parent's* fence, and possibly every fence above it. A single
  drag would edit lines the author never touched, which is exactly what round-tripping promises
  not to do.

## Options considered

**Named closing fences** — `:::note … :::note`. Unambiguous, and it solves both problems at
once. Rejected on weight: it doubles the syntax an author types for the common case of one
short container, and it is a visibly different language from the directive proposal every other
Markdown tool implements.

**Require the closing fence to match the opener exactly** rather than "at least as many". Does
nothing for either problem: the sample's `:::` still matches a `:::` opener.

**Reimplement the container construct inside HMX.** Full control, and the only way to make the
container a genuine participant in flow. Rejected for now as disproportionate: it is a parser
project of real size, and the cheaper fix below is testable and reversible.

**Ban fenced code inside containers.** Rejected as absurd; it is the single most common thing a
documentation page does.

## Decision

**1. A fenced code block inside a container is opaque.** While a container's content is inside a
fenced code block, a line is content, never a closing fence. The container's continuation tracks
code-fence state: an opening run of three or more backticks or tildes opens, and a run of the
same character at least as long closes. This is CommonMark's own rule for when a code fence
ends, applied where the container can see it.

**2. Containers nest by matching, not by counting.** A closing fence of *n* colons closes the
innermost open container whose opening fence was *n* colons or fewer.

The second half of that sentence is what keeps every existing document working:

```md
::::grid
:::card
Body
:::
::::
```

`:::` still closes `card`; `::::` still closes `grid`. What is newly legal is the obvious thing:

```md
:::grid
:::card
Body
:::
:::
```

Same count, nested by position, closed innermost-first — the way brackets have always worked,
and the way every author writes it before being told not to.

## Consequences

**Depth stops depending on what a document quotes.** A page teaching `:::note` needs no more
colons than a page that does not, which is the whole reason this ADR exists.

**Generated documents become readable**, which the builder's round-trip guarantee requires:
inserting a nested block no longer rewrites its ancestors' fences.

**`HMX1001` recovery gets better, not worse.** Under matching, an unclosed inner container is
reported at the inner opener rather than swallowing the remainder of the outer one.

**ADR-0002 is superseded on this point.** Its reasoning — parity with CommonMark code fences —
was sound when directive content might have been opaque. It is not, so the parity is
superficial.

**The upstream extension keeps its behaviour**, and HMX wraps it — the construct is not
vendored, which the first design assumed would be necessary. The wrapper observes `consume` to
learn what the previous lines were, and suppresses the closing-fence attempt while a code fence
or an inner container is open. That works because the attempt for line *n* happens before line
*n* is read, and only lines *1..n-1* are needed to make the decision.

The maintenance cost is worth naming: this project now depends on where upstream places that
attempt. An upstream change to the container needs reviewing rather than merely absorbing, and
the tests in `packages/parser/test/directives.test.ts` are what would catch it.

**The compatibility suite is the gate.** A document containing no HMX construct must still
render identically to CommonMark plus GFM, and no existing fixture may change. Both rules are
additive to what parses today, so any diff in the 692 conformance examples or the golden
fixtures means the change is wrong.
