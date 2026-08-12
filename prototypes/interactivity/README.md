# HyMarkX interactivity gate prototype

This directory is a disposable HMX-P01 experiment. It parses documents with the built
`@hymarkx/parser`, walks that real AST, and delegates HTML emission to the built
`@hymarkx/compiler`. It does not modify or replace either package.

The expression implementation is a hand-written tokenizer, precedence parser, static scope
checker, and interpreter. Event expressions are serialized as data for a small generated
interpreter; document expressions are never compiled as JavaScript source.

Run from this directory:

```sh
pnpm install --ignore-workspace
pnpm test
pnpm build
pnpm measure
```

Generated artifacts go to `dist/`. `MEASUREMENTS.md` records the measured results and the
prototype verdict.
