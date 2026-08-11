# HyMarkX Trademark Policy

**Status:** initial policy. Not legal advice, and not a registered mark at this time.

The HyMarkX source code is open source under `MIT OR Apache-2.0`. The project's **names
and marks are not.** Copyright licensing and trademark are separate: a permissive code
licence lets you use, fork, and sell the software, and says nothing about whether you may
call your version by this project's name.

## Marks covered

`HyMarkX` · `HMX` · the `.hmx` file extension used as a product identifier ·
the `hmx` command name · the `@hymarkx` package scope · any project logo

**Registry status** (2026-08-11): the npm package `hymarkx` and the npm organization
`hymarkx` — and therefore the `@hymarkx` scope — are held by the project. The unscoped
name `hmx` is **not** obtainable: npm's name-similarity policy rejects it as too close to
existing packages. This costs nothing, because a package declares its own binary name —
`hymarkx` installs a command called `hmx` regardless.

## What you may do without asking

- Use the software for anything, commercially or otherwise, per the code licence.
- State truthfully that your project **uses**, **is built with**, **supports**, or
  **is compatible with** HyMarkX.
- Write about HyMarkX, teach it, review it, criticise it, and use the name to refer to
  this project.
- Publish packages whose names describe a relationship, such as `eslint-plugin-hymarkx`
  or `hymarkx-vscode`, provided they do not imply official status.

## What requires permission

- Naming a **fork or derivative** HyMarkX, or a name confusingly similar to it.
- Publishing under the `@hymarkx` npm scope.
- Using the marks as your product, company, or service name, or in your logo.
- Claiming that a modified compiler is HyMarkX, or that an implementation is
  **HyMarkX-conformant**, without passing the conformance suites in `tests/conformance/`.
- Implying endorsement, affiliation, or official status.

## Why this exists

HyMarkX is a *language*. Its value depends on `.hmx` meaning one thing everywhere. If
incompatible dialects can all call themselves HyMarkX, the compatibility guarantee in
`SPEC.md` becomes unverifiable and the specification becomes worthless. This policy exists
to protect the meaning of the name, not to restrict use of the software.

Forks are welcome and explicitly encouraged by the code licence. Name them something else.

## Requests

Open an issue titled `trademark:` describing the intended use.
