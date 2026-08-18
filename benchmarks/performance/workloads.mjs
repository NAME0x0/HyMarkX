/**
 * The corpus the performance baseline is measured against.
 *
 * Every workload is generated from a repeating unit so it can be scaled to any size, which is
 * what makes the complexity check possible: the same content at 1x, 2x, 4x and 8x should cost
 * the same per byte. A fixed corpus of hand-written files could not distinguish "slower" from
 * "quadratic", and quadratic is the failure that actually breaks a build.
 */

/** Plain CommonMark. Invariant 1 says this path must stay competitive with a bare parser. */
const PROSE = `## Section heading

Prose with *emphasis*, **strong**, \`code\`, and a [link](https://example.test/page).
A second sentence so the paragraph is not trivially short, with an ellipsis … and an
em dash — both of which exercise character handling.

- first item
- second item with \`code\`
- third item

> A block quote with **strong** text.

\`\`\`js
const value = compute({ nested: true })
\`\`\`

| column | value |
|---|--:|
| alpha | 1 |
| beta | 2 |

`

/** Directive-heavy: the construct the tokenizer extensions own. */
const DIRECTIVES = `:::note{type=info}
A note with :badge[shipped]{kind=success} inline and some prose after it.
:::

::::grid{columns=3}
:::card{title="Revenue"}
Body text for the card.
:::
:::card{title="Users"}
Body text for the card.
:::
:::card{title="Growth"}
Body text for the card.
:::
::::

`

/** Expression-heavy: parse, compile, and evaluate the restricted sub-language. */
const EXPRESSIONS = `Total is {{ revenue }} across {{ users }} accounts, or {{ revenue / users }}
each. Growth was {{ growth * 100 }} percent, and the label reads {{ title }}.

:::card{title={title}}
Nested interpolation: {{ revenue + users - growth }} and {{ users * 2 }}.
:::

`

/** Raw HTML, which in document mode goes through sanitization on every node. */
const HTML = `<div class="wrapper" id="main">
  <p>Paragraph with <em>emphasis</em> and <a href="https://example.test/">a link</a>.</p>
  <img src="https://example.test/image.png" alt="An image">
</div>

Prose between blocks so the HTML is not one continuous run.

`

const FRONTMATTER = `---
title: Baseline document
revenue: 42500
users: 14302
growth: 0.184
tags:
  - performance
  - baseline
---

`

export const WORKLOADS = [
  { name: 'prose', unit: PROSE, frontmatter: '', trust: 'document' },
  { name: 'directives', unit: DIRECTIVES, frontmatter: '', trust: 'document' },
  { name: 'expressions', unit: EXPRESSIONS, frontmatter: FRONTMATTER, trust: 'document' },
  { name: 'html', unit: HTML, frontmatter: '', trust: 'document' },
  { name: 'mixed', unit: PROSE + DIRECTIVES + EXPRESSIONS, frontmatter: FRONTMATTER, trust: 'app' },
]

/** Builds a document of roughly `repeats` units, with headings kept unique. */
export function build(workload, repeats) {
  let source = workload.frontmatter
  for (let index = 0; index < repeats; index += 1) {
    source += workload.unit.replace('## Section heading', `## Section heading ${index}`)
  }
  return source
}
