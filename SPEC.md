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
- Attribute values are literal strings or Phase 4 expressions written as a nested brace
  value (`{title={user.name}}`). Expressions resolve against frontmatter at compile time;
  their result is validated against the declared attribute schema without string coercion.
- A processor MUST emit `HMX1011` (warning) for any paragraph whose first line matches
  `:{2,}[A-Za-z0-9]`, so malformed block directives such as `:::card{ bad` are reported
  rather than silently rendered as prose.
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

### 4.4 Styles *(Phase 3)*

Authors write CSS. There is no native style shorthand (ADR-0011).

A `<style>` block is permitted in `app` mode only; in `document` mode it MUST be rejected
with `HMX3001` and its content MUST NOT reach the output or the returned stylesheet.

A processor MUST return the document's stylesheet separately from its HTML, because HMX
emits fragments and the host decides where styles belong. It MAY offer inlining as an
option.

`<style scoped>` restricts its rules to the document that declared them. A conforming
processor MUST:

- add a generated attribute of the form `data-hmx-s-<hash>` to every element it emits for
  that document, and rewrite each selector so it requires that attribute;
- derive the hash deterministically from document identity, so identical input produces
  identical output (§5);
- scope each selector in a selector list independently, attaching the attribute to the
  final compound selector, before any pseudo-class or pseudo-element;
- scope the rules **inside** conditional at-rules such as `@media` and `@supports`, not the
  at-rule itself;
- **not** scope `@keyframes` selectors (`from`, `to`, percentages);
- emit `sel` unscoped for `:global(sel)`.

A processor MUST emit style rules only for the components a document actually uses.

Diagnostics: `HMX2030` (error) for a CSS syntax error, whose span MUST point into the
document rather than to the start of the style block; `HMX2031` (warning) for a scoped
block in a document with nothing to scope.

Styling of untrusted documents by their authors is **not** available at this version. It
requires a CSS threat model covering `@import`, `url()` exfiltration, overlay attacks, and
attribute-selector data leaks, and is deliberately deferred rather than partly implemented.

### 4.5 Expressions *(Phase 4 — see ADR-0004 and ADR-0012)*

Text interpolation uses `{{ expression }}` and is evaluated at compile time against the
document frontmatter mapping only. `\{{` produces literal `{{`; interpolation syntax is
not recognized inside inline code, fenced code blocks, or indented code blocks.

The Phase 4 expression subset contains literals, identifiers, member and index access,
`! - +`, arithmetic and comparison operators, `&& || ??`, ternaries, optional chaining,
parentheses, arrays, and objects. Function calls and every construct capable of mutation,
host access, or executable code creation are prohibited. Unknown identifiers and missing
unguarded properties are compile errors. Compilation writes escaped scalar results into
HTML and emits no expression runtime or script.
### 4.6 Authored components *(Phase 5)*

A **component** MAY be authored as an HMX document (ADR-0013). Such a document declares its
accepted properties under the reserved frontmatter key `props`, whose value MUST be a
mapping of property name to the same attribute-schema shape defined in §4.2.1.

A processor MUST:

- register an authored component under its file basename, matched **case-sensitively**, and
  SHOULD adopt the convention that capitalised names denote authored components while
  lowercase names denote those the processor provides;
- report `HMX2050` (warning) when an authored component shadows a provided one;
- expose the component's resolved properties, **and nothing else**, as the scope for
  expressions inside it (§4.5). A component MUST NOT observe the calling document's
  frontmatter, the caller's properties, or any ambient value;
- validate supplied attributes against the declared `props` exactly as §4.2.1 requires,
  producing the same diagnostics;
- render the caller's content at the position of a `::children` leaf directive, and report
  `HMX2053` (error) if more than one appears;
- detect expansion cycles and report `HMX2054` (error) naming the cycle, and cap expansion
  depth with `HMX2055` (error). Unbounded expansion is a build-time denial of service.

Component resolution — locating component sources — is a **host** responsibility. A
conforming processor MUST accept components as data and MUST NOT require filesystem access.

At this version an authored component MAY contain scoped styles (§4.4) and MUST NOT contain
state, event handlers, or scripts. Expansion happens entirely at compile time; a document
using authored components MUST still emit zero HMX JavaScript.

Named slots are not specified at this version.
### 4.7 State and events *(Phase 6)*

A document or authored component MAY declare reactive state with a `::state` leaf directive
whose attributes name the state values (ADR-0014). Declared names join the expression scope
(§4.5) alongside props.

Normative rules:

- State is **component-local**. Each expansion of a component owns its own state; two uses of
  the same component MUST NOT share it. The page document is the outermost component.
- State MUST NOT be visible to child components. Values reach a child only as props.
- State values are the scalars expressions already support: string, number, boolean, null.
- A processor MUST compile the dependency between each state name and the text or attribute
  positions that read it, and MUST update only those positions when the value changes. It
  MUST NOT re-render the document or diff a tree.
- Initial values MUST be rendered into the HTML, so the document is correct before any script
  runs.
- Named derived state is **not** specified at this version.

Event handlers are declared with allowlisted attributes: `on-click`, `on-input`,
`on-change`, `on-submit`, `on-focus`, `on-blur`, `on-keydown`. A processor MUST reject any
other `on-` attribute (`HMX2060`).

Inside a handler — and **only** inside a handler — an expression MAY assign to a declared
state name, which is the single exception to the prohibition in §4.5. Assignment to any
other name is an error (`HMX2061`).

Interactive documents are permitted in **both** trust modes. A handler MUST be able to read
and assign declared state and to do nothing else: a conforming runtime MUST NOT expose the
DOM, network, storage, or any host global. This is what makes untrusted interactivity safe,
and a processor that weakens it is non-conforming.

A document containing no interactive construct MUST emit zero bytes of runtime.

Sections 4.5–4.7 are placeholders. Implementing syntax for them before this document
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

The following are reserved and SHOULD NOT be relied upon as literal content: the
attribute-value form `{ident={...}}`; the interpolation sigil `{{` (escape it as `\{{`);
`<script>` and `<style>` at block level.

A leading `@` is **no longer reserved**. ADR-0014 rejects the `@`-statement family, so a
line beginning with `@` is ordinary text and will stay that way.
