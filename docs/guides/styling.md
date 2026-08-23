# Styling

Built-in components include a restrained default stylesheet. HMX returns it as
`result.css`; `hmx build` writes it beside the HTML file. Only components present in the
document contribute rules.

```md
:::note[Heads up]{type=warning}
Deployment starts at 8 PM UTC.
:::
```

This emits the note rules and shared tokens, but no card, grid, metric, or badge rules.

When you want a wrapper to hang your own layout on, use `:::box`. It emits a plain `div`
carrying only the `class` and `id` you gave it — no default class and no stylesheet, so it
costs nothing:

```md
:::box{class=hero}
# Ship it
:::
```

Reach for `:::grid` when you actually want its columns, and `:::box` the rest of the time.

Give it `as` when the wrapper means something — `section`, `article`, `nav`, `header`, `footer`,
`aside`, or `main`. A page built entirely from `div`s has no landmarks for a screen reader:

```md
:::box{as=nav class=site-nav}
[Home](/) · [Docs](/docs)
:::
```

The list is closed rather than any tag name, because the value becomes an element and a document
choosing its own element is what `document` mode exists to prevent. An unknown value produces
`HMX2004` with the nearest suggestion.

## Design tokens

Override tokens with ordinary CSS. Put the opening tag of a non-empty plain style block on
its own line, as below. Author `<style>` blocks require app mode and are removed from the
emitted HTML.

```md
<style>
:root {
  --hmx-radius: 0.75rem;
  --hmx-color-info: #5b21b6;
}
</style>

:::note
Custom tokens, built-in structure.
:::
```

The supported tokens are:

- Colours: `--hmx-color-surface`, `--hmx-color-text`, `--hmx-color-muted`,
  `--hmx-color-border`, `--hmx-color-info`, `--hmx-color-warning`,
  `--hmx-color-danger`, and `--hmx-color-success`.
- Spacing: `--hmx-space-sm`, `--hmx-space-md`, and `--hmx-space-lg`.
- Shape: `--hmx-radius` and `--hmx-border`.

The defaults respond to `prefers-color-scheme: dark`. Component selectors use `:where()`,
so ordinary author selectors override them without a specificity contest.

## Scoped styles

`<style scoped>` adds a deterministic `data-hmx-s-*` attribute to generated elements and
rewrites each local selector to match it. `:global(...)` deliberately leaves its argument
unscoped. Rules inside `@media` and `@supports` are scoped; keyframe selectors are not.

```md
<style scoped>
.profile > p { max-inline-size: 60ch; }
:global(body) .profile { margin-inline: auto; }
</style>

:::card[Profile]{.profile}
Scoped card content.
:::
```

Plain and scoped author styles are rejected with `HMX3001` in document mode. Built-in
component CSS remains available there because it is compiler-authored. For a single-file
API result, set `inlineCss: true`; the compiler places a `<style>` element before the HTML
content while retaining the same stylesheet in `result.css`.
