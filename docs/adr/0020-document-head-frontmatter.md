# ADR-0020 — Reserved frontmatter keys for the document head

**Status:** Accepted · 2026-08-21

## Context

`renderDocument`, shipped in 0.0.4 to the design in
`docs/superpowers/specs/2026-08-19-document-emission-design.md`, assembles a complete page from
three reserved frontmatter keys: `title`, `description`, `lang`. Nothing else reaches the
`<head>`.

That was right for "a fragment cannot be opened in a browser". It is not enough for a page
whose job is to survive being shared. Building the HyMarkX site surfaced the shortfall
concretely: a landing page written in HMX has no favicon, no Open Graph tags, and no canonical
URL, so a link posted to Slack or X renders as a bare grey rectangle. The one thing the page
exists to do — convert someone who arrived from a link — is the thing it cannot do.

The gap is not specific to this site. Any HMX document published as a page hits it.

A second finding from the same spike bounds the feature. Page-level `<style>` is rejected in
`document` mode, but a component's `<style scoped>` is accepted, and `:global(...)` inside it
emits genuinely unscoped CSS. So a document already has a supported route to site-wide styling
without app mode. `stylesheets:` would be a second route to somewhere HMX can already go.

## Options considered

**A general `head:` mapping.** Whatever the author writes becomes tags. Maximum power, and
rejected on the security reading rather than the design one: `<meta http-equiv="refresh">` is a
navigation primitive, so a document could redirect its host, and `http-equiv` also reaches
`Content-Security-Policy`, letting a document weaken the policy the host chose. Trust mode is
host-selected and no document construct may escalate it (invariant 6). A general mapping is
exactly such a construct.

**A `head:` mapping with a tag allowlist.** Narrower, and still the wrong shape: the author
writes HTML-tag vocabulary (`property`, `rel`, `content`) inside a Markdown document's
frontmatter, and every future restriction reads as an arbitrary hole in a general feature. The
allowlist is the real design, so it should be the surface.

**Named reserved keys, one per intent.** Chosen. Each key names what the author wants, not the
markup that expresses it, and the processor decides the tags. It matches how `title`,
`description` and `lang` already work, so the frontmatter surface stays one kind of thing.

## Decision

**Five further reserved frontmatter keys, all optional, all strings.** They are typed by the
existing `reservedTypes` table, so a wrong type already reports `HMX2022` with no new
machinery.

| Key | Emits |
|---|---|
| `canonical` | `<link rel="canonical">` and `og:url` |
| `icon` | `<link rel="icon">` |
| `image` | `og:image`, `twitter:image`, and `twitter:card` of `summary_large_image` |
| `siteName` | `og:site_name` |
| `author` | `<meta name="author">` |

`og:title`, `og:description` and `og:type` are derived from the already-resolved title and
description — an author who has named their page should not have to name it twice.

**They are emitted only when the document asks for them.** Declaring any of `canonical`,
`icon`, `image` or `siteName` opts the document into the social block; a document declaring
none gets exactly the head 0.0.4 produced, byte for byte. This is the output-proportionality
rule that already governs CSS and JavaScript: nothing is emitted that the document did not use.

**URLs go through the existing policy, not a new one.** `canonical`, `icon` and `image` are
URL-valued, and in `document` mode a value whose scheme is not allowed is reported as
`HMX3003` and its tag is omitted — the same code, severity and treatment as a `javascript:`
link in the body. §4.2.1 already forbids a second, independent URL policy; that applies here.
A `javascript:` favicon is an attack, not a typo, so it is an error rather than a fallback.

`renderDocument` gains a `trust` option to make this decision. It defaults to `document`,
the safe direction, so a caller that forgets it gets the stricter policy rather than the
looser one.

## Rejected

**`stylesheets:`.** A component's `<style scoped>` with `:global(...)` already emits unscoped
CSS in document mode — verified against the published 0.0.5, not assumed. A second route adds
`<link rel>` to the surface, and `rel` is where `preload`, `prefetch` and `modulepreload` live;
the last reaches script. Revisit only if a real document cannot be styled the existing way.

**`scripts:`.** Invariant 7 says a static document emits zero HMX JavaScript, and the runtime
is a security boundary. A frontmatter key that introduces script is the escape hatch that
invariant exists to refuse.

**`robots`, `themeColor`, `keywords`.** No demand. `keywords` is ignored by every major search
engine. These are cheap to add later against evidence and awkward to remove once documented.

## Consequences

**Frontmatter grows from five reserved keys to ten**, which is the main cost. The mitigation is
that they are all the same kind of thing — a name for something the page is — rather than five
new mechanisms.

**Diagnostic spans stay coarse.** `CompileResult` carries frontmatter as plain data with no
spans, so a rejected URL reports at the zero span, as `HMX2023` already does for `lang`. The
right fix is surfacing frontmatter value spans on `CompileResult`; it is deliberately not in
this change, and belongs in the backlog with the diagnostic-quality items.

**No conformance impact.** A document with no frontmatter, or with frontmatter declaring none
of these keys, produces byte-identical output.

**No new diagnostic codes.** `HMX2022` covers wrong types and `HMX3003` covers rejected URLs.
Reusing them is the point: a URL rejected in the head and a URL rejected in the body are the
same event and should be one code.
