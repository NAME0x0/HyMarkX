import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  EXIT,
  SKIP,
  blockquote,
  containerDirective,
  emphasis,
  heading,
  paragraph,
  root,
  text,
  visit,
  visitOf,
} from '../src/index.js'
import type { BlockContent, Heading, Node } from '../src/index.js'

function describeNode(node: Node): string {
  return node.type === 'text' ? `text:${node.value}` : node.type
}

function mixedTree(): Node {
  return root('0.0.0', [
    heading(1, [text('title')]),
    blockquote([paragraph([text('before'), emphasis([text('inside')]), text('after')])]),
    containerDirective('card', [], [text('label')], [paragraph([text('body')])]),
  ])
}

describe('visit', () => {
  it('visits depth-first in pre-order and document order', () => {
    const order: string[] = []

    visit(mixedTree(), (node) => {
      order.push(describeNode(node))
    })

    expect(order).toEqual([
      'root',
      'heading',
      'text:title',
      'blockquote',
      'paragraph',
      'text:before',
      'emphasis',
      'text:inside',
      'text:after',
      'containerDirective',
      'text:label',
      'paragraph',
      'text:body',
    ])
  })

  it('reports each parent and sibling index', () => {
    const relationships: string[] = []

    visit(mixedTree(), (node, parent, index) => {
      relationships.push(`${describeNode(node)}@${parent?.type ?? 'none'}:${index}`)
    })

    expect(relationships).toContain('root@none:0')
    expect(relationships).toContain('blockquote@root:1')
    expect(relationships).toContain('text:inside@emphasis:0')
    expect(relationships).toContain('text:label@containerDirective:0')
    expect(relationships).toContain('paragraph@containerDirective:1')
  })

  it('SKIP omits exactly the selected subtree', () => {
    const order: string[] = []

    visit(mixedTree(), (node) => {
      order.push(describeNode(node))
      if (node.type === 'blockquote') {
        return SKIP
      }
    })

    expect(order).toEqual([
      'root',
      'heading',
      'text:title',
      'blockquote',
      'containerDirective',
      'text:label',
      'paragraph',
      'text:body',
    ])
  })

  it('still exits a node whose enter callback returns SKIP', () => {
    const exits: string[] = []

    visit(
      mixedTree(),
      (node) => (node.type === 'blockquote' ? SKIP : undefined),
      (node) => {
        exits.push(describeNode(node))
      },
    )

    expect(exits).toContain('blockquote')
  })

  it('EXIT stops traversal immediately', () => {
    const order: string[] = []

    visit(mixedTree(), (node) => {
      order.push(describeNode(node))
      if (node.type === 'emphasis') {
        return EXIT
      }
    })

    expect(order).toEqual([
      'root',
      'heading',
      'text:title',
      'blockquote',
      'paragraph',
      'text:before',
      'emphasis',
    ])
  })

  it('honors EXIT from the exit callback', () => {
    const exits: string[] = []

    visit(
      mixedTree(),
      () => undefined,
      (node) => {
        exits.push(describeNode(node))
        if (node.type === 'heading') {
          return EXIT
        }
      },
    )

    expect(exits).toEqual(['text:title', 'heading'])
  })

  it('visitOf narrows the selected node type', () => {
    const depths: number[] = []

    visitOf(mixedTree(), 'heading', (node) => {
      expectTypeOf(node).toEqualTypeOf<Heading>()
      depths.push(node.depth)
    })

    expect(depths).toEqual([1])
  })

  it('traverses a 10,000-deep tree without overflowing the call stack', () => {
    let nested: BlockContent = paragraph([])
    for (let depth = 0; depth < 10_000; depth += 1) {
      nested = blockquote([nested])
    }
    const tree = root('0.0.0', [nested])
    let visited = 0

    expect(() => {
      visit(tree, () => {
        visited += 1
      })
    }).not.toThrow()
    expect(visited).toBe(10_002)
  })
})
