import { createDiagnostic } from '@hymarkx/ast'
import { encodeUrl, escapeHtml } from './escape.js'
import { isAllowedDocumentUrl } from './sanitize.js'
import type { CompileResult, TrustMode } from '../types.js'
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
  /**
   * Scheme policy applied to head URLs. Defaults to `document`.
   *
   * Defaulting to the stricter mode means a caller that forgets to pass it gets the safe
   * policy rather than the permissive one.
   */
  readonly trust?: TrustMode
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

/** The four keys whose presence opts a document into social metadata (ADR-0020). */
const SOCIAL_KEYS = ['canonical', 'icon', 'image', 'siteName'] as const

/**
 * A head URL, checked against the active trust mode's scheme policy.
 *
 * The policy is the one links already use — §4.2.1 forbids a second, independent URL policy,
 * and a `javascript:` favicon is the same event as a `javascript:` link. A rejected value is
 * an error and its tag is dropped, rather than falling back to something the author did not
 * write.
 */
function headUrl(
  result: CompileResult,
  key: string,
  trust: TrustMode,
  diagnostics: Diagnostic[],
): string | undefined {
  const value = frontmatterString(result, key)
  if (value === undefined) {
    return undefined
  }
  if (trust === 'document' && !isAllowedDocumentUrl(value)) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX3003',
        severity: 'error',
        message: `URL "${value}" uses a scheme that is not allowed in document mode.`,
        span: ZERO_SPAN,
      }),
    )
    return undefined
  }
  return value
}

function meta(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeHtml(content)}">`
}

function property(name: string, content: string): string {
  return `<meta property="${name}" content="${escapeHtml(content)}">`
}

function link(rel: string, href: string): string {
  return `<link rel="${rel}" href="${escapeHtml(encodeUrl(href))}">`
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

  const title = resolveTitle(result, options.from)
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
  ]

  const description = frontmatterString(result, 'description')
  if (description !== undefined) {
    head.push(meta('description', description))
  }

  const author = frontmatterString(result, 'author')
  if (author !== undefined) {
    head.push(meta('author', author))
  }

  const trust = options.trust ?? 'document'
  const canonical = headUrl(result, 'canonical', trust, diagnostics)
  const icon = headUrl(result, 'icon', trust, diagnostics)
  const image = headUrl(result, 'image', trust, diagnostics)
  const siteName = frontmatterString(result, 'siteName')

  if (canonical !== undefined) {
    head.push(link('canonical', canonical))
  }
  if (icon !== undefined) {
    head.push(link('icon', icon))
  }

  // Output proportionality, the rule that already governs CSS and JavaScript: a document that
  // asked for none of this gets the head it got before the feature existed.
  if (SOCIAL_KEYS.some((key) => frontmatterString(result, key) !== undefined)) {
    head.push(property('og:type', 'website'), property('og:title', title))
    if (description !== undefined) {
      head.push(property('og:description', description))
    }
    if (canonical !== undefined) {
      head.push(property('og:url', encodeUrl(canonical)))
    }
    if (siteName !== undefined) {
      head.push(property('og:site_name', siteName))
    }
    if (image !== undefined) {
      head.push(
        property('og:image', encodeUrl(image)),
        meta('twitter:card', 'summary_large_image'),
        meta('twitter:image', encodeUrl(image)),
      )
    }
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
