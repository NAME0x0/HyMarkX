# HyMarkX Language Specification

**Version:** 0.0 (draft) · **Status:** unstable, syntax may change without migration path

## 0. Conventions

Key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** are normative and
used per RFC 2119. Text in sections marked *(informative)* is explanatory and imposes
no requirements. Examples are informative unless labelled normative.

An *HMX processor* is any implementation that consumes HMX source. A *conforming
processor* satisfies every MUST in this document at the language version it claims.

## 1. Documents

An HMX document is a UTF-8 text file. The canonical extension is `.hmx`. A processor
MUST also accept `.md` input, processing it under the same rules (§3 guarantees this is
safe: a `.md` file containing no HMX constructs behaves as Markdown).

Line endings LF and CRLF MUST both be accepted. CRLF MUST be normalized to LF before
parsing, and column positions in diagnostics MUST refer to the normalized text.

A document MUST NOT be required to contain anything. The empty document is valid and
produces empty output.

## 2. Markdown baseline

The Markdown baseline is **CommonMark 0.31.2 plus GitHub Flavored Markdown**
(tables, task list items, strikethrough, autolinks). See ADR-0001.

A conforming processor MUST render every CommonMark example identically to the
reference implementation, except where this specification explicitly states a
divergence. There are currently no intentional divergences.

Raw HTML in Markdown is subject to the trust mode (§7), which is a *rendering*
restriction, not a parsing divergence: the HTML is still parsed as HTML.

## 3. Compatibility guarantee *(normative)*

> Any input that contains no HMX construct MUST produce output equivalent to the
> Markdown baseline.

This is the load-bearing rule of the language. Every syntax addition MUST be checked
against it, and the conformance suite exists to enforce it mechanically. A proposal
that cannot satisfy it is rejected regardless of its other merits.

## 4. HMX constructs

### 4.1 Directives *(Phase 2)*

HMX adopts the generic directives syntax (ADR-0002). Three forms:

| Form | Syntax | Block/inline |
|---|---|---|
| Text | `:name[label]{attrs}` | inline |
| Leaf | `::name[label]{attrs}` | block, no children |
| Container | `:::name[label]{attrs}` … `:::` | block, has children |

Normative rules:

- The `name` MUST match `[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?`.
- Whitespace MUST NOT appear between the colons and the name, the name and the label,
  or the label and the attributes.
- `[label]` is optional; `:x` and `:x[]` are equivalent. A label MAY contain inline
  Markdown constructs.
- `{attrs}` is optional; `:x` and `:x{}` are equivalent.
- A container's closing fence MUST have at least as many colons as its opening fence.
  Nesting containers of the same colon count is achieved by increasing the outer
  fence's colon count.
- An unclosed container MUST produce diagnostic `HMX1001` pointing at the opening
  fence, and the processor SHOULD recover by closing it at end of document.
- A text directive with a name but neither label nor attributes (`:name:`) MUST NOT be
  recognized as a directive, to avoid colliding with `:emoji:` shortcodes.

### 4.2 Attributes *(Phase 2)*

Attribute syntax follows HTML conventions inside `{}`:

```
{a}  {a=""}  {a=''}  {a=b}  {a="b"}  {a='b'}      // equivalent when the value is empty/`b`
{#hero}                                            // shorthand for id="hero"
{.large .rounded}                                  // shorthand for class="large rounded"
```

- Multiple `.class` shorthands MUST combine. Multiple `#id` shorthands: the last wins,
  and the processor SHOULD emit warning `HMX2010`.
- Attribute values are **strings** at this language version. Expression-valued
  attributes (`{title={user.name}}`) are specified in Phase 4. Until then a processor
  MUST NOT treat them as literal string values.
  - In a **text** directive the construct is recognized and MUST be rejected with
    `HMX1010`.
  - In a **leaf or container** directive the tokenizer does not recognize the line as a
    directive at all, and it degrades to ordinary Markdown text. A processor MUST then
    emit `HMX1011` (warning) for any paragraph whose first line matches `:{2,}[A-Za-z0-9]`,
    so that the failure is reported rather than silent. The same rule catches ordinary
    malformed attribute blocks such as `:::card{ bad`.
- Unknown attributes on a known component MUST produce warning `HMX2001` — never a
  silent drop.

### 4.2.1 Components and schemas *(Phase 2)*

A **component** is a directive name bound to a schema. A processor MUST maintain a
registry mapping names to schemas, and MUST NOT derive an HTML element name from the
document — component names come from the registry only.

A schema declares the directive forms the component may take, its attributes and their
types, whether content is permitted, and whether a label is permitted. Schemas MUST be
representable as JSON: no functions, no host objects. Rendering is defined separately from
the schema so that schemas remain exportable to other tools.

Attribute types are `string`, `number`, `boolean`, `enum`, `identifier`, and `url`.
A `url`-typed value MUST be subject to the same scheme policy as a Markdown link
destination in the active trust mode (§7); a processor MUST NOT implement a second,
independent URL policy.

