import type { Diagnostic, Root } from '@hymarkx/ast'
import { parse } from '@hymarkx/parser'
import { analyze } from './analyze/index.js'
import { builtinComponents, mergeComponentRegistries } from './components/builtins.js'
import { renderDiagnostic, renderDiagnostics } from './diagnostics/render.js'
import { htmlBackend } from './emit/html.js'
import { compileFrontmatter } from './frontmatter.js'
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
  return {
    html: compiled.html,
    css: compiled.css,
    diagnostics: [...carried, ...parsed.diagnostics, ...compiled.diagnostics],
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
  })
  const styles = prepareStyles(analyzed, source, {
    ...(options.from === undefined ? {} : { from: options.from }),
    collectAuthorStyles: trust === 'app',
  })
  const emitted = htmlBackend.emit(analyzed, {
    trust,
    omittedNodes: styles.omittedNodes,
    scopeAttributes: styles.scopeAttributes,
  })
  const html =
    options.inlineCss === true && styles.css !== ''
      ? `<style>\n${styles.css}\n</style>\n${emitted.html}`
      : emitted.html
  return {
    html,
    css: styles.css,
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

export { builtinComponents, renderDiagnostic, renderDiagnostics }
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
