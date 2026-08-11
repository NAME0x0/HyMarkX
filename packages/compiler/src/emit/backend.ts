import type { Diagnostic } from '@hymarkx/ast'
import type { AnalyzedDocument } from '../analyze/index.js'

/** Output returned by a compiler backend. */
export interface EmitResult {
  readonly html: string
  readonly diagnostics: readonly Diagnostic[]
}

/** Backend boundary kept stable so a future IR can be inserted without emitter rewrites. */
export interface Backend<TOptions = unknown> {
  readonly name: string
  emit(document: AnalyzedDocument, options: TOptions): EmitResult
}
