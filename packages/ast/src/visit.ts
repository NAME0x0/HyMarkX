import type { Node, NodeMap } from './types.js'

/** A visitor result that prevents descent into the current node. */
export const SKIP: unique symbol = Symbol('skip')

/** A visitor result that stops the entire traversal immediately. */
export const EXIT: unique symbol = Symbol('exit')

/** A control result returned by an AST visitor callback. */
export type VisitorResult = void | typeof SKIP | typeof EXIT

type Visitor = (node: Node, parent: Node | undefined, index: number) => VisitorResult

interface VisitFrame {
  readonly node: Node
  readonly parent: Node | undefined
  readonly index: number
  readonly exiting: boolean
}

function childrenOf(node: Node): readonly Node[] | undefined {
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
    case 'textDirective':
      return node.children
    case 'leafDirective':
      return node.label
    case 'containerDirective':
      // A container has two child arrays, so the `index` reported for its descendants
      // is a position in this concatenation, not in `children`. Read-only passes are
      // unaffected; do not use `index` to splice a container's children until the label
      // representation is settled in Phase 2. Tracked as P1 in BACKLOG.md.
      return node.label === undefined ? node.children : [...node.label, ...node.children]
    case 'thematicBreak':
    case 'yaml':
    case 'code':
    case 'html':
    case 'text':
    case 'interpolation':
    case 'inlineCode':
    case 'break':
    case 'image':
    case 'definition':
    case 'imageReference':
      return undefined
    default:
      // Exhaustiveness guard. Adding a node type without a case here would otherwise
      // make traversal silently skip its children — a bug that produces wrong output
      // with no error anywhere. This turns it into a compile failure.
      return assertNeverNode(node)
  }
}

function assertNeverNode(node: never): undefined {
  throw new TypeError(`Unhandled node type in childrenOf: ${JSON.stringify(node)}`)
}

/**
 * Visits a tree depth-first in pre-order without recursion.
 *
 * An optional exit callback runs after a node's descendants, or immediately after an
 * enter callback returns {@link SKIP}.
 */
export function visit(tree: Node, enter: Visitor, exit?: Visitor): void {
  const stack: VisitFrame[] = [
    {
      node: tree,
      parent: undefined,
      index: 0,
      exiting: false,
    },
  ]

  while (stack.length > 0) {
    const frame = stack.pop()
    if (frame === undefined) {
      continue
    }

    if (frame.exiting) {
      if (exit?.(frame.node, frame.parent, frame.index) === EXIT) {
        return
      }
      continue
    }

    const result = enter(frame.node, frame.parent, frame.index)
    if (result === EXIT) {
      return
    }

    if (exit !== undefined) {
      stack.push({ ...frame, exiting: true })
    }

    if (result === SKIP) {
      continue
    }

    const children = childrenOf(frame.node)
    if (children === undefined) {
      continue
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child !== undefined) {
        stack.push({ node: child, parent: frame.node, index, exiting: false })
      }
    }
  }
}

function isNodeOfType<T extends Node['type']>(node: Node, type: T): node is NodeMap[T] {
  return node.type === type
}

/** Visits only nodes whose discriminant matches the requested type. */
export function visitOf<T extends Node['type']>(
  tree: Node,
  type: T,
  fn: (node: NodeMap[T], parent: Node | undefined, index: number) => VisitorResult,
): void {
  visit(tree, (node, parent, index) => {
    if (isNodeOfType(node, type)) {
      return fn(node, parent, index)
    }
  })
}
