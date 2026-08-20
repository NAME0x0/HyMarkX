# ADR-0018 — Backslash escapes quotes inside attribute values

**Status:** Accepted · 2026-08-20

## Context

An attribute value cannot contain the quote character that delimits it, and there is no way to
escape one:

```md
:::button{on-click="last = \"Byron\""}
```

The `\` is not an escape. The value ends at the second `"`, the rest of the line is not valid
attribute syntax, and the whole block degrades to a paragraph with warning `HMX1011`. The author
gets prose where they wrote a button.

Measured behaviour today, all confirmed against the compiler rather than assumed:

| Written | Result |
|---|---|
| `title="a\"b"` | block degrades, `HMX1011` |
| `title='a"b'` | works — `a"b` |
| `title="a'b"` | works — `a'b` |
| `title="C:\Users\Afsah"` | works — backslash is literal |
| `title="C:\dir\"` | works — trailing backslash is literal |
| `title="he said 'hi' and \"bye\""` | block degrades |
| `title='he said \'hi\' and "bye"'` | block degrades |

Two things follow. The first is the documented workaround: alternate the quote characters, and a
value containing one kind can be wrapped in the other. The second is the part the workaround does
not cover — **a value containing both kinds of quote cannot be written at all.** Neither wrapper
can hold it, and there is no escape.

This matters most for event handlers, where the value is an expression and string literals are
ordinary. `on-click="reply = \"yes\""` is the natural way to write it, and it silently produces a
paragraph.

"Silently" is the word that decides this. The failure is not an error explaining that escapes are
unsupported. It is `HMX1011`, a warning saying a line looked like a directive — which is true,
unhelpful, and easy to skim past in a build that exits zero.

## The cost, measured before choosing

Backslash is currently **literal everywhere** in attribute values. Making it an escape is a
breaking change, so the question is what it breaks.

Across every tracked `.md` and `.hmx` file in this repository, exactly **two** attribute values
contain a backslash:

```
docs/tasks/HMX-P01.md                                    {on-click="last = \"Byron\""}
prototypes/interactivity/documents/input-binding-as-brief.hmx   {on-click="last = \"Byron\""}
```

Both are the broken case. Somebody wrote `\"` twice, in a task brief and in a prototype, assuming
it worked. There are **zero** values relying on a literal backslash.

That is the same method that chose `{{ }}` over `{ }` in ADR-0012 — count the collisions in real
documents rather than reason about them — and it points the same way: the escape breaks nothing
that exists and fixes the two places where an author already assumed it existed.

## Options considered

**Doubled quotes (`""` inside `"`), as CSV and SQL do.** Costs nothing at all: `"a""b"` currently
terminates early and fails, so no working document changes meaning. Rejected because it is not
what anyone tried. Both existing attempts in this repository wrote a backslash, which is what a
developer coming from JavaScript, JSON, or virtually any other language reaches for. A syntax
whose only advantage is that it collides with nothing, while failing to match what people
actually type, buys compatibility with documents that do not exist at the cost of every document
that will.

**Leave it and document the alternation.** Cheapest, and genuinely covers most cases. Rejected
because it does not cover values containing both quote kinds, which stay inexpressible, and
because it leaves the failure silent. If this were the decision, the minimum honest version of it
would be a real diagnostic saying escapes are unsupported — and having built that, the escape
itself is smaller than the message explaining its absence.

**Escape only inside `on-*` handler values.** Fixes the motivating case and nothing else.
Rejected: an attribute value would parse by different rules depending on the attribute's name,
which is the kind of special case that is invisible until it bites.

## Decision

**Inside a quoted attribute value, a backslash followed by `\`, `"`, or `'` produces that
character literally. A backslash followed by anything else is itself, literally.**

```md
:::button{on-click="reply = \"yes\""}      →  reply = "yes"
:::card{title="he said 'hi' and \"bye\""}  →  he said 'hi' and "bye"
:::card{title="C:\Users\Afsah"}            →  C:\Users\Afsah   (unchanged)
```

The narrow rule — only three characters are escapable — is deliberate. It keeps `C:\Users\Afsah`
working, because `\U` and `\A` are not escapes and stay literal. A general escape rule where `\x`
means `x` would have broken every Windows path in every attribute, for no benefit: nobody needs
`\n` in an attribute value, and an author who wants a newline has bigger problems.

One case does change meaning: a value ending in a backslash immediately before its closing quote,
`title="C:\dir\"`. It now reads as an escaped quote and the value is unterminated. Measured
occurrences in this repository: zero. An author who needs a trailing backslash writes `\\`.

Unquoted values are unaffected. They cannot contain a quote character in the first place.

Escapes are resolved when the value is read, so everything downstream — schema validation, the
expression parser for handlers, the emitter's escaping — sees the finished string and needs no
knowledge of this rule. In particular the expression parser sees `reply = "yes"`, which is
already what it expects.

## Consequences

**Two files in this repository start working.** The task brief and the prototype document that
already contain `\"` are currently wrong; after this they are right. That is a good sign about
the rule and a bad sign about how long it went unnoticed.

**`SPEC.md` §4.2 gains the rule**, and this is a syntax change, which is why it is an ADR before
code (invariant 8).

**The formatter must round-trip escapes.** It normalises attribute whitespace, and it must not
unescape a value on the way through or the document changes meaning when it is formatted. That
needs a test, not an assumption.

**No conformance impact.** Attribute syntax is HMX-only; CommonMark has no directives, so the
652-example suite cannot move. Verify rather than assert.

**Nothing changes about escaping on output.** A value containing `"` is still escaped when it
reaches an HTML attribute. This decision governs how a value is *written*, not how it is
*emitted*, and conflating the two would be a security bug rather than a syntax one.
