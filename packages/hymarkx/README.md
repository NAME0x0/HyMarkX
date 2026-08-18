# hymarkx

**The HyMarkX command-line tool.** Installs the `hmx` binary.

```sh
npm install -g hymarkx
hmx build index.hmx
```

This package is a thin installer; the implementation is [`@hymarkx/cli`](https://www.npmjs.com/package/@hymarkx/cli).
It exists because `hmx` is not available as an npm package name — the registry rejects it as
too similar to existing packages — so the tool you type is `hmx` and the package you install
is `hymarkx`.

`hmx build` compiles documents to HTML, `hmx check` reports diagnostics, `hmx fmt` formats,
and `hmx dev` serves with live reload.

Part of [HyMarkX](https://github.com/NAME0x0/HyMarkX) — a Markdown-compatible language that
stays Markdown until you ask it not to. A document containing no HMX construct renders as
CommonMark + GFM; that is enforced by a 692-example conformance suite and a compatibility
suite over real documents.

- [Documentation](https://github.com/NAME0x0/HyMarkX#readme)
- [Language specification](https://github.com/NAME0x0/HyMarkX/blob/main/SPEC.md)
- [Security policy](https://github.com/NAME0x0/HyMarkX/blob/main/SECURITY.md)

**Status: pre-release.** The syntax may change without a migration path, and HyMarkX must not
be used to render untrusted content in production yet.

Licensed under MIT OR Apache-2.0.
