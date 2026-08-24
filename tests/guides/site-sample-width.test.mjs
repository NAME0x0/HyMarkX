import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const siteDirectory = fileURLToPath(new URL('../../site/', import.meta.url))

/**
 * Code samples have to fit the pane they are shown in.
 *
 * On the documentation and gallery pages a sample sits in one half of a two-column example.
 * Past the pane's width the block scrolls sideways, which on a browser with overlay scrollbars
 * looks exactly like text that has been cut off — the badge example shipped that way and read
 * as a bug rather than as a scroll.
 *
 * Measured rather than derived: at 1440px a 62-character line fits with nothing to spare and a
 * 78-character one overflowed by 110px, which puts the edge at about 64. Nothing here is about
 * style — a sample that does not fit is a sample nobody can read.
 */
const LIMIT = 64

const pages = ['docs.hmx', 'gallery.hmx'].map((name) => ({
  name,
  source: readFileSync(`${siteDirectory}${name}`, 'utf8').replaceAll('\r\n', '\n'),
}))

describe('code samples in a split pane', () => {
  it.each(pages)('$name keeps every fenced line under the pane width', ({ source }) => {
    const long = [...source.matchAll(/```[a-z]*\n([\s\S]*?)```/g)]
      .flatMap((match) => match[1].split('\n'))
      .filter((line) => line.length > LIMIT)

    expect(long).toEqual([])
  })
})
