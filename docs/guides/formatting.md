# Formatting

```bash
hmx fmt docs/**/*.hmx        # rewrite in place
hmx fmt docs/**/*.hmx --check # report only; exits 1 if anything would change
hmx fmt page.hmx --json       # { "files": [{ "path": "page.hmx", "changed": true }] }
```

## What it changes

Only HMX constructs.

**Attribute spacing and quoting.** Values are double-quoted, or single-quoted when the value
itself contains a double quote. Attribute order is preserved, and `#id` / `.class`
shorthands stay as you wrote them.

```md
:::note{type=info   .big   #hero}
Body
:::
```
```md
:::note{type="info" .big #hero}
Body
:::
```

**Expression spacing.** One space inside the braces.

```md
---
title: Report
---

{{title}} and {{  title  }}
```
```md
---
title: Report
---

{{ title }} and {{ title }}
```

**Trailing whitespace** on lines it rewrote.

## What it deliberately does not change

Everything else, byte for byte. Not paragraph wrapping, line length, list markers or
numbering, emphasis style (`*` vs `_`), heading style (ATX vs setext), blank lines, code
block contents, link reference definitions, or frontmatter key order.

This is a deliberate trade, not an unfinished feature. A formatter that reflows prose turns
a one-word edit into a fifty-line diff, and the first thing a team does with such a tool is
switch it off. Prose belongs to the author; `hmx fmt` tidies the syntax HMX added.

The guarantee that follows: **a document containing no HMX construct comes back
byte-identical.** All 652 CommonMark conformance examples are checked against this on every
test run.

## Safety properties

- **Idempotent.** Formatting twice equals formatting once.
- **Meaning-preserving.** Formatted source compiles to the same HTML. Checked across every
  fixture in the repository.
- **Never half-formats.** A document with parse errors is returned untouched, with the
  diagnostics. A formatter that mangles broken files is worse than one that declines.
- **Line endings preserved.** A CRLF file stays CRLF.

## What it does not repair

Mis-nested container fences. `:::grid` wrapping `:::metric` needs the outer fence to be
wider — `::::grid` — and `hmx fmt` will not fix it for you.

This was attempted and removed. Under error recovery the syntax tree describes the *broken*
parse, so the automatic repair widened the wrong line and produced a differently-broken
document. Repairing mis-nesting belongs in the diagnostic as a suggestion, where a human
approves it, rather than in a tool that rewrites files unattended.

`hmx check` reports the problem as `HMX1001` with the opening fence's location.
