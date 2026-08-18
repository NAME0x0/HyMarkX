# @hymarkx/parser

**Markdown + HMX directives to an AST with real source spans**

The only package that imports micromark or mdast (ADR-0005). Parses CommonMark 0.31.2 + GFM plus HMX directives, frontmatter, and interpolation, and gives every node a real source span.

```sh
npm install @hymarkx/parser
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
