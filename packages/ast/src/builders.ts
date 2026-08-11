import { SYNTHETIC_SPAN } from './spans.js'
import type {
  AttributeList,
  BlockContent,
  Blockquote,
  Break,
  Code,
  ContainerDirective,
  Definition,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  ImageReference,
  InlineCode,
  LeafDirective,
  Link,
  LinkReference,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  Span,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  TextDirective,
  ThematicBreak,
} from './types.js'

/** Creates a document root node. */
export function root(
  hmxVersion: string,
  children: Root['children'],
  position: Span = SYNTHETIC_SPAN,
): Root {
  return { type: 'root', hmxVersion, children, position }
}

/** Creates a paragraph node. */
export function paragraph(children: PhrasingContent[], position: Span = SYNTHETIC_SPAN): Paragraph {
  return { type: 'paragraph', children, position }
}

/** Creates a heading node. */
export function heading(
  depth: Heading['depth'],
  children: PhrasingContent[],
  position: Span = SYNTHETIC_SPAN,
): Heading {
  return { type: 'heading', depth, children, position }
}

/** Creates a thematic-break node. */
export function thematicBreak(position: Span = SYNTHETIC_SPAN): ThematicBreak {
  return { type: 'thematicBreak', position }
}

/** Creates a block-quote node. */
export function blockquote(
  children: Array<BlockContent | Definition>,
  position: Span = SYNTHETIC_SPAN,
): Blockquote {
  return { type: 'blockquote', children, position }
}

/** Creates an ordered or unordered list node. */
export function list(
  ordered: boolean,
  start: number | null,
  spread: boolean,
  children: ListItem[],
  position: Span = SYNTHETIC_SPAN,
): List {
  return { type: 'list', ordered, start, spread, children, position }
}

/** Creates a list-item node. */
export function listItem(
  spread: boolean,
  checked: boolean | null,
  children: Array<BlockContent | Definition>,
  position: Span = SYNTHETIC_SPAN,
): ListItem {
  return { type: 'listItem', spread, checked, children, position }
}

/** Creates a code-block node. */
export function code(
  lang: string | null,
  meta: string | null,
  value: string,
  position: Span = SYNTHETIC_SPAN,
): Code {
  return { type: 'code', lang, meta, value, position }
}

/** Creates a raw-HTML node. */
export function html(value: string, position: Span = SYNTHETIC_SPAN): Html {
  return { type: 'html', value, position }
}

/** Creates a plain-text node. */
export function text(value: string, position: Span = SYNTHETIC_SPAN): Text {
  return { type: 'text', value, position }
}

/** Creates an emphasis node. */
export function emphasis(children: PhrasingContent[], position: Span = SYNTHETIC_SPAN): Emphasis {
  return { type: 'emphasis', children, position }
}

/** Creates a strong-emphasis node. */
export function strong(children: PhrasingContent[], position: Span = SYNTHETIC_SPAN): Strong {
  return { type: 'strong', children, position }
}

/** Creates a GFM strikethrough node. */
const createDelete = (children: PhrasingContent[], position: Span = SYNTHETIC_SPAN): Delete => ({
  type: 'delete',
  children,
  position,
})

/** Creates an inline-code node. */
export function inlineCode(value: string, position: Span = SYNTHETIC_SPAN): InlineCode {
  return { type: 'inlineCode', value, position }
}

/** Creates a hard-line-break node. */
const createBreak = (position: Span = SYNTHETIC_SPAN): Break => ({
  type: 'break',
  position,
})

/** Creates a link node. */
export function link(
  url: string,
  title: string | null,
  children: PhrasingContent[],
  position: Span = SYNTHETIC_SPAN,
): Link {
  return { type: 'link', url, title, children, position }
}

/** Creates an image node. */
export function image(
  url: string,
  title: string | null,
  alt: string | null,
  position: Span = SYNTHETIC_SPAN,
): Image {
  return { type: 'image', url, title, alt, position }
}

/** Creates a link or image definition node. */
export function definition(
  identifier: string,
  label: string | null,
  url: string,
  title: string | null,
  position: Span = SYNTHETIC_SPAN,
): Definition {
  return { type: 'definition', identifier, label, url, title, position }
}

/** Creates a definition-backed link node. */
export function linkReference(
  identifier: string,
  label: string | null,
  referenceType: LinkReference['referenceType'],
  children: PhrasingContent[],
  position: Span = SYNTHETIC_SPAN,
): LinkReference {
  return { type: 'linkReference', identifier, label, referenceType, children, position }
}

/** Creates a definition-backed image node. */
export function imageReference(
  identifier: string,
  label: string | null,
  referenceType: ImageReference['referenceType'],
  alt: string | null,
  position: Span = SYNTHETIC_SPAN,
): ImageReference {
  return { type: 'imageReference', identifier, label, referenceType, alt, position }
}

/** Creates a GFM table node. */
export function table(
  align: Table['align'],
  children: TableRow[],
  position: Span = SYNTHETIC_SPAN,
): Table {
  return { type: 'table', align, children, position }
}

/** Creates a GFM table-row node. */
export function tableRow(children: TableCell[], position: Span = SYNTHETIC_SPAN): TableRow {
  return { type: 'tableRow', children, position }
}

/** Creates a GFM table-cell node. */
export function tableCell(children: PhrasingContent[], position: Span = SYNTHETIC_SPAN): TableCell {
  return { type: 'tableCell', children, position }
}

/** Creates an inline HMX directive node. */
export function textDirective(
  name: string,
  attributes: AttributeList,
  children: PhrasingContent[],
  position: Span = SYNTHETIC_SPAN,
): TextDirective {
  return { type: 'textDirective', name, attributes, children, position }
}

/** Creates a leaf HMX directive node. */
export function leafDirective(
  name: string,
  attributes: AttributeList,
  label: PhrasingContent[] | undefined = undefined,
  position: Span = SYNTHETIC_SPAN,
): LeafDirective {
  if (label === undefined) {
    return { type: 'leafDirective', name, attributes, position }
  }

  return { type: 'leafDirective', name, attributes, label, position }
}

/** Creates a container HMX directive node. */
export function containerDirective(
  name: string,
  attributes: AttributeList,
  label: PhrasingContent[] | undefined,
  children: BlockContent[],
  position: Span = SYNTHETIC_SPAN,
): ContainerDirective {
  if (label === undefined) {
    return { type: 'containerDirective', name, attributes, children, position }
  }

  return { type: 'containerDirective', name, attributes, label, children, position }
}

export { createBreak as break, createDelete as delete }
