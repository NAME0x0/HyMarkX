import type { Diagnostic, Root } from '@hymarkx/ast'
import { parse } from '@hymarkx/parser'
import { analyze } from './analyze/index.js'
import { compileComponents } from './components/authored.js'
import { builtinComponents, mergeComponentRegistries } from './components/builtins.js'
import { diagnosticOrigin, setDiagnosticOrigin } from './diagnostic-origin.js'
import { renderDiagnostic, renderDiagnostics } from './diagnostics/render.js'
import { htmlBackend } from './emit/html.js'
import { compileFrontmatter } from './frontmatter.js'
import { prepareInteractivity } from './runtime.js'
import { emptyScopeDiagnostics, prepareStyles } from './styles.js'
import type { CompileOptions, CompileResult } from './types.js'

/** Compiles normalized Markdown source to trust-aware HTML. */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const parseOptions = {
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.gfm === undefined ? {} : { gfm: options.gfm }),
  }
  let parsed = parse(source, parseOptions)

  // `---` is ordinary CommonMark as well as a frontmatter delimiter. When a leading block
  // is not a YAML mapping it was never frontmatter, so reparse and let Markdown have it.
  // SPEC §3 outranks frontmatter, and the conformance suite holds us to it.
  //
  // The rejected pass still carries diagnostics when the block was plainly *meant* as
  // frontmatter, and those must survive the reparse — otherwise a typo in real frontmatter
  // renders as prose and says nothing.
  const firstPass = compileFrontmatter(parsed.root, parsed.source)
  let carried: readonly Diagnostic[] = []
  if (!firstPass.recognized) {
    carried = firstPass.diagnostics
    parsed = parse(source, { ...parseOptions, frontmatter: false })
  }

  const compiled = compileAst(parsed.root, parsed.source, options)
  const diagnostics = [...carried, ...parsed.diagnostics, ...compiled.diagnostics]
  for (const diagnostic of diagnostics) {
    setDiagnosticOrigin(diagnostic, parsed.source, options.from)
  }
  return {
    html: compiled.html,
    css: compiled.css,
    js: compiled.js,
    diagnostics,
    source: parsed.source,
    ...(compiled.frontmatter === undefined ? {} : { frontmatter: compiled.frontmatter }),
  }
}

/** Compiles an existing HMX syntax tree to trust-aware HTML. */
export function compileAst(
  root: Root,
  source: string,
  options: CompileOptions = {},
): CompileResult {
  const trust = options.trust ?? 'document'
  const frontmatter = compileFrontmatter(root, source)
  const analyzed = analyze(root, {
    components: mergeComponentRegistries(options.components),
    trust,
    source,
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(frontmatter.value === undefined ? {} : { frontmatter: frontmatter.value }),
  })
  const styles = prepareStyles(analyzed, source, {
    ...(options.from === undefined ? {} : { from: options.from }),
    collectAuthorStyles: trust === 'app',
  })
  const interactivity = prepareInteractivity(analyzed)
  const emitted = htmlBackend.emit(analyzed, {
    trust,
    omittedNodes: styles.omittedNodes,
    rootScopeAttributes: styles.rootScopeAttributes,
    componentScopeAttributes: styles.componentScopeAttributes,
    interactivity,
  })
  const styledHtml =
    options.inlineCss === true && styles.css !== ''
      ? `<style>\n${styles.css}\n</style>\n${emitted.html}`
      : emitted.html
  const html =
    options.inlineJs === true && interactivity.js !== ''
      ? `${styledHtml}<script>${interactivity.js}</script>\n`
      : styledHtml
  return {
    html,
    css: styles.css,
    js: interactivity.js,
    diagnostics: [
      ...frontmatter.diagnostics,
      ...analyzed.diagnostics,
      ...styles.diagnostics,
      ...emitted.diagnostics,
      ...emptyScopeDiagnostics(styles, emitted.html),
    ],
    source,
    ...(frontmatter.value === undefined ? {} : { frontmatter: frontmatter.value }),
  }
}

export {
  builtinComponents,
  compileComponents,
  diagnosticOrigin,
  renderDiagnostic,
  renderDiagnostics,
}
export type { AuthoredComponent, CompileComponentsResult } from './components/authored.js'
export type { DiagnosticOrigin } from './diagnostic-origin.js'
export type { RenderDiagnosticOptions } from './diagnostics/render.js'
export type { Backend, EmitResult } from './emit/backend.js'
export type {
  CompileOptions,
  CompileResult,
  FrontmatterScalar,
  FrontmatterValue,
  TrustMode,
} from './types.js'
export type {
  AttributeSchema,
  AttributeType,
  ComponentRegistry,
  ComponentRenderer,
  ComponentSchema,
  DirectiveKind,
  RenderedElement,
  RenderPlan,
  ResolvedAttribute,
  ResolvedAttributes,
} from './components/types.js'
