import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packagesDirectory = resolve(repositoryRoot, 'packages')
const parserSourceDirectory = resolve(packagesDirectory, 'parser', 'src')
const forbiddenPackage =
  /^(?:micromark|mdast|hast|unist|remark|unified)|^@types\/(?:mdast|unist|hast)(?:$|\/)/
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/
const importPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]
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

function checkSourceFile(path) {
  if (path.startsWith(`${parserSourceDirectory}${sep}`) || path === parserSourceDirectory) {
    return
  }

  const source = readFileSync(path, 'utf8')
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier !== undefined && forbiddenPackage.test(specifier)) {
        violations.push(`${displayPath(path)} imports ${specifier}`)
      }
    }
  }
}

function walkSource(directory) {
  if (directory === parserSourceDirectory) {
    return
  }

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
