import { createDiagnostic } from '@hymarkx/ast'
import { escapeHtml } from './escape.js'
import type { CompileResult } from '../types.js'
import type { Diagnostic } from '@hymarkx/ast'

/**
 * Assembles a complete HTML document from a compile result.
 *
 * `compile()` deliberately produces a fragment: embedding HMX output inside a host page is a
 * first-class use, and the emitter should not acquire a "sometimes it's a whole page" mode. But
 * a fragment cannot be opened in a browser — no doctype, no charset, no title, no viewport — so
 * `hmx build` needs this to produce something that stands on its own.
 *
 * Driven by frontmatter keys Phase 2 already reserved and type-validated (`title`,
 * `description`, `lang`) and never consumed. This finishes them rather than inventing anything.
 *
 * Pure by requirement, not by preference: ADR-0005 confines Node builtins to the CLI and the
 * language server, and `scripts/check-boundaries.mjs` enforces it.
 */

export interface DocumentOptions {
  /** Names the document when frontmatter has no title and the content has no heading. */
  readonly from?: string
  /** Inline the CSS and JS instead of linking sidecars, for stdout and the dev server. */
  readonly inline?: boolean
  /** Base name for sidecar links. Defaults to `index`. */
  readonly assetName?: string
}

export interface DocumentResult {
  readonly html: string
  readonly diagnostics: readonly Diagnostic[]
}

/**
 * A BCP-47-shaped tag: alphanumeric subtags joined by hyphens, each bounded.
 *
 * Validated rather than merely escaped. Escaping would keep the attribute safe while leaving
 * nonsense inside it; validating keeps the document correct as well as safe, and a language tag
 * is a constrained vocabulary rather than free text.
 */
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/

const DEFAULT_LANGUAGE = 'en'

const ZERO_SPAN = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
} as const

/** Reads a reserved string key from frontmatter, ignoring anything of the wrong type or empty. */
function frontmatterString(result: CompileResult, key: string): string | undefined {
  const frontmatter = result.frontmatter as Record<string, unknown> | undefined
  const value = frontmatter?.[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * The document's title, in falling order of preference: frontmatter, first heading, filename.
 *
 * Reading the heading back out of emitted HTML is parsing our own deterministic output, which is
 * the same approach `scripts/generate-evolution-svg.mjs` takes. If it ever proves fragile the
 * better fix is surfacing the first heading on `CompileResult`, deliberately rather than by
 * making this regex cleverer.
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

export function renderDocument(
  result: CompileResult,
  options: DocumentOptions = {},
): DocumentResult {
  const diagnostics: Diagnostic[] = []
  const assetName = options.assetName ?? 'index'
  const inline = options.inline === true

  let language = DEFAULT_LANGUAGE
  const declaredLanguage = frontmatterString(result, 'lang')
  if (declaredLanguage !== undefined) {
    if (LANGUAGE_TAG.test(declaredLanguage)) {
      language = declaredLanguage
    } else {
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2023',
          severity: 'warning',
          message: `Frontmatter "lang" is not a valid language tag; using "${DEFAULT_LANGUAGE}" instead.`,
          span: ZERO_SPAN,
          expected: 'a BCP-47 tag such as "en", "en-GB", or "ar"',
        }),
      )
    }
  }

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(resolveTitle(result, options.from))}</title>`,
  ]

  const description = frontmatterString(result, 'description')
  if (description !== undefined) {
    head.push(`<meta name="description" content="${escapeHtml(description)}">`)
  }

  // No file, no reference — the same rule the sidecar writer follows.
  if (result.css !== '') {
    head.push(
      inline
        ? `<style>\n${result.css}</style>`
        : `<link rel="stylesheet" href="${escapeHtml(assetName)}.css">`,
    )
  }

  const body = [result.html.trimEnd()]
  if (result.js !== '') {
    body.push(
      inline
        ? `<script>\n${result.js}</script>`
        : `<script src="${escapeHtml(assetName)}.js"></script>`,
    )
  }

  const html = [
    '<!doctype html>',
    `<html lang="${escapeHtml(language)}">`,
    '<head>',
    ...head,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n')

  return { html, diagnostics }
}
