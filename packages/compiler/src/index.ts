import type { Root } from '@hymarkx/ast'
import { parse } from '@hymarkx/parser'
import { analyze } from './analyze/index.js'
import { builtinComponents, mergeComponentRegistries } from './components/builtins.js'
import { renderDiagnostic, renderDiagnostics } from './diagnostics/render.js'
import { htmlBackend } from './emit/html.js'
import type { CompileOptions, CompileResult } from './types.js'

/** Compiles normalized Markdown source to trust-aware HTML. */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const parsed = parse(source, {
    ...(options.from === undefined ? {} : { from: options.from }),
    ...(options.gfm === undefined ? {} : { gfm: options.gfm }),
  })
  const compiled = compileAst(parsed.root, parsed.source, options)
  return {
    html: compiled.html,
    diagnostics: [...parsed.diagnostics, ...compiled.diagnostics],
    source: parsed.source,
  }
}

/** Compiles an existing HMX syntax tree to trust-aware HTML. */
export function compileAst(
  root: Root,
  source: string,
  options: CompileOptions = {},
): CompileResult {
  const trust = options.trust ?? 'document'
  const analyzed = analyze(root, {
    components: mergeComponentRegistries(options.components),
    trust,
  })
  const emitted = htmlBackend.emit(analyzed, { trust })
  return {
    html: emitted.html,
    diagnostics: [...analyzed.diagnostics, ...emitted.diagnostics],
    source,
  }
}

export { builtinComponents, renderDiagnostic, renderDiagnostics }
export type { RenderDiagnosticOptions } from './diagnostics/render.js'
export type { Backend, EmitResult } from './emit/backend.js'
export type { CompileOptions, CompileResult, TrustMode } from './types.js'
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
