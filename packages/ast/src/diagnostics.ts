import type { Span } from './types.js'

/** The importance assigned to a diagnostic. */
export type Severity = 'error' | 'warning' | 'info'

/** Additional source context associated with a diagnostic. */
export interface RelatedSpan {
  readonly message: string
  readonly span: Span
}

/** A machine-applicable source replacement suggested by a diagnostic. */
export interface Suggestion {
  readonly message: string
  readonly span: Span
  readonly replacement: string
}

/** A stable, source-located parser or compiler message. */
export interface Diagnostic {
  readonly code: string
  readonly severity: Severity
  readonly message: string
  readonly span: Span
  readonly expected?: string
  readonly suggestion?: Suggestion
  readonly related?: readonly RelatedSpan[]
  readonly url?: string
}

const DIAGNOSTIC_CODE_PATTERN = /^HMX[1-5]\d{3}$/

/** Validates and returns a diagnostic supplied by a parser or compiler stage. */
export const createDiagnostic = (diagnostic: Diagnostic): Diagnostic => {
  if (diagnostic.code.length !== 7 || !DIAGNOSTIC_CODE_PATTERN.test(diagnostic.code)) {
    throw new TypeError(`Invalid diagnostic code: ${diagnostic.code}`)
  }

  return diagnostic
}

/** Reports whether a diagnostic list contains at least one error. */
export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error')
