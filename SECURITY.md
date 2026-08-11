# HyMarkX — Security Policy and Threat Model

**Status:** living document. Sections marked *(planned)* describe controls not yet
implemented; they are recorded here so the architecture accommodates them.

## Reporting

HyMarkX is pre-release and has no published security contact yet. Until one exists,
report suspected vulnerabilities by opening a GitHub issue marked `security:` — with
the understanding that the project currently offers **no security guarantees** and
MUST NOT be used to render untrusted content in production.

## The core invariant

> **Rendering an untrusted HMX document MUST NOT grant it code execution, filesystem
> access, network access, or the ability to raise its own privileges.**

Everything below serves that sentence.

## Trust modes

The trust level is a property of the **host**, never of the document. There is no
in-document construct that enables scripting. A document that could opt itself into
`app` mode would make the invariant unenforceable.

### `document` mode (default)

| Capability | Status |
|---|---|
| `<script>`, `<style>` blocks | rejected — `HMX3001` |
| inline event handlers (`onclick=`) | rejected — `HMX3002` |
| raw HTML | sanitized against an element/attribute allowlist |
| URL schemes | `http`, `https`, `mailto`, relative only — `javascript:`, `data:`, `vbscript:`, `file:` rejected (`HMX3003`) |
| imports / module resolution | disabled — `HMX3004` |
| filesystem access | none |
| network access at build time | none |
| expressions | pure subset only, no host object access |
| output | deterministic; no ambient state observable |

### `app` mode (opt-in, host-selected)

Scripts, imports, and raw HTML are permitted. The host has asserted the content is
trusted. HMX still applies escaping in text positions and still refuses to construct
`javascript:` URLs from expression results.

## Threat model

Assets: the viewer's browser session, the build machine, the developer's secrets, and
the integrity of generated output.

| # | Threat | Vector | Control |
|---|---|---|---|
| T1 | Stored XSS | untrusted document rendered on a site | `document` mode sanitization; escaping in text positions; security test suite |
| T2 | Scheme injection | `[x](javascript:…)`, `<img src=data:…>` | URL scheme allowlist, applied after expression evaluation, not before |
| T3 | Attribute injection | expression result breaking out of an attribute | context-aware escaping per attribute position |
| T4 | Privilege escalation | document tries to enable scripts | mode is host-only; no directive can change it; test asserts every escalation attempt fails |
| T5 | Build-time RCE | malicious component/plugin executes during `hmx build` | no arbitrary build-time execution in 0.0.x; plugin API deferred until phases stabilize (ADR-0008) |
| T6 | Supply chain | compromised dependency | minimal dependency set, pinned lockfile, `pnpm audit` in CI, dependency rationale recorded in ADR-0003 |
| T7 | Secret leakage | env vars reaching client output | no env access in the expression language; server/client boundary specified before data features ship |
| T8 | Prototype pollution | attribute names like `__proto__` | attribute bags are `null`-prototype objects; `__proto__`/`constructor`/`prototype` keys rejected (`HMX3005`) |
| T9 | ReDoS / parser DoS | pathological nesting or backtracking input | micromark is linear-time by construction; nesting depth capped; fuzzing planned before 1.0 |
| T10 | Path traversal | `../../etc/passwd` in an import or asset path | resolution confined to the project root; absolute and escaping paths rejected (`HMX3006`) |
| T11 | Entity-expansion DoS in frontmatter | a billion-laughs YAML document | `maxAliasCount: 10`; required test asserting prompt rejection with `HMX2021` |
| T12 | Tag-driven object construction in frontmatter | YAML type tags that instantiate host objects | `schema: 'core'`, `customTags: []`, `merge: false`, `stringKeys: true` |
| T13 | Prototype pollution via frontmatter keys | `__proto__:` in a mapping | mappings rebuilt with `Object.create(null)`; forbidden keys rejected with `HMX3007` using the same list as directive attributes |

## Deliberate non-goals at 0.0.x

Not defended against yet, and documented as such rather than silently assumed:
timing side channels, denial of service by enormous inputs, malicious npm components
in `app` mode, and anything involving a server runtime (there isn't one).

## Security testing

`tests/security/` is a required suite, not an optional one. Every control in the tables
above MUST have at least one test that fails if the control is removed. Every reported
vulnerability gains a regression test before its fix is merged.
