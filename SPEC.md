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
- A text directive MUST NOT be recognized when the character immediately preceding its `:` is
  alphanumeric (ADR-0017). Start of line, whitespace, and punctuation all still open one. This
  keeps `12:30`, `3:4`, and `a:b` as prose: without it, `:30` parses as a directive, finds no
  component, and — having no label to render — destroys the text. Leaf and container directives
  are unaffected, being block constructs with nothing before them.

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
- Inside a quoted value, a backslash followed by a backslash, a double quote, or a single quote
  MUST produce that character literally (ADR-0018). A backslash followed by anything else is
  itself, literally, so a Windows path in an attribute is unchanged. Without escapes a value
  cannot contain its own delimiter, and a value containing both quote characters cannot be
  written at all. Unquoted values are unaffected: they cannot contain a quote character.

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

When a component's schema declares an attribute, that attribute belongs to the component:
the value MUST be passed to the component and MUST NOT also be emitted as an HTML attribute
of the same name. `class` and `id` are exceptions and continue to reach the element whether
declared or not, because both are structural — an author writing either intends it to apply
alongside whatever the component sets. See ADR-0019.

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

The reserved keys `title`, `description`, and `lang` supply a document's `<title>`, its
description meta, and its language when a processor emits a complete HTML document (§5). `lang`
MUST be validated as a BCP-47-shaped tag and MUST fall back to `en` with `HMX2023` when it is
not — a language tag is a constrained vocabulary, and escaping alone would leave a safe attribute
containing nonsense.

The reserved keys `canonical`, `icon`, `image`, `siteName`, and `author` supply the document's
head metadata when a processor emits a complete HTML document (§5). All five are strings; a
value of another type MUST report `HMX2022`, as every reserved key does.

Reserved keys at this version: `title`, `description`, `layout`, `lang`, `draft`, `canonical`,
`icon`, `image`, `siteName`, `author`.
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
block in a document with nothing to scope. A block that requested no scoping — every rule
`:global(...)`, or keyframes only — MUST NOT be reported: it emits real CSS and asked for no
scope attribute, so there is nothing missing.

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

An authored component MAY contain scoped styles (§4.4), component-local state, and
allowlisted HMX event handlers (§4.7), and MUST NOT contain scripts. Expansion itself happens
at compile time; a document using authored components with no interactive construct MUST
still emit zero HMX JavaScript.

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

A processor MAY emit a complete HTML document rather than a fragment. When it does:

- The document MUST begin with `<!doctype html>` and MUST declare `charset=utf-8`.
- `<title>` MUST be present, taken from frontmatter `title`, else the first heading's text,
  else the input's base name. HTML requires it, so a processor MUST NOT omit it.
- `lang` MUST come from frontmatter `lang` when it is a valid BCP-47-shaped tag, and MUST fall
  back to `en` with `HMX2023` when it is not.
- A stylesheet or script reference MUST be omitted when the corresponding output is empty.
- The emitter MUST NOT include an HMX JavaScript runtime for documents that use no
  interactive construct.
- The head keys `canonical`, `icon`, `image`, `siteName`, and `author` supply, respectively, a
  canonical link and `og:url`, an icon link, `og:image` with `twitter:image` and a
  `twitter:card` of `summary_large_image`, `og:site_name`, and an author meta. `og:title`,
  `og:description`, and `og:type` MUST be derived from the resolved title and description
  rather than declared again.
- Social metadata MUST be emitted only when the document declares at least one of `canonical`,
  `icon`, `image`, or `siteName`. A document declaring none MUST produce the head it would
  have produced without this feature.
- `canonical`, `icon`, and `image` are URL-valued and MUST be subject to the same scheme policy
  as a Markdown link destination in the active trust mode (§7). A rejected value MUST report
  `HMX3003` and MUST omit its tag; a processor MUST NOT substitute a default.

A processor MUST NOT provide a general mechanism for placing arbitrary elements or arbitrary
`meta` names into the head. `http-equiv` reaches page navigation and content security policy,
and trust mode is host-selected: no document construct may escalate it (§7). See ADR-0020.

## 6. Diagnostics

A conforming processor MUST report failures as diagnostics with a stable code, a
severity, and a source span (see `ARCHITECTURE.md` §4). It MUST NOT abort on the first
error where recovery is possible; collecting multiple diagnostics per run is required.

Codes are grouped by range, and the range is part of the contract:

