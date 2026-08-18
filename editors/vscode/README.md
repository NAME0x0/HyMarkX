# HyMarkX for VS Code

Language support for [HyMarkX](https://github.com/NAME0x0/HyMarkX) — a Markdown-compatible
language that stays Markdown until you ask it not to.

## What you get

- **Syntax highlighting** for `.hmx`, built on the Markdown grammar so ordinary Markdown keeps
  looking like ordinary Markdown.
- **Diagnostics** as you type, from the same compiler `hmx build` uses. Every one carries a
  stable code — `HMX2044`, `HMX3010` — that you can look up in the specification.
- **Completion** for component names and their attributes, from the component registry rather
  than a hardcoded list.
- **Hover** showing what a component does and which directive forms it accepts.
- **Formatting** with the `hmx fmt` rules.

The compiler runs in-process, so diagnostics are the same ones your build produces. There is no
separate server process to configure, and nothing to install alongside it.

## A one-minute tour

```
---
title: Quarterly report
revenue: 42500
---

# {{ title }}

:::note{type=info}
Revenue reached {{ revenue }} this quarter.
:::
```

A document containing no HyMarkX construct is just CommonMark + GFM — that guarantee is
enforced by a 692-example conformance suite. So renaming a `.md` file to `.hmx` changes
nothing until you use something.

## Status

**Alpha.** The syntax may still change without a migration path, and HyMarkX must not be used
to render untrusted content in production yet. See the
[security policy](https://github.com/NAME0x0/HyMarkX/blob/main/SECURITY.md) and the
[audit](https://github.com/NAME0x0/HyMarkX/blob/main/docs/security-audit.md), which names the
threats that have no test behind them rather than leaving them implied.

## The CLI

The extension is standalone, but the toolchain is worth having:

```sh
npm install -g hymarkx

hmx build page.hmx     # compile to HTML, CSS and, only if needed, JavaScript
hmx check page.hmx     # diagnostics only
hmx fmt page.hmx       # format in place
hmx dev .              # development server with live reload
```

## Links

- [Documentation](https://github.com/NAME0x0/HyMarkX#readme)
- [Language specification](https://github.com/NAME0x0/HyMarkX/blob/main/SPEC.md) — including
  every diagnostic code
- [Guides](https://github.com/NAME0x0/HyMarkX/tree/main/docs/guides)
- [Report an issue](https://github.com/NAME0x0/HyMarkX/issues)

Licensed under MIT OR Apache-2.0.
