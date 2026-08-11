import { createDiagnostic } from '@hymarkx/ast'
import type { Diagnostic, Root } from '@hymarkx/ast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal'
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough'
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table'
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item'
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import { gfmTable } from 'micromark-extension-gfm-table'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'
import { fromMdast } from './from-mdast.js'
import { ParserInternalError } from './internal-error.js'
import { SourcePositions } from './positions.js'
import { HMX_VERSION } from './version.js'

/** Options controlling Markdown parsing. */
export interface ParseOptions {
  /** GFM table, strikethrough, task-list, and autolink extensions. Default: `true`. */
  readonly gfm?: boolean
  /** File path included in diagnostics. Default: `'<anonymous>'`. */
  readonly from?: string
}

/** The complete result of parsing normalized Markdown source. */
export interface ParseResult {
  /** The source-faithful HMX syntax tree. */
  readonly root: Root
  /** Parser diagnostics; parse failures are returned here and are never thrown. */
  readonly diagnostics: readonly Diagnostic[]
  /**
   * Source after one leading BOM is stripped and CRLF or CR is normalized to LF.
   *
   * All spans index this string in UTF-16 code units. Lines and columns are 1-based;
   * a tab advances one column and an astral character advances two. Diagnostic excerpts
   * must therefore use this value instead of the caller's original input.
   */
  readonly source: string
}

const gfmExtensions = [gfmAutolinkLiteral(), gfmStrikethrough(), gfmTable(), gfmTaskListItem()]

const gfmMdastExtensions = [
  gfmAutolinkLiteralFromMarkdown(),
  gfmStrikethroughFromMarkdown(),
  gfmTableFromMarkdown(),
  gfmTaskListItemFromMarkdown(),
]

function normalizeSource(source: string): string {
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  return withoutBom.replace(/\r\n?/g, '\n')
}

function failureDiagnostic(error: unknown, from: string, positions: SourcePositions): Diagnostic {
  // Deep nesting overflows the stack inside mdast-util-gfm-autolink-literal, whose tree
  // transform is recursive. Our own converter is iterative and handles these documents,
  // so the limit is upstream's, not ours — but it is still a limit, and a user is owed an
  // explanation rather than a RangeError. Tracked as P2 in BACKLOG.md.
  if (error instanceof RangeError) {
    return createDiagnostic({
      code: 'HMX1002',
      severity: 'error',
      message: 'Document is nested too deeply for the Markdown engine to process.',
      span: positions.span,
      expected: 'fewer levels of nested block quotes, lists, or other containers',
    })
  }

  const span = error instanceof ParserInternalError ? error.diagnostic.span : positions.span
  const detail = error instanceof Error ? error.message : String(error)
  return createDiagnostic({
    code: 'HMX5001',
    severity: 'error',
    message: `Parser failure in ${from}: ${detail}`,
    span,
  })
}

/**
 * Parses CommonMark plus optional granular GFM extensions into the HMX AST.
 *
 * This function returns diagnostics instead of throwing for every string input.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const normalizedSource = normalizeSource(source)
  const positions = new SourcePositions(normalizedSource)
  const from = options.from ?? '<anonymous>'

  try {
    const mdastRoot =
      options.gfm === false
        ? fromMarkdown(normalizedSource)
        : fromMarkdown(normalizedSource, {
            extensions: gfmExtensions,
            mdastExtensions: gfmMdastExtensions,
          })

    return {
      root: fromMdast(mdastRoot, normalizedSource),
      diagnostics: [],
      source: normalizedSource,
    }
  } catch (error) {
    return {
      root: {
        type: 'root',
        hmxVersion: HMX_VERSION,
        children: [],
        position: positions.span,
      },
      diagnostics: [failureDiagnostic(error, from, positions)],
      source: normalizedSource,
    }
  }
}

export { HMX_VERSION }
