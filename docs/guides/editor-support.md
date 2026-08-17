# Editor support

## What you get

- **Diagnostics** as you type — the same codes and spans `hmx check` reports.
- **Completion** for component names after `:::` and attribute names inside `{ }`.
- **Hover** showing a component's description and its attributes with types and defaults.
- **Formatting** through `@hymarkx/formatter`, so the editor and `hmx fmt` agree exactly.
- **Syntax highlighting** for directives, attributes, interpolations, and frontmatter, with
  ordinary Markdown highlighting underneath.

Completion and hover read the **component schemas** directly. There is no second catalogue
to fall out of date, so an editor cannot suggest an attribute the compiler will reject.

## VS Code

The extension lives in `editors/vscode`. It is not published yet; to try it, open that
folder in VS Code and press F5 to launch an Extension Development Host.

## Other editors

The server speaks LSP over stdio and has no editor-specific code:

```bash
hmx-language-server
```

Point any LSP client at that binary for files with the `hymarkx` language id. Neovim,
Helix, and Emacs `lsp-mode` all work this way.

## Design notes

**No `vscode-languageserver` dependency.** The protocol subset needed here is a
`Content-Length` header and a JSON body. Hand-writing it keeps the dependency count at zero
for a package that has to stay stable across editor versions.

**Full document sync, not incremental.** micromark is not an incremental parser, and
ADR-0015 measured a full reparse at ~11 ms for a 2 KB document and ~43 ms at 10 KB — inside
a keystroke budget at the sizes documents actually reach. Incremental parsing would mean
maintaining a second grammar to fix a problem the measurements say does not exist.

If editing latency ever becomes the binding constraint on a real project, the escape hatch
is a tree-sitter grammar serving the editor only, with the micromark pipeline remaining the
semantic source of truth. That is a decision to make from a profile, not a preference.

## Not implemented yet

Go-to-definition for authored components, find-references, rename, semantic tokens, and
workspace-wide diagnostics. Each needs a project model — knowing every document, not just
the open ones — which the server deliberately does not have yet.
