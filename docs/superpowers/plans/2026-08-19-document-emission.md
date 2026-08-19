# Document Emission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hmx build` emit a complete, valid HTML document instead of a bare fragment.

**Architecture:** `compile()` is untouched and keeps returning `html`/`css`/`js` separately. A new
pure function `renderDocument()` in `@hymarkx/compiler` assembles those into a full page, driven
by frontmatter keys that Phase 2 already reserved and validated but never consumed. The CLI calls
it by default and keeps the old behaviour behind `--fragment`.

**Tech Stack:** TypeScript 7 strict, ESM only, vitest 4, pnpm workspaces. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-19-document-emission-design.md`](../specs/2026-08-19-document-emission-design.md)

## Global Constraints

- **TypeScript 7 strict, ESM only, no `any` without justification.** Matches `CLAUDE.md`.
- **Only `@hymarkx/parser` may import micromark/mdast.** This work touches neither.
- **Only `@hymarkx/cli` and `@hymarkx/language-server` may use `node:` builtins or Node globals.**
  `renderDocument` lives in the compiler and must therefore be pure — no `fs`, no `process`.
  `scripts/check-boundaries.mjs` enforces this and runs in CI.
- **Recoverable problems are `Diagnostic`s with stable codes and spans, never throws.**
- **Conformance is a hard gate:** CommonMark 652/652 and GFM 40/40 must not move. They compare
  fragments, so they should be unaffected — verify, do not assume.
- **Every new diagnostic code must be registered in `SPEC.md` Appendix B.**
  `tests/spec/diagnostic-codes.test.mjs` fails in both directions if it is not.
- **Version for this work: `0.0.4`**, bumped across all seven `packages/*` manifests, plus
  `editors/vscode/package.json` and the `VERSION` constant in `packages/cli/src/index.ts`.
  `tests/spec/publish-readiness.test.mjs` asserts they agree.
- **The build resolves `@hymarkx/parser` to `dist`.** Run `pnpm build` before any probe or
  manual check, or you will be testing the previous version. This has cost time twice.

## File Structure

| File | Responsibility |
|---|---|
| `packages/compiler/src/emit/document.ts` *(new)* | `renderDocument()` and its helpers: the shell, title resolution, lang validation. Pure. |
| `packages/compiler/src/index.ts` | Export `renderDocument` and `DocumentOptions`. |
| `packages/compiler/test/document.test.ts` *(new)* | Structure, title fallbacks, description, lang, asset references. |
| `tests/security/security.test.mjs` | Injection tests for the three new positions. |
| `packages/cli/src/index.ts` | `--fragment` flag; call `renderDocument` by default; inline for `--out -`. |
| `packages/cli/src/dev.ts` | Serve a document rather than concatenated parts. |
| `tests/e2e/cli.test.mjs` | Default output is a document; `--fragment` is not. |
| `SPEC.md` | §5 document-emission rules; `HMX2023` in Appendix B. |
| `docs/security-audit.md` | New T1/T3 positions with their tests. |

---

### Task 1: `renderDocument` — shell, title, description

**Files:**
- Create: `packages/compiler/src/emit/document.ts`
- Modify: `packages/compiler/src/index.ts`
- Test: `packages/compiler/test/document.test.ts`

**Interfaces:**
- Consumes: `CompileResult` from `packages/compiler/src/types.ts` — fields used are `html`,
  `css`, `js`, `frontmatter`. `escapeHtml(value: string): string` from
  `packages/compiler/src/emit/escape.ts`.
- Produces:
  ```ts
  export interface DocumentOptions {
    /** Falls back to the title when frontmatter has none and the document has no heading. */
    readonly from?: string
    /** Inline the CSS and JS instead of linking sidecars. For stdout and the dev server. */
    readonly inline?: boolean
    /** Base name for the sidecar links. Defaults to `index`. */
    readonly assetName?: string
  }
  export function renderDocument(result: CompileResult, options?: DocumentOptions): string
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'
import { renderDocument } from '../src/emit/document.js'

