import { createDiagnostic } from '@hymarkx/ast'
import type { Diagnostic, Span } from '@hymarkx/ast'
import { encodeUrl, escapeHtml } from './escape.js'

/** Auditable raw-HTML element and attribute allowlist for document trust mode. */
export const HTML_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  '*': ['class', 'id', 'title'],
  a: ['href', 'title'],
  b: [],
  blockquote: [],
  br: [],
  code: ['class'],
  del: [],
  em: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  hr: [],
  i: [],
  img: ['alt', 'height', 'src', 'title', 'width'],
  li: [],
  ol: ['start'],
  p: [],
  pre: [],
  s: [],
  strong: [],
  table: [],
  tbody: [],
  td: ['align', 'colspan', 'rowspan'],
  tfoot: [],
  th: ['align', 'colspan', 'rowspan'],
  thead: [],
  tr: [],
  u: [],
  ul: [],
}

const PROHIBITED_ELEMENTS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form'])
const VOID_ELEMENTS = new Set(['br', 'hr', 'img'])
const URL_ATTRIBUTES = new Set(['href', 'src'])
const RAW_TEXT_ELEMENTS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'plaintext',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
])

interface RawAttribute {
  readonly name: string
  readonly value: string | null
}

interface RawTag {
  readonly start: number
  readonly end: number
  readonly closing: boolean
  readonly name: string | null
  readonly attributes: readonly RawAttribute[]
}

/** Result of sanitizing one raw-HTML syntax-tree node. */
export interface SanitizeResult {
  readonly html: string
  readonly diagnostics: readonly Diagnostic[]
}

function findTagEnd(value: string, start: number): number {
  let quote = ''
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]
    if (quote !== '') {
      if (character === quote) {
        quote = ''
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return value.length
}

function parseAttributes(raw: string, offset: number): readonly RawAttribute[] {
  const attributes: RawAttribute[] = []
  let index = offset

  while (index < raw.length) {
    while (/\s/.test(raw[index] ?? '')) {
      index += 1
    }
    if (index >= raw.length || raw[index] === '>' || raw[index] === '/') {
      break
    }

    const nameStart = index
    while (index < raw.length && !/[\s"'=<>`/]/.test(raw[index] ?? '')) {
      index += 1
    }
    if (index === nameStart) {
      index += 1
      continue
    }

    const name = raw.slice(nameStart, index).toLowerCase()
    while (/\s/.test(raw[index] ?? '')) {
      index += 1
    }
    if (raw[index] !== '=') {
      attributes.push({ name, value: null })
      continue
    }

    index += 1
    while (/\s/.test(raw[index] ?? '')) {
      index += 1
    }
    const quote = raw[index]
    if (quote === '"' || quote === "'") {
      index += 1
      const valueStart = index
      while (index < raw.length && raw[index] !== quote) {
        index += 1
      }
      attributes.push({ name, value: raw.slice(valueStart, index) })
      if (raw[index] === quote) {
        index += 1
      }
      continue
    }

    const valueStart = index
    while (index < raw.length && !/[\s>]/.test(raw[index] ?? '')) {
      index += 1
    }
    attributes.push({ name, value: raw.slice(valueStart, index) })
  }

  return attributes
}

function scanTags(value: string): readonly RawTag[] {
  const tags: RawTag[] = []
  let searchFrom = 0

  while (searchFrom < value.length) {
    const start = value.indexOf('<', searchFrom)
    if (start === -1) {
      break
    }
    const end = findTagEnd(value, start)
    const raw = value.slice(start, end)
    const match = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/.exec(raw)
    if (match === null) {
      if (/^<\s*[!?]/.test(raw)) {
        tags.push({ start, end, closing: false, name: null, attributes: [] })
      }
      searchFrom = Math.max(end, start + 1)
      continue
    }

    const name = match[2]?.toLowerCase()
    if (name !== undefined) {
      tags.push({
        start,
        end,
        closing: match[1] === '/',
        name,
        attributes: match[1] === '/' ? [] : parseAttributes(raw, match[0].length),
      })
    }
    searchFrom = Math.max(end, start + 1)
  }

  return tags
}

/** Adds valueless attributes to app-mode raw HTML start tags without changing raw text. */
export function addAttributesToRawHtml(value: string, attributeNames: readonly string[]): string {
  if (attributeNames.length === 0) {
    return value
  }
  const attributes = attributeNames.map((name) => ` ${name}`).join('')
  const tags = scanTags(value)
  let output = ''
  let cursor = 0
  let rawTextElement: string | undefined

  for (const tag of tags) {
    if (rawTextElement !== undefined) {
      if (tag.closing && tag.name === rawTextElement) {
        rawTextElement = undefined
      }
      continue
    }
    if (tag.closing || tag.name === null) {
      continue
    }

    const raw = value.slice(tag.start, tag.end)
    let insertion = raw.length - 1
    while (insertion > 0 && /\s/.test(raw[insertion - 1] ?? '')) {
      insertion -= 1
    }
    if (raw[insertion - 1] === '/') {
      insertion -= 1
    }
    output += value.slice(cursor, tag.start)
    output += `${raw.slice(0, insertion)}${attributes}${raw.slice(insertion)}`
    cursor = tag.end
    if (RAW_TEXT_ELEMENTS.has(tag.name)) {
      rawTextElement = tag.name
    }
  }

  return `${output}${value.slice(cursor)}`
}

function decodeSchemeEntities(value: string): string {
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (entity, hexadecimal: string, decimal: string) => {
      const parsed = Number.parseInt(
        hexadecimal === undefined ? decimal : hexadecimal,
        hexadecimal === undefined ? 10 : 16,
      )
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0x10ffff) {
        return '\ufffd'
      }
      return String.fromCodePoint(parsed)
    })
    .replace(/&colon;?/gi, ':')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n')
}

