# Authored components

An authored component is an `.hmx` document that declares its props in frontmatter. It is
expanded while HMX builds the calling document, so it adds no browser runtime or JavaScript.

## Write a component

Create `components/Card.hmx` beside the document (or in the project-root `components`
directory):

```md
---
props:
  title: { type: string, required: true }
  tone: { type: enum, values: [info, warning], default: info }
---
<style scoped>
.authored-card { border-color: currentColor; }
</style>

:::card{class=authored-card title={title}}
## {{ title }}

Tone: {{ tone }}

::children
:::
```

The filename registers the case-sensitive name: `Card.hmx` becomes `Card`. Capitalized names
are the convention for authored components; lowercase names identify built-ins such as `card`.

The `props` mapping uses the same schema as built-in components. Supported types are `string`,
`number`, `boolean`, `enum`, `identifier`, and `url`. A prop may also declare `required`,
`default`, `min`, `max`, `values`, and `description` where those rules apply. An enum must
provide `values`. A component without `props` accepts no component-specific attributes.

Inside the component, expressions can read only resolved props. Defaults have already been
applied and values have already been validated and coerced. Page frontmatter, props belonging
to a calling component, and non-`props` keys in the component's own frontmatter are not in
scope; pass every required value explicitly as a prop.

The universal `id`, `class`, and `title` attributes remain available whether or not they are
declared as props. On an authored component call, they are merged onto the component's first
emitted element. If an attributed component emits no element, HMX creates a `div` to carry
them.

## Use the component

Call it as a container directive. Content between the fences is inserted at `::children`:

```md
# Authored components

:::Card{title="First card" tone=info}
First **body**.
:::

:::Card{title="Second card" tone=warning}
Second body.
:::
```

If a component has no `::children`, it may still be called without content. Supplying content
in that case produces `HMX2052` because the content would be discarded. A component may have
at most one `::children`; duplicates produce `HMX2053`. Named slots are not available in this
phase.

Scoped component CSS is emitted only when the component is used and only once per component,
even when the document uses that component many times. Components may declare local HMX state
and allowlisted HMX event handlers as described in the
[interactivity guide](interactivity.md). They cannot contain scripts, raw HTML event handlers,
embedded `srcdoc` markup, or script-capable URL schemes. This remains true when the host
compiles the calling document in app trust mode.

## How files are resolved

For each input, the CLI first discovers `.hmx` files in a `components` directory beside that
input, then adds components from the project-root `components` directory. A same-named local
component takes precedence. The CLI treats its current working directory as the project root.

The calling document may also define a frontmatter `components` mapping from a registered name
to a file path. These paths are resolved relative to the calling document and override
discovered names. All resolved files must stay inside the project root; missing files produce
`HMX5004`, and paths that escape the root are rejected.
