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
  attributes (`{title={user.name}}`) are specified in Phase 4 and MUST be rejected
  with `HMX1010` until then, rather than silently treated as literal text.
- Unknown attributes on a known component MUST produce warning `HMX2001` — never a
  silent drop.

### 4.3 Frontmatter *(Phase 2)*

A document MAY begin with a YAML frontmatter block delimited by `---`. It MUST be the
first thing in the file. Its value MUST be a mapping. Frontmatter is metadata: it MUST
NOT be able to alter the document's trust mode (§7).

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