/** Reports whether a URL uses a document-mode scheme or a relative reference. */
export function isAllowedDocumentUrl(value: string): boolean {
  let normalized = ''
  for (const character of decodeSchemeEntities(value)) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint > 0x20 && codePoint !== 0x7f) {
      normalized += character
    }
  }
  const colon = normalized.indexOf(':')
  if (colon === -1) {
    return true
  }

  const scheme = normalized.slice(0, colon).toLowerCase()
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    return true
  }
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto'
}

function diagnostic(
  code: 'HMX3001' | 'HMX3002' | 'HMX3003',
  message: string,
  span: Span,
): Diagnostic {
  return createDiagnostic({ code, severity: 'error', message, span })
}

function sanitizeTag(tag: RawTag, span: Span, diagnostics: Diagnostic[]): string {
  const name = tag.name
  if (name === null || !Object.hasOwn(HTML_ALLOWLIST, name)) {
    return ''
  }
  if (tag.closing) {
    return VOID_ELEMENTS.has(name) ? '' : `</${name}>`
  }

  const allowed = new Set([...(HTML_ALLOWLIST['*'] ?? []), ...(HTML_ALLOWLIST[name] ?? [])])
  const seen = new Set<string>()
  let output = `<${name}`
  for (const attribute of tag.attributes) {
    if (seen.has(attribute.name) || !allowed.has(attribute.name)) {
      continue
    }
    seen.add(attribute.name)
    if (
      URL_ATTRIBUTES.has(attribute.name) &&
      attribute.value !== null &&
      !isAllowedDocumentUrl(attribute.value)
    ) {
      diagnostics.push(
        diagnostic(
          'HMX3003',
          `URL in ${attribute.name} uses a scheme that is not allowed in document mode.`,
          span,
        ),
      )
      continue
    }

    const value =
      attribute.value === null
        ? ''
        : URL_ATTRIBUTES.has(attribute.name)
          ? encodeUrl(attribute.value)
          : attribute.value
    output += ` ${attribute.name}="${escapeHtml(value)}"`
  }

  return VOID_ELEMENTS.has(name) ? `${output} />` : `${output}>`
}

/** Sanitizes a raw-HTML node and reports every trust-boundary violation. */
export function sanitizeRawHtml(value: string, span: Span): SanitizeResult {
  const tags = scanTags(value)
  const prohibited = tags.find((tag) => tag.name !== null && PROHIBITED_ELEMENTS.has(tag.name))
  if (prohibited?.name !== undefined && prohibited.name !== null) {
    return {
      html: '',
      diagnostics: [
        diagnostic(
          'HMX3001',
          `Raw HTML contains the prohibited <${prohibited.name}> element and was removed.`,
          span,
        ),
      ],
    }
  }

  if (tags.some((tag) => tag.attributes.some((attribute) => attribute.name.startsWith('on')))) {
    return {
      html: '',
      diagnostics: [
        diagnostic(
          'HMX3002',
          'Raw HTML contains an event-handler attribute and was removed.',
          span,
        ),
      ],
    }
  }

  const diagnostics: Diagnostic[] = []
  let html = ''
  let cursor = 0
  for (const tag of tags) {
    html += value.slice(cursor, tag.start)
    html += sanitizeTag(tag, span, diagnostics)
    cursor = tag.end
  }
  html += value.slice(cursor)
  return { html, diagnostics }
}
