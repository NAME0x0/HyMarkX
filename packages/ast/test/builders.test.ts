import { describe, expect, it } from 'vitest'
import {
  SYNTHETIC_SPAN,
  blockquote,
  break as breakNode,
  code,
  containerDirective,
  definition,
  delete as deleteNode,
  emphasis,
  heading,
  html,
  image,
  imageReference,
  inlineCode,
  interpolation,
  leafDirective,
  link,
  linkReference,
  list,
  listItem,
  paragraph,
  root,
  strong,
  table,
  tableCell,
  tableRow,
  text,
  textDirective,
  thematicBreak,
  yaml,
} from '../src/index.js'
import type { Span } from '../src/index.js'

describe('node builders', () => {
  const cases: Array<{
    readonly name: string
    readonly actual: unknown
    readonly expected: unknown
  }> = [
    {
      name: 'root',
      actual: root('0.0.0', []),
      expected: { type: 'root', hmxVersion: '0.0.0', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'yaml',
      actual: yaml('title: Example'),
      expected: { type: 'yaml', value: 'title: Example', position: SYNTHETIC_SPAN },
    },
    {
      name: 'paragraph',
      actual: paragraph([]),
      expected: { type: 'paragraph', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'heading',
      actual: heading(2, []),
      expected: { type: 'heading', depth: 2, children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'thematicBreak',
      actual: thematicBreak(),
      expected: { type: 'thematicBreak', position: SYNTHETIC_SPAN },
    },
    {
      name: 'blockquote',
      actual: blockquote([]),
      expected: { type: 'blockquote', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'list',
      actual: list(true, 3, false, []),
      expected: {
        type: 'list',
        ordered: true,
        start: 3,
        spread: false,
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'listItem',
      actual: listItem(true, null, []),
      expected: {
        type: 'listItem',
        spread: true,
        checked: null,
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'code',
      actual: code('ts', 'title=example', 'const value = 1'),
      expected: {
        type: 'code',
        lang: 'ts',
        meta: 'title=example',
        value: 'const value = 1',
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'html',
      actual: html('<br>'),
      expected: { type: 'html', value: '<br>', position: SYNTHETIC_SPAN },
    },
    {
      name: 'text',
      actual: text('plain'),
      expected: { type: 'text', value: 'plain', position: SYNTHETIC_SPAN },
    },
    {
      name: 'interpolation',
      actual: interpolation('title'),
      expected: { type: 'interpolation', value: 'title', position: SYNTHETIC_SPAN },
    },
    {
      name: 'emphasis',
      actual: emphasis([]),
      expected: { type: 'emphasis', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'strong',
      actual: strong([]),
      expected: { type: 'strong', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'delete',
      actual: deleteNode([]),
      expected: { type: 'delete', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'inlineCode',
      actual: inlineCode('value'),
      expected: { type: 'inlineCode', value: 'value', position: SYNTHETIC_SPAN },
    },
    {
      name: 'break',
      actual: breakNode(),
      expected: { type: 'break', position: SYNTHETIC_SPAN },
    },
    {
      name: 'link',
      actual: link('/docs', 'Docs', []),
      expected: {
        type: 'link',
        url: '/docs',
        title: 'Docs',
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'image',
      actual: image('/logo.svg', null, ''),
      expected: {
        type: 'image',
        url: '/logo.svg',
        title: null,
        alt: '',
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'definition',
      actual: definition('docs', 'Docs', '/docs', null),
      expected: {
        type: 'definition',
        identifier: 'docs',
        label: 'Docs',
        url: '/docs',
        title: null,
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'linkReference',
      actual: linkReference('docs', 'Docs', 'full', []),
      expected: {
        type: 'linkReference',
        identifier: 'docs',
        label: 'Docs',
        referenceType: 'full',
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'imageReference',
      actual: imageReference('logo', 'Logo', 'collapsed', ''),
      expected: {
        type: 'imageReference',
        identifier: 'logo',
        label: 'Logo',
        referenceType: 'collapsed',
        alt: '',
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'table',
      actual: table(['left', null], []),
      expected: {
        type: 'table',
        align: ['left', null],
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'tableRow',
      actual: tableRow([]),
      expected: { type: 'tableRow', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'tableCell',
      actual: tableCell([]),
      expected: { type: 'tableCell', children: [], position: SYNTHETIC_SPAN },
    },
    {
      name: 'textDirective',
      actual: textDirective('badge', [], []),
      expected: {
        type: 'textDirective',
        name: 'badge',
        attributes: [],
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'leafDirective',
      actual: leafDirective('meta', []),
      expected: {
        type: 'leafDirective',
        name: 'meta',
        attributes: [],
        position: SYNTHETIC_SPAN,
      },
    },
    {
      name: 'containerDirective',
      actual: containerDirective('card', [], undefined, []),
      expected: {
        type: 'containerDirective',
        name: 'card',
        attributes: [],
        children: [],
        position: SYNTHETIC_SPAN,
      },
    },
  ]

  it.each(cases)('$name produces its documented shape and default span', ({ actual, expected }) => {
    expect(actual).toEqual(expected)
    expect((actual as { readonly position: Span }).position).toBe(SYNTHETIC_SPAN)
  })

  it('preserves optional directive labels when supplied', () => {
    const label = [text('Label')]

    expect(leafDirective('note', [], label)).toEqual({
      type: 'leafDirective',
      name: 'note',
      attributes: [],
      label,
      position: SYNTHETIC_SPAN,
    })
    expect(containerDirective('note', [], label, [])).toEqual({
      type: 'containerDirective',
      name: 'note',
      attributes: [],
      label,
      children: [],
      position: SYNTHETIC_SPAN,
    })
  })

  it('uses an explicitly supplied span', () => {
    const position: Span = {
      start: { line: 1, column: 2, offset: 1 },
      end: { line: 1, column: 5, offset: 4 },
    }

    expect(text('value', position).position).toBe(position)
  })
})
