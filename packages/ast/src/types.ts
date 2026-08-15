/** A location in the source text. */
export interface Point {
  readonly line: number
  readonly column: number
  readonly offset: number
}

/** A source range delimited by start and end points. */
export interface Span {
  readonly start: Point
  readonly end: Point
}

/** Fields shared by every HMX syntax tree node. */
export interface NodeBase {
  readonly type: string
  /** Source range. Required: dropping spans is a bug (CLAUDE.md invariant 3). */
  readonly position: Span
  /** Set on nodes produced by transforms; `position` then refers to the origin. */
  readonly synthetic?: true
}

/** The document root. */
export interface Root extends NodeBase {
  type: 'root'
  readonly hmxVersion: string
  children: RootContent[]
}

/** A frontmatter block. Only valid as the first child of the root. */
export interface Yaml extends NodeBase {
  type: 'yaml'
  /** Raw text between the delimiters, excluding them. Unparsed. */
  value: string
}

/** A paragraph containing phrasing content. */
export interface Paragraph extends NodeBase {
  type: 'paragraph'
  children: PhrasingContent[]
}

/** An ATX or setext heading. */
export interface Heading extends NodeBase {
  type: 'heading'
  depth: 1 | 2 | 3 | 4 | 5 | 6
  children: PhrasingContent[]
}

/** A thematic break. */
export interface ThematicBreak extends NodeBase {
  type: 'thematicBreak'
}

/** A block quote containing block content. */
export interface Blockquote extends NodeBase {
  type: 'blockquote'
  children: Array<BlockContent | Definition>
}

/** An ordered or unordered list. */
export interface List extends NodeBase {
  type: 'list'
  ordered: boolean
  start: number | null
  spread: boolean
  children: ListItem[]
}

/** A single list item, optionally carrying a GFM task state. */
export interface ListItem extends NodeBase {
  type: 'listItem'
  spread: boolean
  checked: boolean | null
  children: Array<BlockContent | Definition>
}

/** A fenced or indented code block. */
export interface Code extends NodeBase {
  type: 'code'
  lang: string | null
  meta: string | null
  value: string
}

/** Raw HTML appearing in block or phrasing content. */
export interface Html extends NodeBase {
  type: 'html'
  value: string
}

/** Plain source text. */
export interface Text extends NodeBase {
  type: 'text'
  value: string
}

/** A `{{ expr }}` interpolation. The expression is unparsed at this stage. */
export interface Interpolation extends NodeBase {
  type: 'interpolation'
  /** Raw expression text between the braces, trimmed. */
  value: string
}

/** Emphasized phrasing content. */
export interface Emphasis extends NodeBase {
  type: 'emphasis'
  children: PhrasingContent[]
}

/** Strongly emphasized phrasing content. */
export interface Strong extends NodeBase {
  type: 'strong'
  children: PhrasingContent[]
}

/** GFM strikethrough phrasing content. */
export interface Delete extends NodeBase {
  type: 'delete'
  children: PhrasingContent[]
}

/** Inline code text. */
export interface InlineCode extends NodeBase {
  type: 'inlineCode'
  value: string
}

/** A hard line break. */
export interface Break extends NodeBase {
  type: 'break'
}

/** A link with inline destination data. */
export interface Link extends NodeBase {
  type: 'link'
  url: string
  title: string | null
  children: PhrasingContent[]
}

/** An image with inline destination data. */
export interface Image extends NodeBase {
  type: 'image'
  url: string
  title: string | null
  alt: string | null
}

/** A link or image destination definition. */
export interface Definition extends NodeBase {
  type: 'definition'
  identifier: string
  label: string | null
  url: string
  title: string | null
}

/** A link that resolves through a definition. */
export interface LinkReference extends NodeBase {
  type: 'linkReference'
  identifier: string
  label: string | null
  referenceType: 'shortcut' | 'collapsed' | 'full'
  children: PhrasingContent[]
}

/** An image that resolves through a definition. */
export interface ImageReference extends NodeBase {
  type: 'imageReference'
  identifier: string
  label: string | null
  referenceType: 'shortcut' | 'collapsed' | 'full'
  alt: string | null
}

/** A GFM table. */
export interface Table extends NodeBase {
  type: 'table'
  align: Array<'left' | 'right' | 'center' | null>
  children: TableRow[]
}

/** A row in a GFM table. */
export interface TableRow extends NodeBase {
  type: 'tableRow'
  children: TableCell[]
}

/** A cell in a GFM table. */
export interface TableCell extends NodeBase {
  type: 'tableCell'
  children: PhrasingContent[]
}

/** A parsed directive attribute and its precise source ranges. */
export interface Attribute {
  readonly name: string
  /** `null` for a bare attribute (`{disabled}`), distinct from `''` (`{a=""}`). */
  readonly value: string | null
  readonly position: Span
  readonly nameSpan: Span
  readonly valueSpan?: Span
}

/** An ordered, duplicate-preserving directive attribute list. */
export type AttributeList = readonly Attribute[]

/** An inline HMX directive. */
export interface TextDirective extends NodeBase {
  type: 'textDirective'
  name: string
  attributes: AttributeList
  children: PhrasingContent[]
}

/** A block HMX directive without block children. */
export interface LeafDirective extends NodeBase {
  type: 'leafDirective'
  name: string
  attributes: AttributeList
  label?: PhrasingContent[]
}

/** A block HMX directive containing block content. */
export interface ContainerDirective extends NodeBase {
  type: 'containerDirective'
  name: string
  attributes: AttributeList
  label?: PhrasingContent[]
  children: BlockContent[]
}

/** Any node accepted as block-level content. */
export type BlockContent =
  | Blockquote
  | Code
  | ContainerDirective
  | Heading
  | Html
  | LeafDirective
  | List
  | Paragraph
  | Table
  | ThematicBreak

/** Any node accepted as inline phrasing content. */
export type PhrasingContent =
  | Break
  | Delete
  | Emphasis
  | Html
  | Image
  | ImageReference
  | InlineCode
  | Interpolation
  | Link
  | LinkReference
  | Strong
  | Text
  | TextDirective

/** Any node accepted directly under the document root. */
export type RootContent = BlockContent | Definition | Yaml

/** Any node in an HMX syntax tree. */
export type Node = Root | RootContent | ListItem | TableRow | TableCell | PhrasingContent

/** A lookup from a node discriminant to its concrete node interface. */
export type NodeMap = {
  [CurrentNode in Node as CurrentNode['type']]: CurrentNode
}
