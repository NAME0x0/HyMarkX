# ADR-0011 — Styling is CSS with attribute scoping; no native style shorthand

**Status:** Accepted · 2026-08-12

## Context

Phase 3 must answer three questions: how authors write styles, how the built-in components
get an appearance, and whether HMX invents styling syntax of its own.

The charter (§40) warns explicitly against becoming "a second poorly designed CSS
language", and the central product question asks whether a capability makes authoring
materially easier *while preserving Markdown's simplicity*. A shorthand like
`{padding=4 radius=lg}` looks concise on a slide and becomes a worse CSS the moment anyone
needs a media query, a pseudo-class, or a cascade rule.

## Decision

**1. Authors write CSS.** Styles are written in a `<style>` block. No native style
shorthand, no utility-class DSL, no style attributes on directives. If CSS already
expresses something cleanly, HMX defers to it (Rule 10).

**2. Scoping is opt-in via `<style scoped>`**, implemented by attribute rewriting — each
selector gains a generated `[data-hmx-s-<hash>]` attribute, and elements in the document
receive it. This is the Vue/Svelte mechanism, familiar and well understood.

`:global(...)` is the escape hatch for deliberately reaching outside the scope.

**3. Built-in components ship a stylesheet that HMX authors**, emitted **only for the
components a document actually uses**. This is output proportionality applied to CSS: a
document using `note` gets `note` styles and nothing else. It also means `:::note` looks
right with no configuration, which is the "strong defaults" property that distinguishes HMX
from Markdoc's developer-configures-everything model.

**4. Design tokens are CSS custom properties**, defined once on `:root`, used by the
built-in stylesheet, and overridable by authors. No token DSL.

**5. CSS is returned separately** on `CompileResult.css` rather than forced inline. HMX
emits fragments; the host decides whether the CSS goes in `<head>`, a file, or a `<style>`
tag. An `inlineCss` option is provided for single-file output.

**6. `<style>` remains `app`-mode only for now.** `document` mode still emits no author
CSS, per `SECURITY.md`. Untrusted documents get the built-in component stylesheet — which
we wrote — so they still look correct without being able to inject rules.

## Alternatives considered

- **Native style shorthand** (`{padding=4}`). Rejected: it is a worse CSS with a smaller
  feature set, and it fails the central product question as soon as a real layout is needed.
  Reconsider only with evidence that authors are meaningfully blocked by writing CSS.
- **CSS Modules semantics** (rewriting class *names* rather than adding an attribute).
  Rejected for now: it changes what the author sees in devtools and requires rewriting class
  references in the document, which is a larger change for no clear gain over attributes.
- **Sanitized author CSS in `document` mode.** Deferred, not rejected. It needs a real CSS
  threat model — `@import`, `url()` exfiltration, overlay attacks via `position: fixed`,
  and attribute-selector data leaks. That is a task of its own, and shipping it half-done
  would break the invariant that untrusted rendering is safe.
- **A utility framework integration** (Tailwind and similar). Deferred to Phase 10;
  interoperability should fall out of plain CSS rather than being designed for now.

## Consequences

- HMX gains a real dependency on a CSS parser. `postcss@8.5.26` (MIT, 218 KB unpacked, three
  small dependencies, browser-safe) is chosen over hand-rolling a selector rewriter: CSS
  parsing is a commodity problem with many edge cases (strings, comments, nested at-rules,
  escapes), and `BACKLOG.md` already rejects hand-rolling commodity parsers.
- The dependency boundary extends: `postcss` belongs to `@hymarkx/compiler` only.
- Scoped styles must not reintroduce JavaScript. Scoping happens at compile time; the runtime
  stays at zero bytes for static documents.
- Styling untrusted documents remains impossible until the deferred CSS threat model is done.
  That is a real limitation and is recorded as such rather than glossed.
