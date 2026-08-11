import { describe, expect, it } from 'vitest'
import { fromMdast } from '../src/from-mdast.js'
import { ParserInternalError } from '../src/internal-error.js'

const position = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
}

describe('fromMdast', () => {
  it('reports a missing position as HMX5001 through the internal wrapper', () => {
    let caught: unknown

    try {
      fromMdast({ type: 'root', children: [] }, '')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ParserInternalError)
    if (caught instanceof ParserInternalError) {
      expect(caught.diagnostic).toMatchObject({
        code: 'HMX5001',
        message: 'mdast node "root" has no position',
      })
    }
  })

  it('rejects an extension node outside the CommonMark and GFM baseline', () => {
    expect(() =>
      fromMdast(
        {
          type: 'root',
          children: [{ type: 'footnoteDefinition', position }],
          position,
        },
        '',
      ),
    ).toThrowError('Unsupported mdast node type "footnoteDefinition"')
  })
})
