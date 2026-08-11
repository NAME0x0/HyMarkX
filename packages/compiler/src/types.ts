import type { Diagnostic } from '@hymarkx/ast'

/** Host-selected trust boundary used while emitting HTML. */
export type TrustMode = 'document' | 'app'

/** Options controlling parsing, analysis, and HTML emission. */
export interface CompileOptions {
  /** Host-selected. Never inferred from document content. Default: `document`. */
  readonly trust?: TrustMode
  /** File path used when rendering diagnostics. */
  readonly from?: string
  /** Enables GFM tables, task lists, strikethrough, and autolinks. Default: `true`. */
  readonly gfm?: boolean
}

/** Result of compiling source or an existing HMX syntax tree. */
export interface CompileResult {
  /** Deterministic HTML output. */
  readonly html: string
  /** Parser, analysis, and emission diagnostics in source order. */
  readonly diagnostics: readonly Diagnostic[]
  /** Normalized source indexed by every diagnostic span. */
  readonly source: string
}
