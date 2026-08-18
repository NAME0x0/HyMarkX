# @hymarkx/formatter

**Deliberately conservative formatter for HMX documents**

Normalises what is unambiguous and leaves everything else alone. It does not repair broken syntax: under error recovery the tree describes the broken parse, so a repair would be a guess.

```sh
npm install @hymarkx/formatter
```

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