| Range | Meaning |
|---|---|
| `HMX1xxx` | Syntax and recovery — the document could not be read as written |
| `HMX2xxx` | Semantics and validation — the document parsed but does not mean anything valid |
| `HMX3xxx` | Trust and safety — the document asked for something its trust mode forbids |
| `HMX5xxx` | Host and internal failures — not the document's fault |

Every code a processor emits is listed in [Appendix B](#appendix-b--diagnostic-codes-normative).

## 7. Trust modes *(normative)*

A processor MUST support two modes:

- **`document`** — the default. Scripts, raw HTML event-handler attributes, and imports MUST
  be rejected with an `HMX3xxx` diagnostic. Compiled HMX handlers are permitted under §4.7.
  Raw HTML MUST be sanitized against an allowlist. URL attributes MUST be restricted to
  `http`, `https`, `mailto`, and relative references.
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

## Appendix B — Diagnostic codes *(normative)*

Every code the reference implementation emits. `tests/spec/diagnostic-codes.test.mjs` fails if
a code is emitted without appearing here, or appears here without being emitted — a documented
code that does not exist is as much a defect as an undocumented one that does.

Codes are stable once published. A condition may be reworded; a code may not be reused for a
different condition, and a retired code stays listed rather than being deleted.

### `HMX1xxx` — syntax and recovery

| Code | Severity | Condition |
|---|---|---|
| `HMX1001` | error | Container directive is not closed; recovery closes it at end of document |
| `HMX1002` | error | Document nests deeper than the Markdown engine can process |
| `HMX1011` | warning | A line matches `:{2,}[A-Za-z0-9]` but was not recognized as a directive |
| `HMX1020` | error | Interpolation is not closed |
| `HMX1021` | error | Expression nests too deeply |
| `HMX1022` | error | Expression could not be parsed or compiled safely |

### `HMX2xxx` — semantics and validation

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
| `HMX2020` | error | Frontmatter is not a mapping |
| `HMX2021` | error | Frontmatter is not valid YAML, including refusal to expand aliases |
| `HMX2022` | error | Reserved frontmatter key holds the wrong type |
| `HMX2023` | warning | Frontmatter `lang` is not a valid language tag; `en` is used instead |
| `HMX2030` | error | Scoped CSS does not parse |
| `HMX2031` | warning | Scoped style has no emitted elements to scope |
| `HMX2040` | error | Expression reads an identifier that is not in scope |
| `HMX2041` | error | Computed property name is not a scalar |
| `HMX2042` | error | Numeric result is not finite |
| `HMX2043` | error | Object or array rendered in a text position |
| `HMX2044` | error | Construct outside the expression sub-language: calls, arrow functions, `++`/`--`, the comma operator, tagged templates |
| `HMX2050` | error | Authored component document is malformed |
| `HMX2051` | error | Authored component's declared props are malformed |
| `HMX2052` | warning | Authored component is given content but has no `::children` to place it |
| `HMX2053` | error | Authored component prop fails its declared schema |
| `HMX2054` | error | Authored components form a cycle |
| `HMX2055` | error | Authored component expansion exceeds the maximum depth |
| `HMX2056` | error | `::children` outside an authored component document |
| `HMX2057` | error | Authored component registered more than once |
| `HMX2060` | error | Event attribute is not allowlisted |
| `HMX2061` | error | Assignment outside an event handler, or an event attribute with no handler |
| `HMX2062` | error | State name is not a valid identifier, or collides with a name already in scope |
| `HMX2063` | error | `::state` not declared at a document or authored-component root |
| `HMX2070` | info | Island needs a framework runtime the host must supply — reported so the cost is not silent |
| `HMX2072` | error | Island's `from` specifier is missing or not an allowed form |

### `HMX3xxx` — trust and safety

| Code | Severity | Condition |
|---|---|---|
| `HMX3001` | error | `<script>` or `<style>` markup where the trust mode forbids it |
| `HMX3002` | error | Inline event-handler attribute where the trust mode forbids it |
| `HMX3003` | error | URL scheme not permitted in `document` mode |
| `HMX3005` | error | Directive attribute name can modify object prototypes |
| `HMX3006` | error | Path escapes the project root |
| `HMX3007` | error | Frontmatter key can modify object prototypes |
| `HMX3010` | error | Foreign component used outside `app` trust mode |

### `HMX5xxx` — host and internal failures

Not the document's fault. A processor SHOULD make that clear in how it reports them.

| Code | Severity | Condition |
|---|---|---|
| `HMX5001` | error | Internal parser failure |
| `HMX5002` | error | Unsupported input file extension |
| `HMX5003` | error | Two inputs would write the same output file |
| `HMX5004` | error | A component file could not be read |
