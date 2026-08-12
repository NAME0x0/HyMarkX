import { describe, expect, it } from 'vitest'
import { parse } from '../src/index.js'

describe('frontmatter parsing', () => {
  it('extracts raw YAML as the first root child with its real span', () => {
    const result = parse('---\ntitle: Hello\ntags:\n  - one\n---\n# Body\n')

    expect(result.diagnostics).toEqual([])
    expect(result.root.children[0]).toEqual({
      type: 'yaml',
      value: 'title: Hello\ntags:\n  - one',
      position: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 5, column: 4, offset: 34 },
      },
    })
    expect(result.root.children[1]?.type).toBe('heading')
  })

  it('accepts an empty or frontmatter-only document', () => {
    const empty = parse('---\n---')
    const only = parse('---\ntitle: Only\n---')

    expect(empty.diagnostics).toEqual([])
    expect(empty.root.children).toEqual([
      {
        type: 'yaml',
        value: '',
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 2, column: 4, offset: 7 },
        },
      },
    ])
    expect(only.root.children).toHaveLength(1)
    expect(only.root.children[0]).toMatchObject({ type: 'yaml', value: 'title: Only' })
  })

  it('normalizes a BOM and CRLF before extracting frontmatter', () => {
    const result = parse('\uFEFF---\r\ntitle: Windows\r\n---\r\nBody\r\n')

    expect(result.source).toBe('---\ntitle: Windows\n---\nBody\n')
    expect(result.root.children[0]).toMatchObject({
      type: 'yaml',
      value: 'title: Windows',
      position: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 3, column: 4, offset: 22 },
      },
    })
  })

  it('leaves later dashes as thematic breaks or setext headings', () => {
    const thematic = parse('Before\n\n---\n\nAfter\n')
    const setext = parse('Before\n\nHeading\n---\n')

    expect(thematic.root.children.map((node) => node.type)).toEqual([
      'paragraph',
      'thematicBreak',
      'paragraph',
    ])
    expect(setext.root.children[1]).toMatchObject({ type: 'heading', depth: 2 })
  })

  it('leaves an unclosed opening fence as ordinary Markdown', () => {
    const result = parse('---\ntitle: Not frontmatter\n')

    expect(result.root.children.map((node) => node.type)).toEqual(['thematicBreak', 'paragraph'])
    expect(JSON.stringify(result.root)).not.toContain('"type":"yaml"')
  })
})
