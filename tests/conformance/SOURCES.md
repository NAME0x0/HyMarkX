# Conformance fixture sources

## CommonMark 0.31.2

- Source: <https://spec.commonmark.org/0.31.2/spec.json>
- SHA-256 of the vendored file: `fbe61ddb5a96368a08ce39e167f7a1d14858d21082f8706ac014d634a2f927f5`
- The file is re-serialized (formatting only), so it does not match the upstream byte
  hash. Verified 2026-08-11: all 652 `markdown`/`html` pairs are identical to upstream.
- Examples: 652

The JSON fixture is vendored so the conformance suite runs fully offline.

## GitHub Flavored Markdown 0.29

- Specification: <https://github.github.com/gfm/>
- Upstream examples: tables 198–205, task items 279–280, strikethrough 491–493,
  and autolinks 622–632
- Additional cases: 16 hand-written combinations covering each table alignment,
  task-marker variants, nested task lists, strikethrough nesting, and literal autolinks

The GFM suite is hand-maintained in `gfm.json`; expected output follows the specification
plus HMX-003's required task-checkbox serialization.
