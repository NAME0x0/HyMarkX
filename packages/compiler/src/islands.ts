import { createDiagnostic } from '@hymarkx/ast'
import type { Diagnostic } from '@hymarkx/ast'
import type { DirectiveNode } from './components/types.js'
import type { IslandProps, TrustMode } from './types.js'

/** One foreign-component reference recorded for the host to bundle. */
export interface Island {
  /** Stable index, matching the `data-hmx-island` attribute in the HTML. */
  readonly id: number
  /** Module specifier exactly as written. The compiler does not resolve it. */
  readonly from: string
  /** Named export to render. Defaults to `default`. */
  readonly export: string
  /** Serialisable props, restricted to the scalars expressions produce. */
  readonly props: IslandProps
}

/** Matches a bare relative or package specifier; anything with a scheme is refused. */
const SPECIFIER = /^(?:\.{1,2}\/|\/|@?[\w~.-]+(?:\/[\w~.-]+)*)/

const RESERVED = new Set(['from', 'export'])

/**
 * Reads an `::island` directive into a manifest entry.
 *
 * The compiler never imports, transpiles, or evaluates the referenced module — it records a
 * reference and nothing more. That closes threat T5 (build-time remote code execution) by
 * construction rather than by sandboxing, which is the whole point of ADR-0016.
 */
export function islandFor(
  node: DirectiveNode,
  id: number,
  trust: TrustMode,
  diagnostics: Diagnostic[],
): Island | undefined {
  if (trust !== 'app') {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX3010',
        severity: 'error',
        message: 'Foreign components require app trust mode.',
        span: node.position,
        expected: 'a host that has opted into app mode',
      }),
    )
    return undefined
  }

  const attribute = (name: string) =>
    [...node.attributes].reverse().find((candidate) => candidate.name === name)

  const from = attribute('from')
  if (from === undefined || from.value === null || from.value.trim() === '') {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2072',
        severity: 'error',
        message: 'A foreign component needs a "from" module specifier.',
        span: node.position,
        expected: 'from="./Component.tsx"',
      }),
    )
    return undefined
  }

  // A specifier is data the host will resolve, so anything that could name a network
  // location or a data URL is refused here rather than left to the bundler's judgement.
  // `//host/x.js` is the subtle one: protocol-relative, so it has no scheme to detect and
  // still loads from a remote origin.
  if (
    !SPECIFIER.test(from.value) ||
    from.value.includes(':') ||
    from.value.startsWith('//') ||
    from.value.startsWith('\\')
  ) {
    diagnostics.push(
      createDiagnostic({
        code: 'HMX2072',
        severity: 'error',
        message: `Module specifier "${from.value}" is not a relative or package path.`,
        span: from.valueSpan ?? from.position,
        expected: 'a path such as ./Chart.tsx or @scope/package',
      }),
    )
    return undefined
  }

  const props: Record<string, string | number | boolean | null> = Object.create(null)
  for (const candidate of node.attributes) {
    if (RESERVED.has(candidate.name)) {
      continue
    }
    // Bare attributes mean true; everything else arrives as a string. Numbers are left as
    // written, because coercing them here would guess at a type the component declares.
    props[candidate.name] = candidate.value === null ? true : candidate.value
  }

  const exported = attribute('export')
  const island: Island = {
    id,
    from: from.value,
    export: exported?.value ?? 'default',
    props,
  }

  diagnostics.push(
    createDiagnostic({
      code: 'HMX2070',
      severity: 'info',
      message: `Island "${island.export}" from ${island.from} needs a framework runtime supplied by the host.`,
      span: node.position,
    }),
  )

  return island
}
