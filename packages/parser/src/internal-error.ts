import type { Diagnostic } from '@hymarkx/ast'

/** Internal parser failure carrying the diagnostic returned by the public API. */
export class ParserInternalError extends Error {
  readonly diagnostic: Diagnostic

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message)
    this.name = 'ParserInternalError'
    this.diagnostic = diagnostic
  }
}
