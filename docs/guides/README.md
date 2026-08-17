# Guides

Task-shaped documentation. For the normative rules see [`SPEC.md`](../../SPEC.md); for why a
decision was made, see [`docs/adr/`](../adr/).

| Guide | Covers |
|---|---|
| [Styling](styling.md) | Built-in component styles, design tokens, `<style scoped>` |
| [Components](components.md) | Authoring `.hmx` components, props, `::children` |
| [Interactivity](interactivity.md) | `::state`, event handlers, the emitted runtime |
| [Formatting](formatting.md) | `hmx fmt`, and what it deliberately leaves alone |
| [Dev server](dev-server.md) | `hmx dev`, routing, live reload |
| [Editor support](editor-support.md) | Language server, VS Code, other editors |

Every code example in these guides is compiled by the test suite (`tests/guides/`), so an
example that stops working fails the build rather than misleading a reader.
