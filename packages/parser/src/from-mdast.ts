import { createDiagnostic } from '@hymarkx/ast'
import type {
  Attribute,
  AttributeList,
  BlockContent,
  Heading,
  LinkReference,
  Node,
  PhrasingContent,
  Root,
  RootContent,
  Span,
} from '@hymarkx/ast'
import { ParserInternalError } from './internal-error.js'
import { SourcePositions } from './positions.js'
import { HMX_VERSION } from './version.js'

interface MdastNode {
  readonly type: string
  readonly position?: unknown
  readonly children?: unknown
  readonly value?: unknown
  readonly depth?: unknown
  readonly ordered?: unknown
  readonly start?: unknown
  readonly spread?: unknown
  readonly checked?: unknown
  readonly lang?: unknown
  readonly meta?: unknown
  readonly url?: unknown
  readonly title?: unknown
  readonly alt?: unknown
  readonly identifier?: unknown
  readonly label?: unknown
  readonly referenceType?: unknown
  readonly align?: unknown
  readonly attributes?: unknown
  readonly name?: unknown
}

interface ConversionFrame {
  readonly source: MdastNode
  readonly output: Node
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function isMdastNode(value: unknown): value is MdastNode {
  return isRecord(value) && typeof value.type === 'string'
}

function internalError(message: string, span: Span): ParserInternalError {
  return new ParserInternalError(
    createDiagnostic({
      code: 'HMX5001',
      severity: 'error',
      message,
      span,
    }),
  )
}

function requiredString(
  value: unknown,
  field: string,
  nodeType: string,
  positions: SourcePositions,
): string {
  if (typeof value !== 'string') {
    throw internalError(`mdast node "${nodeType}" has an invalid ${field} field`, positions.span)
  }
  return value
}

function nullableString(
  value: unknown,
  field: string,
  nodeType: string,
  positions: SourcePositions,
): string | null {
  if (value === undefined || value === null) {
    return null
  }
  return requiredString(value, field, nodeType, positions)
}

function isHeadingDepth(value: unknown): value is Heading['depth'] {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6
}

function isReferenceType(value: unknown): value is LinkReference['referenceType'] {
  return value === 'shortcut' || value === 'collapsed' || value === 'full'
}

function positionOffset(
  point: Readonly<Record<string, unknown>>,
  nodeType: string,
  positions: SourcePositions,
): number {
  if (point.offset !== undefined) {
    if (!Number.isInteger(point.offset)) {
      throw internalError(`mdast node "${nodeType}" has an invalid position offset`, positions.span)
    }
    return Number(point.offset)
  }

  if (!Number.isInteger(point.line) || !Number.isInteger(point.column)) {
    throw internalError(`mdast node "${nodeType}" has an incomplete position`, positions.span)
  }

  try {
    return positions.offsetAt(Number(point.line), Number(point.column))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw internalError(
      `mdast node "${nodeType}" has an invalid position: ${detail}`,
      positions.span,
    )
  }
}

function toSpan(node: MdastNode, positions: SourcePositions): Span {
  if (!isRecord(node.position)) {
    throw internalError(`mdast node "${node.type}" has no position`, positions.span)
  }
  if (!isRecord(node.position.start) || !isRecord(node.position.end)) {
    throw internalError(`mdast node "${node.type}" has an incomplete position`, positions.span)
  }

  const startOffset = positionOffset(node.position.start, node.type, positions)
  const endOffset = positionOffset(node.position.end, node.type, positions)
  if (endOffset < startOffset) {
    throw internalError(`mdast node "${node.type}" has a reversed position`, positions.span)
  }

  try {
    return {
      start: positions.pointAt(startOffset),
      end: positions.pointAt(endOffset),
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw internalError(
      `mdast node "${node.type}" has an invalid position: ${detail}`,
      positions.span,
    )
  }
}

function spanField(
  value: unknown,
  field: string,
  nodeType: string,
  positions: SourcePositions,
): Span {
  return toSpan({ type: `${nodeType}.${field}`, position: value }, positions)
}

function attributesOf(node: MdastNode, positions: SourcePositions): AttributeList {
  if (!Array.isArray(node.attributes)) {
    throw internalError(`mdast node "${node.type}" has no attributes array`, positions.span)
  }

  const attributes: Attribute[] = []
  for (const value of node.attributes) {
    if (!isRecord(value) || typeof value.name !== 'string') {
      throw internalError(
        `mdast node "${node.type}" has an invalid directive attribute`,
        positions.span,
      )
    }
    if (value.value !== null && typeof value.value !== 'string') {
      throw internalError(
        `mdast node "${node.type}" has an invalid directive attribute value`,
        positions.span,
      )
    }

    attributes.push({
      name: value.name,
      value: value.value,
      position: spanField(value.position, 'attribute.position', node.type, positions),
      nameSpan: spanField(value.nameSpan, 'attribute.nameSpan', node.type, positions),
      ...(value.valueSpan === undefined
        ? {}
        : {
            valueSpan: spanField(value.valueSpan, 'attribute.valueSpan', node.type, positions),
          }),
    })
  }

  return attributes
}

function directiveLabel(node: MdastNode, positions: SourcePositions): [] | undefined {
  if (node.label === undefined) {
    return undefined
  }
  if (!Array.isArray(node.label)) {
    throw internalError(`mdast node "${node.type}" has an invalid label`, positions.span)
  }
  return []
}

function tableAlignment(
  node: MdastNode,
  positions: SourcePositions,
): RootContent & { type: 'table' } {
  const position = toSpan(node, positions)
  if (!Array.isArray(node.align)) {
    throw internalError('mdast node "table" has an invalid align field', position)
  }

  const align: Array<'left' | 'right' | 'center' | null> = []
  for (const value of node.align) {
    if (value !== 'left' && value !== 'right' && value !== 'center' && value !== null) {
      throw internalError('mdast node "table" has an invalid alignment value', position)
    }
    align.push(value)
  }

  return { type: 'table', align, children: [], position }
}

function createNode(node: MdastNode, positions: SourcePositions): Node {
  const position = toSpan(node, positions)

  switch (node.type) {
    case 'root':
      return { type: 'root', hmxVersion: HMX_VERSION, children: [], position }
    case 'paragraph':
      return { type: 'paragraph', children: [], position }
    case 'heading':
      if (!isHeadingDepth(node.depth)) {
        throw internalError('mdast node "heading" has an invalid depth field', position)
      }
      return { type: 'heading', depth: node.depth, children: [], position }
    case 'thematicBreak':
      return { type: 'thematicBreak', position }
    case 'blockquote':
      return { type: 'blockquote', children: [], position }
    case 'list':
      return {
        type: 'list',
        ordered: node.ordered === true,
        start: typeof node.start === 'number' ? node.start : null,
        spread: node.spread === true,
        children: [],
        position,
      }
    case 'listItem':
      return {
        type: 'listItem',
        spread: node.spread === true,
        checked: typeof node.checked === 'boolean' ? node.checked : null,
        children: [],
        position,
      }
    case 'code':
      return {
        type: 'code',
        lang: nullableString(node.lang, 'lang', node.type, positions),
        meta: nullableString(node.meta, 'meta', node.type, positions),
        value: requiredString(node.value, 'value', node.type, positions),
        position,
      }
    case 'html':
      return {
        type: 'html',
        value: requiredString(node.value, 'value', node.type, positions),
        position,
      }
    case 'text':
      return {
        type: 'text',
        value: requiredString(node.value, 'value', node.type, positions),
        position,
      }
    case 'emphasis':
      return { type: 'emphasis', children: [], position }
    case 'strong':
      return { type: 'strong', children: [], position }
    case 'delete':
      return { type: 'delete', children: [], position }
    case 'inlineCode':
      return {
        type: 'inlineCode',
        value: requiredString(node.value, 'value', node.type, positions),
        position,
      }
    case 'break':
      return { type: 'break', position }
    case 'link':
      return {
        type: 'link',
        url: requiredString(node.url, 'url', node.type, positions),
        title: nullableString(node.title, 'title', node.type, positions),
        children: [],
        position,
      }
    case 'image':
      return {
        type: 'image',
        url: requiredString(node.url, 'url', node.type, positions),
        title: nullableString(node.title, 'title', node.type, positions),
        alt: nullableString(node.alt, 'alt', node.type, positions),
        position,
      }
    case 'definition':
      return {
        type: 'definition',
        identifier: requiredString(node.identifier, 'identifier', node.type, positions),
        label: nullableString(node.label, 'label', node.type, positions),
        url: requiredString(node.url, 'url', node.type, positions),
        title: nullableString(node.title, 'title', node.type, positions),
        position,
      }
    case 'linkReference':
      if (!isReferenceType(node.referenceType)) {
        throw internalError(
          'mdast node "linkReference" has an invalid referenceType field',
          position,
        )
      }
      return {
        type: 'linkReference',
        identifier: requiredString(node.identifier, 'identifier', node.type, positions),
        label: nullableString(node.label, 'label', node.type, positions),
        referenceType: node.referenceType,
        children: [],
        position,
      }
    case 'imageReference':
      if (!isReferenceType(node.referenceType)) {
        throw internalError(
          'mdast node "imageReference" has an invalid referenceType field',
          position,
        )
      }
      return {
        type: 'imageReference',
        identifier: requiredString(node.identifier, 'identifier', node.type, positions),
        label: nullableString(node.label, 'label', node.type, positions),
        referenceType: node.referenceType,
        alt: nullableString(node.alt, 'alt', node.type, positions),
        position,
      }
    case 'table':
      return tableAlignment(node, positions)
    case 'tableRow':
      return { type: 'tableRow', children: [], position }
    case 'tableCell':
      return { type: 'tableCell', children: [], position }
    case 'textDirective':
      return {
        type: 'textDirective',
        name: requiredString(node.name, 'name', node.type, positions),
        attributes: attributesOf(node, positions),
        children: [],
        position,
      }
    case 'leafDirective': {
      const label = directiveLabel(node, positions)
      return {
        type: 'leafDirective',
        name: requiredString(node.name, 'name', node.type, positions),
        attributes: attributesOf(node, positions),
        ...(label === undefined ? {} : { label }),
        position,
      }
    }
    case 'containerDirective': {
      const label = directiveLabel(node, positions)
      return {
        type: 'containerDirective',
        name: requiredString(node.name, 'name', node.type, positions),
        attributes: attributesOf(node, positions),
        ...(label === undefined ? {} : { label }),
        children: [],
        position,
      }
    }
    default:
      throw internalError(`Unsupported mdast node type "${node.type}"`, position)
  }
}

function labelChildrenOf(
  node: MdastNode,
  positions: SourcePositions,
): readonly unknown[] | undefined {
  if (node.type !== 'containerDirective' && node.type !== 'leafDirective') {
    return undefined
  }
  if (node.label === undefined) {
    return undefined
  }
  if (!Array.isArray(node.label)) {
    throw internalError(`mdast node "${node.type}" has an invalid label`, positions.span)
  }
  return node.label
}

function childrenOf(node: MdastNode, positions: SourcePositions): readonly unknown[] | undefined {
  switch (node.type) {
    case 'root':
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'table':
    case 'tableRow':
    case 'tableCell':
    case 'containerDirective':
    case 'textDirective':
      if (!Array.isArray(node.children)) {
        throw internalError(`mdast node "${node.type}" has no children array`, positions.span)
      }
      return node.children
    case 'thematicBreak':
    case 'code':
    case 'html':
    case 'text':
    case 'inlineCode':
    case 'break':
    case 'image':
    case 'definition':
    case 'imageReference':
    case 'leafDirective':
      return undefined
    default:
      throw internalError(`Unsupported mdast node type "${node.type}"`, positions.span)
  }
}

function appendLabel(parent: Node, child: Node, positions: SourcePositions): void {
  if (
    (parent.type === 'containerDirective' || parent.type === 'leafDirective') &&
    parent.label !== undefined &&
    isPhrasingContent(child)
  ) {
    parent.label.push(child)
    return
  }

  throw internalError(
    `mdast node "${child.type}" cannot be a label child of "${parent.type}"`,
    positions.span,
  )
}

function isBlockContent(node: Node): node is BlockContent {
  return (
    node.type === 'blockquote' ||
    node.type === 'code' ||
    node.type === 'heading' ||
    node.type === 'html' ||
    node.type === 'list' ||
    node.type === 'paragraph' ||
    node.type === 'table' ||
    node.type === 'thematicBreak' ||
    node.type === 'containerDirective' ||
    node.type === 'leafDirective'
  )
}

function isPhrasingContent(node: Node): node is PhrasingContent {
  return (
    node.type === 'break' ||
    node.type === 'delete' ||
    node.type === 'emphasis' ||
    node.type === 'html' ||
    node.type === 'image' ||
    node.type === 'imageReference' ||
    node.type === 'inlineCode' ||
    node.type === 'link' ||
    node.type === 'linkReference' ||
    node.type === 'strong' ||
    node.type === 'text' ||
    node.type === 'textDirective'
  )
}

function isRootContent(node: Node): node is RootContent {
  return isBlockContent(node) || node.type === 'definition'
}

function appendChild(parent: Node, child: Node, positions: SourcePositions): void {
  switch (parent.type) {
    case 'root':
      if (isRootContent(child)) {
        parent.children.push(child)
        return
      }
      break
    case 'blockquote':
    case 'listItem':
      if (isBlockContent(child) || child.type === 'definition') {
        parent.children.push(child)
        return
      }
      break
    case 'list':
      if (child.type === 'listItem') {
        parent.children.push(child)
        return
      }
      break
    case 'paragraph':
    case 'heading':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'tableCell':
      if (isPhrasingContent(child)) {
        parent.children.push(child)
        return
      }
      break
    case 'table':
      if (child.type === 'tableRow') {
        parent.children.push(child)
        return
      }
      break
    case 'tableRow':
      if (child.type === 'tableCell') {
        parent.children.push(child)
        return
      }
      break
    case 'containerDirective':
      if (isBlockContent(child)) {
        parent.children.push(child)
        return
      }
      break
    case 'textDirective':
      if (isPhrasingContent(child)) {
        parent.children.push(child)
        return
      }
      break
    case 'leafDirective':
    case 'thematicBreak':
    case 'code':
    case 'html':
    case 'text':
    case 'inlineCode':
    case 'break':
    case 'image':
    case 'definition':
    case 'imageReference':
      break
  }

  throw internalError(
    `mdast node "${child.type}" cannot be a child of "${parent.type}"`,
    positions.span,
  )
}

/** Converts an mdast-shaped value into a separately owned HMX tree without recursion. */
export function fromMdast(value: unknown, source: string): Root {
  const positions = new SourcePositions(source)
  if (!isMdastNode(value)) {
    throw internalError(
      'Markdown engine returned a value that is not an mdast node',
      positions.span,
    )
  }

  const output = createNode(value, positions)
  if (output.type !== 'root') {
    throw internalError(
      `Markdown engine returned "${output.type}" instead of "root"`,
      positions.span,
    )
  }

  const stack: ConversionFrame[] = [{ source: value, output }]
  while (stack.length > 0) {
    const frame = stack.pop()
    if (frame === undefined) {
      continue
    }

    const sourceChildren = childrenOf(frame.source, positions)
    const sourceLabel = labelChildrenOf(frame.source, positions)
    if (sourceChildren === undefined && sourceLabel === undefined) {
      continue
    }

    const childFrames: ConversionFrame[] = []
    for (const sourceChild of sourceLabel ?? []) {
      if (!isMdastNode(sourceChild)) {
        throw internalError(
          `mdast node "${frame.source.type}" has an invalid label child`,
          positions.span,
        )
      }
      const outputChild = createNode(sourceChild, positions)
      appendLabel(frame.output, outputChild, positions)
      childFrames.push({ source: sourceChild, output: outputChild })
    }

    for (const sourceChild of sourceChildren ?? []) {
      if (!isMdastNode(sourceChild)) {
        throw internalError(
          `mdast node "${frame.source.type}" has an invalid child`,
          positions.span,
        )
      }
      const outputChild = createNode(sourceChild, positions)
      appendChild(frame.output, outputChild, positions)
      childFrames.push({ source: sourceChild, output: outputChild })
    }

    for (let index = childFrames.length - 1; index >= 0; index -= 1) {
      const childFrame = childFrames[index]
      if (childFrame !== undefined) {
        stack.push(childFrame)
      }
    }
  }

  return output
}
