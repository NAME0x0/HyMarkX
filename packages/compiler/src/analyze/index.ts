import { createDiagnostic, visit } from '@hymarkx/ast'
import type { Diagnostic, Root } from '@hymarkx/ast'
import type { ComponentRegistry, DirectiveNode } from '../components/types.js'
import { nearestSuggestion, validateComponent } from '../components/validate.js'
import type { AnalyzedComponent } from '../components/validate.js'
import type { TrustMode } from '../types.js'

/** Syntax tree plus diagnostics produced by semantic analysis. */
export interface AnalyzedDocument {
  readonly root: Root
  readonly diagnostics: readonly Diagnostic[]
  readonly components: ReadonlyMap<DirectiveNode, AnalyzedComponent>
}

interface AnalyzeOptions {
  readonly components: ComponentRegistry
  readonly trust: TrustMode
}

/**
 * Matches a line that opens like a block directive: two or more colons immediately
 * followed by a directive name character. Prose such as `:: note` or a bare `:::` does
 * not match, because a name character must follow the colons with no space.
 */
const DIRECTIVE_LIKE = /^:{2,}[A-Za-z0-9]/

/**
 * Reports paragraphs that look like a block directive but were not parsed as one.
 *
 * The tokenizer refuses to open a directive whose attribute block is malformed — for
 * example `:::card{ bad` or the not-yet-supported `:::card{title={user.name}}` — and the
 * line then falls through to ordinary Markdown. Without this check the document renders
 * the source text verbatim and says nothing, which is the least debuggable failure a
 * markup language can have.
 */
function checkDirectiveLikeParagraphs(root: Root, diagnostics: Diagnostic[]): void {
  visit(root, (node) => {
    if (node.type !== 'paragraph') {
      return
    }

    const first = node.children[0]
    if (first?.type !== 'text' || !DIRECTIVE_LIKE.test(first.value)) {
      return
    }

    diagnostics.push(
      createDiagnostic({
        code: 'HMX1011',
        severity: 'warning',
        message: 'This line looks like a directive but was not recognized as one.',
        span: node.position,
        expected: 'a well-formed attribute block, such as :::name{key="value"}',
      }),
    )
  })
}

/** Runs semantic component checks without mutating the syntax tree. */
export function analyze(root: Root, options: AnalyzeOptions): AnalyzedDocument {
  const diagnostics: Diagnostic[] = []
  const components = new Map<DirectiveNode, AnalyzedComponent>()

  checkDirectiveLikeParagraphs(root, diagnostics)

  visit(root, (node) => {
    if (
      node.type === 'textDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'containerDirective'
    ) {
      const schema = Object.hasOwn(options.components.schemas, node.name)
        ? options.components.schemas[node.name]
        : undefined
      const renderer = Object.hasOwn(options.components.renderers, node.name)
        ? options.components.renderers[node.name]
        : undefined
      if (schema === undefined || renderer === undefined) {
        const replacement = nearestSuggestion(node.name, Object.keys(options.components.schemas))
        diagnostics.push(
          createDiagnostic({
            code: 'HMX2002',
            severity: 'warning',
            message: `Unknown directive "${node.name}"; rendering its content without a wrapper.`,
            span: node.position,
            ...(replacement === undefined
              ? {}
              : {
                  suggestion: {
                    message: `Replace with "${replacement}".`,
                    replacement,
                    span: node.position,
                  },
                }),
          }),
        )
      } else {
        components.set(node, validateComponent(node, schema, renderer, options.trust, diagnostics))
      }
    }
  })

  return { root, diagnostics, components }
}
