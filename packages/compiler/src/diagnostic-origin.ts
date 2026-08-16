import type { Diagnostic } from '@hymarkx/ast'

/** Source text and optional path associated with a compiler diagnostic. */
export interface DiagnosticOrigin {
  readonly source: string
  readonly from?: string
}

const origins = new WeakMap<Diagnostic, DiagnosticOrigin>()

/** Associates a diagnostic with its originating source unless it already has an origin. */
export function setDiagnosticOrigin(
  diagnostic: Diagnostic,
  source: string,
  from: string | undefined,
): void {
  if (!origins.has(diagnostic)) {
    origins.set(diagnostic, { source, ...(from === undefined ? {} : { from }) })
  }
}

/** Returns the source that produced a diagnostic when the compiler knows it. */
export function diagnosticOrigin(diagnostic: Diagnostic): DiagnosticOrigin | undefined {
  return origins.get(diagnostic)
}