`id`, `class`, and `title` are accepted on every component without declaration. `class`
values MUST be restricted to a safe character set rather than escaped into the attribute,
and `id` MUST satisfy the `identifier` rule.

Validation diagnostics:

| Code | Severity | Condition |
|---|---|---|
| `HMX2001` | warning | Unknown attribute on a known component |
| `HMX2002` | warning | Unknown component; content renders without a wrapper |
| `HMX2003` | error | Required attribute missing |
| `HMX2004` | error | Value outside an enum's permitted values |
| `HMX2005` | error | Value fails its declared type or range |
| `HMX2006` | warning | Content not permitted by the component's `children` rule |
| `HMX2007` | error | Label required and absent, or present and forbidden |
| `HMX2008` | error | Component written in a directive form it does not declare |
| `HMX2010` | warning | More than one `#id` shorthand; the last wins |

A diagnostic about an attribute MUST carry the span of that attribute, not of the whole
directive. Where a processor can identify a near-match for an unknown name or value, it
SHOULD offer it as a suggestion, and MUST omit the suggestion rather than offer a poor one.

### 4.3 Frontmatter *(Phase 2)*

A document MAY begin with a YAML frontmatter block delimited by `---`. It MUST be the
first thing in the file. Frontmatter is metadata: it MUST NOT be able to alter the
document's trust mode (§7).

**Recognition rule** *(normative)*. `---` is also ordinary CommonMark: `---\nFoo\n---` is a
thematic break followed by a setext heading, and `---\n---` is two thematic breaks. Both
appear in the conformance suite, so a processor MUST NOT treat every leading `---` block as
frontmatter — §3 outranks this section.

A leading block is frontmatter **only if** its content parses as a YAML mapping. Otherwise
the document MUST be processed as ordinary Markdown, with the block rendering exactly as
CommonMark requires.

When the block is not frontmatter, a processor MUST report the reason **only** if the block
was plainly intended as frontmatter — that is, if it contains a line matching
`^[ \t]*[A-Za-z_][A-Za-z0-9_-]*[ \t]*:(\s|$)`. This keeps a typo in real frontmatter
(`title: [unclosed`) from silently rendering as prose, while leaving genuine Markdown
undisturbed.

A processor MUST parse YAML with entity expansion bounded, merge keys disabled, custom tags
disabled, and string-only keys. See `SECURITY.md` threats T11–T13.

Reserved keys at this version: `title`, `description`, `layout`, `lang`, `draft`.
Unknown keys are preserved and exposed to backends; they MUST NOT error.

### 4.4 Styles *(Phase 3 — not yet specified)*
### 4.5 Expressions *(Phase 4 — see ADR-0004 for the decided direction)*
### 4.6 Components *(Phase 5 — not yet specified)*
### 4.7 State and events *(Phase 6 — not yet specified)*

Sections 4.4–4.7 are placeholders. Implementing syntax for them before this document
specifies them is a process violation (see `CONTRIBUTING.md`, "Change control").

## 5. Rendering

The default backend emits HTML5. Rules:

- Text content MUST be HTML-escaped.
- Directives with no registered component MUST produce diagnostic `HMX2002` and render
  their children (a container behaves as a transparent wrapper). Rationale:
  degradation over data loss.
- Output MUST be deterministic: identical input plus identical options produces
  byte-identical output.
- The emitter MUST NOT include an HMX JavaScript runtime for documents that use no
  interactive construct.

## 6. Diagnostics

A conforming processor MUST report failures as diagnostics with a stable code, a
severity, and a source span (see `ARCHITECTURE.md` §4). It MUST NOT abort on the first
error where recovery is possible; collecting multiple diagnostics per run is required.

## 7. Trust modes *(normative)*

A processor MUST support two modes:

- **`document`** — the default. Scripts, event handlers, and imports MUST be rejected
  with an `HMX3xxx` diagnostic. Raw HTML MUST be sanitized against an allowlist. URL
  attributes MUST be restricted to `http`, `https`, `mailto`, and relative references.
- **`app`** — opt-in. Scripts, imports, and raw HTML are permitted.

The mode MUST be supplied by the host (CLI flag, API option, or configuration file).
No construct inside a document may select or escalate the mode. A processor that
infers `app` mode from document content is non-conforming.

## 8. Versioning

Pre-1.0, syntax may change. Each change MUST be recorded in an ADR and `CHANGELOG.md`.
After 1.0, semantic versioning applies to the language, with a deprecation period and
compiler-assisted migration diagnostics for breaking changes.

## Appendix A — Reserved syntax *(informative)*

The following are reserved for future use and SHOULD NOT be relied upon as literal
content: a line beginning with `@` followed by an identifier and whitespace; the
attribute-value form `{ident={...}}`; `<script>`, `<style>` at block level.