describe('renderDocument', () => {
  it('wraps the fragment in a complete document', () => {
    const result = compile('---\ntitle: Dashboard\n---\n\n# Hello\n', { trust: 'app' })
    const html = renderDocument(result)

    expect(html.startsWith('<!doctype html>\n')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain('<title>Dashboard</title>')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    // head closes before body opens
    expect(html.indexOf('</head>')).toBeLessThan(html.indexOf('<body>'))
  })

  it('falls back to the first heading, then the filename', () => {
    const heading = compile('# From heading\n', { trust: 'app' })
    const neither = compile('Just prose.\n', { trust: 'app' })

    expect(renderDocument(heading)).toContain('<title>From heading</title>')
    expect(renderDocument(neither, { from: 'about.hmx' })).toContain('<title>about</title>')
  })

  it('omits the description entirely when frontmatter has none', () => {
    const withOne = compile('---\ndescription: A page\n---\n\n# H\n', { trust: 'app' })
    const without = compile('# H\n', { trust: 'app' })

    expect(renderDocument(withOne)).toContain('<meta name="description" content="A page">')
    expect(renderDocument(without)).not.toContain('name="description"')
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run packages/compiler/test/document.test.ts`
Expected: FAIL — cannot resolve `../src/emit/document.js`.

- [ ] **Step 3: Implement**

```ts
import { escapeHtml } from './escape.js'
import type { CompileResult } from '../types.js'

export interface DocumentOptions {
  readonly from?: string
  readonly inline?: boolean
  readonly assetName?: string
}

/** Reads a reserved string key out of frontmatter, ignoring anything of the wrong type. */
function frontmatterString(result: CompileResult, key: string): string | undefined {
  const value = (result.frontmatter as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * The document's title, in falling order of preference.
 *
 * HTML5 requires `<title>`, so this never returns empty — a page with no frontmatter and no
 * heading is titled after its file rather than emitted invalid.
 */
function resolveTitle(result: CompileResult, from: string | undefined): string {
  const declared = frontmatterString(result, 'title')
  if (declared !== undefined) {
    return declared
  }
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(result.html)?.[1]
  if (heading !== undefined) {
    const text = heading.replace(/<[^>]+>/g, '').trim()
    if (text !== '') {
      return text
    }
  }
  const name = (from ?? 'index').split(/[\\/]/).pop() ?? 'index'
  return name.replace(/\.[^.]+$/, '') || 'index'
}

export function renderDocument(result: CompileResult, options: DocumentOptions = {}): string {
  const asset = options.assetName ?? 'index'
  const description = frontmatterString(result, 'description')

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(resolveTitle(result, options.from))}</title>`,
  ]
  if (description !== undefined) {
    head.push(`<meta name="description" content="${escapeHtml(description)}">`)
  }
  if (result.css !== '') {
    head.push(
      options.inline === true
        ? `<style>\n${result.css}</style>`
        : `<link rel="stylesheet" href="${escapeHtml(asset)}.css">`,
    )
  }

  const body = [result.html.trimEnd()]
  if (result.js !== '') {
    body.push(
      options.inline === true
        ? `<script>\n${result.js}</script>`
        : `<script src="${escapeHtml(asset)}.js"></script>`,
    )
  }

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    ...head,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
```

Then add to `packages/compiler/src/index.ts`:

```ts
export { renderDocument } from './emit/document.js'
export type { DocumentOptions } from './emit/document.js'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run packages/compiler/test/document.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/compiler/src/emit/document.ts packages/compiler/src/index.ts packages/compiler/test/document.test.ts
git commit -m "feat(compiler): assemble a complete HTML document from a compile result"
```

---

### Task 2: `lang`, with validation and `HMX2023`

**Files:**
- Modify: `packages/compiler/src/emit/document.ts`
- Modify: `SPEC.md` (Appendix B, and §4.3 frontmatter)
- Test: `packages/compiler/test/document.test.ts`

**Interfaces:**
- Consumes: `renderDocument` and `DocumentOptions` from Task 1.
- Produces: `renderDocument` gains a second return shape:
  ```ts
  export interface DocumentResult {
    readonly html: string
    readonly diagnostics: readonly Diagnostic[]
  }
  export function renderDocument(result: CompileResult, options?: DocumentOptions): DocumentResult
  ```
  **This changes Task 1's signature.** Callers use `.html`. Task 3 relies on this shape.

- [ ] **Step 1: Write the failing test**

```ts
it('uses a valid language tag and defaults to en', () => {
  const tagged = compile('---\nlang: en-GB\n---\n\n# H\n', { trust: 'app' })
  const bare = compile('# H\n', { trust: 'app' })

  expect(renderDocument(tagged).html).toContain('<html lang="en-GB">')
  expect(renderDocument(bare).html).toContain('<html lang="en">')
})

it('rejects a malformed language tag with HMX2023 and falls back', () => {
  const result = compile('---\nlang: "en\\" onload=x"\n---\n\n# H\n', { trust: 'app' })
  const document = renderDocument(result)

  expect(document.html).toContain('<html lang="en">')
  expect(document.diagnostics.map(({ code }) => code)).toContain('HMX2023')
  expect(document.diagnostics[0].severity).toBe('warning')
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run packages/compiler/test/document.test.ts`
Expected: FAIL — `renderDocument(...).html` is undefined, because Task 1 returns a string.

- [ ] **Step 3: Implement**

Change the return type and add validation in `packages/compiler/src/emit/document.ts`:

```ts
import { createDiagnostic } from '@hymarkx/ast'
import type { Diagnostic } from '@hymarkx/ast'

export interface DocumentResult {
  readonly html: string
  readonly diagnostics: readonly Diagnostic[]
}

/**
 * A BCP-47-shaped tag: alphanumeric subtags separated by hyphens, bounded length.
 *
 * Validated rather than escaped because a language tag is a constrained vocabulary. Escaping
 * would keep the attribute safe while leaving a nonsense value in it; this keeps the document
 * correct as well as safe.
 */
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/

const ZERO_SPAN = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
} as const
```

Inside `renderDocument`, replace the hardcoded `lang="en"`:

```ts
  const diagnostics: Diagnostic[] = []
  const declaredLang = frontmatterString(result, 'lang')
  let lang = 'en'
  if (declaredLang !== undefined) {
    if (LANGUAGE_TAG.test(declaredLang)) {
      lang = declaredLang
    } else {
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2023',
          severity: 'warning',
          message: `Frontmatter "lang" is not a valid language tag; using "en" instead.`,
          span: ZERO_SPAN,
          expected: 'a BCP-47 tag such as "en", "en-GB", or "ar"',
        }),
      )
    }
  }
```

and return `{ html: [...].join('\n'), diagnostics }` with `<html lang="${escapeHtml(lang)}">`.

Update the Task 1 tests to read `.html`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run packages/compiler/test/document.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Register the code in `SPEC.md`**

In Appendix B's `HMX2xxx` table, directly after the `HMX2022` row:

```markdown
| `HMX2023` | warning | Frontmatter `lang` is not a valid language tag; `en` is used instead |
```

In §4.3, after the sentence about parsing YAML with entity expansion bounded:

```markdown
The reserved keys `title`, `description`, and `lang` supply a document's `<title>`, its
description meta, and its language when a processor emits a complete HTML document. `lang` MUST
be validated as a BCP-47-shaped tag and MUST fall back to `en` with `HMX2023` when it is not.
```

- [ ] **Step 6: Verify the registry cross-check passes**

Run: `npx vitest run tests/spec/diagnostic-codes.test.mjs`
Expected: PASS — the code is emitted and documented, so neither direction fails.

- [ ] **Step 7: Commit**

```bash
git add packages/compiler/src/emit/document.ts packages/compiler/test/document.test.ts SPEC.md
git commit -m "feat(compiler): validate the document language tag, reporting HMX2023"
```

---

### Task 3: Injection tests for the three new positions

**Files:**
- Modify: `tests/security/security.test.mjs`
- Modify: `docs/security-audit.md`

**Interfaces:**
- Consumes: `renderDocument(result, options): DocumentResult` from Task 2.

- [ ] **Step 1: Write the failing test**

Append to `tests/security/security.test.mjs`:

```js
import { renderDocument } from '../../packages/compiler/src/emit/document.js'

/**
 * Frontmatter is document-controlled data, and document emission routes it into three positions
 * it never reached before: `<title>` text, a `<meta content>` attribute, and the `lang`
 * attribute. Threats T1 and T3.
 */
describe('document emission escaping', () => {
  it('cannot break out of the title element', () => {
    const source = '---\ntitle: "</title><script>alert(1)</script>"\n---\n\n# H\n'
    const { html } = renderDocument(compile(source, { trust: 'app' }))

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;/title&gt;')
  })

  it('cannot break out of the description attribute', () => {
    const source = '---\ndescription: \'x" onload="alert(1)\'\n---\n\n# H\n'
    const { html } = renderDocument(compile(source, { trust: 'app' }))

    expect(html).not.toContain('onload="alert(1)"')
    expect(html).toContain('&quot;')
  })

  it('cannot inject through the language attribute', () => {
    const source = '---\nlang: \'en" onload="alert(1)\'\n---\n\n# H\n'
    const { html } = renderDocument(compile(source, { trust: 'app' }))

    expect(html).toContain('<html lang="en">')
    expect(html).not.toContain('onload')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/security/security.test.mjs`
Expected: PASS — Tasks 1 and 2 already escape and validate. These tests exist to fail if that is
ever removed, which is the point; confirm by temporarily deleting the `escapeHtml` call around
the title, watching the first test fail, and restoring it.

- [ ] **Step 3: Record the positions in the audit**

In `docs/security-audit.md` under **T1**, add to the evidence table:

```markdown
| `tests/security/security.test.mjs` | `cannot break out of the title element` |
```

and under **T3**:

```markdown
| `tests/security/security.test.mjs` | `cannot break out of the description attribute` |
| `tests/security/security.test.mjs` | `cannot inject through the language attribute` |
```

- [ ] **Step 4: Verify the audit cross-check still passes**

Run: `npx vitest run tests/security/audit.test.mjs`
Expected: PASS — every cited test name exists.

- [ ] **Step 5: Commit**

```bash
git add tests/security/security.test.mjs docs/security-audit.md
git commit -m "test(security): cover the three positions document emission exposes"
```

---

### Task 4: `hmx build` emits a document by default

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `tests/e2e/cli.test.mjs`

**Interfaces:**
- Consumes: `renderDocument` from Task 2, re-exported by `@hymarkx/compiler`.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/cli.test.mjs`:

```js
it('builds a complete document by default and a fragment on request', () => {
  const project = mkdtempSync(join(tmpdir(), 'hmx-document-'))
  writeFileSync(join(project, 'index.hmx'), '---\ntitle: Page\n---\n\n# Hello\n', 'utf8')
  const run = (...args) =>
    spawnSync(process.execPath, [cliPath, 'build', 'index.hmx', '--out', 'dist', ...args], {
      cwd: project,
      encoding: 'utf8',
    })

  expect(run().status).toBe(0)
  const document = readFileSync(join(project, 'dist', 'index.html'), 'utf8')

  expect(document.startsWith('<!doctype html>')).toBe(true)
  expect(document).toContain('<title>Page</title>')

  expect(run('--fragment').status).toBe(0)
  const fragment = readFileSync(join(project, 'dist', 'index.html'), 'utf8')

  expect(fragment.startsWith('<!doctype html>')).toBe(false)
  expect(fragment.trim()).toBe('<h1>Hello</h1>')

  rmSync(project, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/e2e/cli.test.mjs -t "complete document"`
Expected: FAIL — output does not start with `<!doctype html>`.

- [ ] **Step 3: Implement**

Add to the `parseArgs` options block in `packages/cli/src/index.ts` (around line 508):

```ts
        fragment: { type: 'boolean', default: false },
```

Import `renderDocument` alongside the existing compiler imports, thread
`parsed.values.fragment` through to the build path, and at the write site replace

```ts
      await writeFile(target.path, result.html, 'utf8')
```

with

```ts
      // A document by default: `build` should produce something a browser can open. The
      // sidecars are linked by bare filename because they are written beside this file.
      let html = result.html
      if (!fragment) {
        const rendered = renderDocument(result, {
          from: input,
          assetName: basename(target.path, extname(target.path)),
        })
        html = rendered.html
        for (const diagnostic of rendered.diagnostics) {
          records.push(diagnosticRecord(diagnostic, result.source, input))
        }
      }
      await writeFile(target.path, html, 'utf8')
```

For `--out -`, use `renderDocument(result, { from: input, inline: true }).html` so a piped page
is self-contained.

Update `HELP` to document the flag:

```
  --fragment                  build only: emit an HTML fragment, not a whole document
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/e2e/cli.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts tests/e2e/cli.test.mjs
git commit -m "feat(cli): build a complete document by default, with --fragment to opt out"
```

---

### Task 5: `hmx dev` serves the same document

**Files:**
- Modify: `packages/cli/src/dev.ts:95-97`

**Interfaces:**
- Consumes: `renderDocument` from Task 2.

- [ ] **Step 1: Write the failing test**

In `tests/dev/` (follow the existing file's setup for starting the server):

```js
it('serves a complete document', async () => {
  const response = await fetch(`http://localhost:${port}/index.html`)
  const body = await response.text()

  expect(body.startsWith('<!doctype html>')).toBe(true)
  expect(body).toContain('<title>')
  // The live-reload client still has to be there, inside the body.
  expect(body).toContain('EventSource')
  expect(body.indexOf('EventSource')).toBeLessThan(body.indexOf('</body>'))
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/dev`
Expected: FAIL — the response starts with `<style>` or the fragment.

- [ ] **Step 3: Implement**

Replace lines 95-97 of `packages/cli/src/dev.ts`:

```ts
  // Inline, not linked: the dev server has no sidecar files on disk to point at. The reload
  // client goes inside the body so the served page is a valid document too.
  const rendered = renderDocument(
    { ...result, html: `${result.html}\n${RELOAD_CLIENT}` },
    { from: documentPath, inline: true },
  )
  return rendered.html
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/dev`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/dev.ts tests/dev
git commit -m "feat(cli): serve a complete document from the dev server"
```

---

### Task 6: Documentation, conformance check, and the 0.0.4 release

**Files:**
- Modify: `SPEC.md` §5, `README.md`, `docs/guides/dev-server.md`, `ROADMAP.md`
- Modify: all `packages/*/package.json`, `editors/vscode/package.json`,
  `packages/cli/src/index.ts` (`VERSION`)

- [ ] **Step 1: Verify conformance did not move**

Run: `pnpm build && npx vitest run tests/conformance`
Expected: PASS — 652 CommonMark and 40 GFM. They compare fragments via `compile()`, which this
work did not change. If either moved, stop: something altered `compile()` and that is a bug, not
a number to update.

- [ ] **Step 2: Add the rendering rules to `SPEC.md` §5**

```markdown
A processor MAY emit a complete HTML document rather than a fragment. When it does:

- The document MUST begin with `<!doctype html>` and declare `charset=utf-8`.
- `<title>` MUST be present, taken from frontmatter `title`, else the first heading's text,
  else the input's base name.
- `lang` MUST come from frontmatter `lang` when it is a valid BCP-47-shaped tag, and MUST
  fall back to `en` with `HMX2023` when it is not.
- A stylesheet or script reference MUST be omitted when the corresponding output is empty.
```

- [ ] **Step 3: Update the guides and README**

In `README.md`, the "Try it" block already shows `hmx build page.hmx --out -`. Add one line
after it: `hmx build page.hmx --fragment   # emit a fragment to embed in an existing page`.

In `docs/guides/dev-server.md`, state that the served page is the same document `build`
produces, with a live-reload client appended.

- [ ] **Step 4: Run the full suite and the boundary check**

Run: `pnpm check && pnpm format:check`
Expected: all green. `check-boundaries.mjs` must stay satisfied — if it complains that
`document.ts` uses a Node global, the implementation reached for something it may not have.

- [ ] **Step 5: Bump to 0.0.4 and commit**

```bash
node -e "const fs=require('fs');for(const d of fs.readdirSync('packages')){const p='packages/'+d+'/package.json';if(!fs.existsSync(p))continue;const m=JSON.parse(fs.readFileSync(p,'utf8'));m.version='0.0.4';fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')}"
node -e "const fs=require('fs');const p='editors/vscode/package.json';const m=JSON.parse(fs.readFileSync(p,'utf8'));m.version='0.0.4';fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n')"
# and VERSION in packages/cli/src/index.ts
pnpm build && pnpm run release:pack && node scripts/check-tarballs.mjs
git add -A
git commit -m "release: 0.0.4 — hmx build emits a complete document"
git tag -a v0.0.4 -m "HyMarkX 0.0.4"
```

---

## Self-Review

**Spec coverage.** Shell → Task 1. Title/description/lang sourcing → Tasks 1 and 2. `HMX2023` →
Task 2. Security positions → Task 3. CLI default and `--fragment` → Task 4. `--out -` inlining →
Task 4 Step 3. Dev server → Task 5. SPEC and audit → Tasks 2, 3 and 6. Conformance → Task 6
Step 1. 0.0.4 → Task 6 Step 5. `layout` and `draft` are deliberately untouched, matching the
spec's "what this does not do".

**Type consistency.** Task 1 returns `string`; Task 2 changes it to `DocumentResult` and says so
explicitly, including that Task 1's tests must be updated to read `.html`. Tasks 3, 4 and 5 all
use `.html` and, where relevant, `.diagnostics`. `DocumentOptions` carries `from`, `inline` and
`assetName` throughout.

**Known wrinkle, called out rather than hidden.** Task 1's title fallback reads the first `<h1>`
back out of emitted HTML with a regular expression. That is parsing our own deterministic output,
which is the same approach `scripts/generate-evolution-svg.mjs` already takes and is acceptable
for a heading. If it proves fragile — a heading containing a nested element, say — the better fix
is to have `compile()` surface the first heading's text on `CompileResult`, and that is a change
worth making deliberately rather than smuggling into this task.
