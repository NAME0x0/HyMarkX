import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packagesDirectory = resolve(repositoryRoot, 'packages')
const parserSourceDirectory = resolve(packagesDirectory, 'parser', 'src')
// The CLI and the language server are the host-facing packages: both need stdio and the
// filesystem. Everything else must run in a browser, which is what ADR-0005 protects.
const hostSourceDirectories = [
  resolve(packagesDirectory, 'cli', 'src'),
  resolve(packagesDirectory, 'language-server', 'src'),
]
/**
 * The one file allowed to import the Markdown engine outside `@hymarkx/parser`.
 *
 * It exists to measure HMX against a bare CommonMark + GFM parse, which is how invariant 1's
 * claim gets a number instead of an assertion — and measuring against the engine requires
 * importing it. The exemption is a single named file rather than a `benchmarks/` carve-out,
 * because a directory-wide hole would let the next engine import in without anyone deciding to
 * allow it.
 *
 * It stays honest because the engine packages are root devDependencies: nothing here reaches a
 * published package, and `checkManifest` still refuses them in every `packages/*` manifest.
 */
const engineComparisonFiles = new Set([
  resolve(repositoryRoot, 'benchmarks', 'performance', 'bare-parser.mjs'),
])
const forbiddenPackage =
  /^(?:micromark|mdast|hast|unist|remark|unified)|^@types\/(?:mdast|unist|hast)(?:$|\/)/
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/
const importPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]
// Node globals are not imports, so the specifier scan above cannot see them. Without this,
// `process.env` in the compiler would typecheck and pass the boundary check while quietly
// making the compiler unable to run in a browser.
const forbiddenGlobal = /(?<![.\w$])(?:process|Buffer|__dirname|__filename)(?![\w$])/g
const ignoredDirectories = new Set(['.git', '.tmp', 'coverage', 'dist', 'node_modules'])
const violations = []

function displayPath(path) {
  return relative(repositoryRoot, path).replaceAll('\\', '/')
}

function checkManifest(packageDirectory) {
  const manifestPath = resolve(packageDirectory, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name === '@hymarkx/parser') {
    return
  }

  for (const section of ['dependencies', 'devDependencies']) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (forbiddenPackage.test(dependency)) {
        violations.push(`${displayPath(manifestPath)} lists ${dependency} in ${section}`)
      }
    }
  }
}

/**
 * Blanks comments and quoted strings so the global scan cannot match English prose — the
 * word "process" in a diagnostic message is not a Node dependency. Template literals are
 * left intact so `${process.env.X}` is still caught; prose inside one may false-positive,
 * which is the safer direction for a guard.
 */
function stripCommentsAndStrings(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replaceAll(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replaceAll(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ')
}

function checkSourceFile(path) {
  // ADR-0005's browser-safety rule governs packages/. Editor integrations are host code by
  // definition — a VS Code extension runs in Node — so the Node checks below do not apply
  // to them, while the Markdown-engine rule still does everywhere.
  const isPackageSource = path.startsWith(`${packagesDirectory}${sep}`)
  const isParserSource = path.startsWith(`${parserSourceDirectory}${sep}`)
  const isCliSource = hostSourceDirectories.some((directory) =>
    path.startsWith(`${directory}${sep}`),
  )
  const source = readFileSync(path, 'utf8')
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (
        specifier !== undefined &&
        forbiddenPackage.test(specifier) &&
        !isParserSource &&
        !engineComparisonFiles.has(path)
      ) {
        violations.push(`${displayPath(path)} imports ${specifier}`)
      }
      if (
        specifier?.startsWith('node:') === true &&
        isPackageSource &&
        !isCliSource &&
        path.includes(`${sep}src${sep}`)
      ) {
        violations.push(
          `${displayPath(path)} imports ${specifier}; only @hymarkx/cli and @hymarkx/language-server may use Node builtins`,
        )
      }
    }
  }

  if (isPackageSource && !isCliSource && path.includes(`${sep}src${sep}`)) {
    const code = stripCommentsAndStrings(source)
    forbiddenGlobal.lastIndex = 0
    for (const match of code.matchAll(forbiddenGlobal)) {
      violations.push(
        `${displayPath(path)} uses the Node global \`${match[0]}\`; only @hymarkx/cli may assume Node`,
      )
    }
  }
}

function walkSource(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walkSource(path)
      }
    } else if (sourceExtension.test(entry.name)) {
      checkSourceFile(path)
    }
  }
}

for (const entry of readdirSync(packagesDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue
  }

  const packageDirectory = resolve(packagesDirectory, entry.name)
  checkManifest(packageDirectory)
}

walkSource(repositoryRoot)

if (violations.length > 0) {
  console.error('Dependency boundary violations (ADR-0005):')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  console.error('Only @hymarkx/parser may import or depend on Markdown engine packages.')
  process.exitCode = 1
} else {
  console.log('Dependency boundaries satisfy ADR-0005.')
}
