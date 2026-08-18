/**
 * A plain CommonMark + GFM parse, with no HMX in it at all.
 *
 * This is the reference invariant 1 is measured against. The invariant says a document
 * containing no HMX construct renders as CommonMark + GFM; the number this file makes possible
 * says it is also *priced* like CommonMark + GFM, rather than paying for features it never
 * uses.
 *
 * The extension set is matched to the parser's exactly — the same four GFM extensions, no
 * footnotes — because a baseline configured differently from the thing it measures produces a
 * flattering number instead of a true one.
 *
 * Root devDependencies, deliberately: ADR-0005's engine-import rule governs `packages/`, and
 * confining these to a benchmark keeps the shipped dependency surface unchanged.
 */
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal'
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough'
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table'
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import { gfmTable } from 'micromark-extension-gfm-table'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'

const extensions = [gfmAutolinkLiteral(), gfmStrikethrough(), gfmTable(), gfmTaskListItem()]
const mdastExtensions = [
  gfmAutolinkLiteralFromMarkdown(),
  gfmStrikethroughFromMarkdown(),
  gfmTableFromMarkdown(),
  gfmTaskListItemFromMarkdown(),
]

/** Parses to mdast with CommonMark + GFM and nothing else. */
export function bareParse(source) {
  return fromMarkdown(source, { extensions, mdastExtensions })
}
