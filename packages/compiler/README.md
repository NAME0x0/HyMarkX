# @hymarkx/compiler

**Compiles HMX documents to HTML, CSS, and an optional runtime**

Validates against component schemas, evaluates the restricted expression language at compile time, scopes CSS, and emits proportional output — a document that uses no interactivity ships no JavaScript.

```sh
npm install @hymarkx/compiler
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
