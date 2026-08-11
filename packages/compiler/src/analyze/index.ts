import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Diagnostic, Root } from '@hymarkx/ast'

/** Syntax tree plus diagnostics produced by semantic analysis. */
export interface AnalyzedDocument {
  readonly root: Root
  readonly diagnostics: readonly Diagnostic[]
}

/** Runs the Phase 1 semantic checks without mutating the syntax tree. */
export function analyze(root: Root): AnalyzedDocument {
  const diagnostics: Diagnostic[] = []

  visit(root, (node) => {
    if (
      node.type === 'textDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'containerDirective'
    ) {
      diagnostics.push(
        createDiagnostic({
          code: 'HMX2002',
          severity: 'warning',
          message: `Unknown directive "${node.name}"; rendering its content without a wrapper.`,
          span: node.position,
        }),
      )
    }
  })

  return { root, diagnostics }
}
