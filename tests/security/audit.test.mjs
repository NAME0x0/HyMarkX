import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Verifies that `docs/security-audit.md` still describes reality.
 *
 * The audit's whole value is that each threat names a test which would fail if the control were
 * removed. A renamed or deleted test turns that into a document asserting coverage that does
 * not exist — which is worse than having no audit, because it reads as evidence. So every
 * reference in it is checked here.
 *
 * The audit cites parametrised tests by their template title (`refuses the specifier %j`),
 * which is what appears in the source, so a literal search is the right check.
 */
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const auditPath = `${repositoryRoot}docs/security-audit.md`
const audit = readFileSync(auditPath, 'utf8')

/**
 * Pulls `| `path` | `test name` |` rows out of the evidence tables.
 *
 * Deliberately strict about the shape rather than scanning for anything backticked: a loose
 * pattern would quietly stop matching if the tables were reformatted, and this test would then
 * pass by checking nothing.
 */
function evidenceRows(markdown) {
  const rows = []
  for (const match of markdown.matchAll(/^\|\s*`([^`]+\.(?:mjs|ts))`\s*\|\s*`([^`]+)`\s*\|$/gm)) {
    rows.push({ file: match[1], testName: match[2] })
  }
  return rows
}

const rows = evidenceRows(audit)

describe('security audit', () => {
  // If the tables are reformatted into a shape the pattern above cannot read, every assertion
  // below would vacuously pass. This is the guard against that.
  it('found the evidence tables', () => {
    expect(rows.length).toBeGreaterThan(25)
  })

  it.each([...new Set(rows.map((row) => row.file))])('cites a real file: %s', (file) => {
    expect(existsSync(`${repositoryRoot}${file}`)).toBe(true)
  })

  it.each(rows.map((row) => [row.file, row.testName]))(
    '%s still defines a test named %j',
    (file, testName) => {
      const source = readFileSync(`${repositoryRoot}${file}`, 'utf8')

      expect(source).toContain(testName)
    },
  )

  // Every threat in SECURITY.md must appear in the audit. Adding a threat to the model without
  // auditing it is exactly the drift this file exists to catch.
  it('covers every threat in the model', () => {
    const model = readFileSync(`${repositoryRoot}SECURITY.md`, 'utf8')
    const threats = [...model.matchAll(/^\|\s*(T\d+)\s*\|/gm)].map((match) => match[1])

    expect(threats.length).toBeGreaterThan(10)
    for (const threat of threats) {
      expect(audit).toContain(`### ${threat} —`)
    }
  })

  // The audit's own honesty, pinned. These are load-bearing statements about what the project
  // does not know, and they are the first thing that would be quietly dropped.
  it.each([
    'It is not an external review',
    'must not be used to render untrusted content in production',
    'No external review, no third-party pentest, no bug bounty',
  ])('still states the limitation: %j', (statement) => {
    // Compared against the whitespace-collapsed document: these are prose sentences, and prose
    // gets rewrapped. Matching the raw text would fail the moment a line grew by one word.
    expect(audit.replaceAll(/\s+/g, ' ')).toContain(statement)
  })
})
