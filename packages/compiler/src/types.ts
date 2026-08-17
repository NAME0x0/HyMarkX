import type { Diagnostic } from '@hymarkx/ast'
import type { ComponentRegistry } from './components/types.js'

/** Host-selected trust boundary used while emitting HTML. */
export type TrustMode = 'document' | 'app'

/** A scalar value accepted in parsed frontmatter. */
export type FrontmatterScalar = string | number | boolean | null

/** A parsed frontmatter mapping exposed to compiler consumers. */
export type FrontmatterValue = {
  readonly [key: string]: FrontmatterScalar | readonly FrontmatterScalar[] | FrontmatterValue
}

/** Options controlling parsing, analysis, and HTML emission. */
export interface CompileOptions {
  /** Host-selected. Never inferred from document content. Default: `document`. */
  readonly trust?: TrustMode
  /** File path used when rendering diagnostics. */
  readonly from?: string
  /** Enables GFM tables, task lists, strikethrough, and autolinks. Default: `true`. */
  readonly gfm?: boolean
  /** Additional or replacement name-keyed component schemas and renderers. */
  readonly components?: ComponentRegistry
  /** Emit CSS in a `<style>` element ahead of the HTML content. Default: `false`. */
  readonly inlineCss?: boolean
  /** Emit JavaScript in a `<script>` element after the HTML content. Default: `false`. */
  readonly inlineJs?: boolean
}

/** Result of compiling source or an existing HMX syntax tree. */
export interface CompileResult {
  /** Deterministic HTML output. */
  readonly html: string
  /** Stylesheet for this document. Empty when no styles are needed. */
  readonly css: string
  /** Feature-shaped interactive runtime. Empty when the document is static. */
  readonly js: string
  /** Parser, analysis, and emission diagnostics in source order. */
  readonly diagnostics: readonly Diagnostic[]
  /** Normalized source indexed by every diagnostic span. */
  readonly source: string
  /** Parsed frontmatter, or undefined when the document has none. */
  readonly frontmatter?: FrontmatterValue
  /**
   * Foreign-component references for the host to resolve and bundle (ADR-0016).
   *
   * Empty for every document without an `::island`. The compiler records references and
   * never imports, transpiles, or evaluates them, so a document using islands is **not
   * runnable from `hmx build` output alone** — a host integration must supply the modules
   * and their framework runtime.
   */
  readonly islands: readonly IslandRef[]
}

/** Props passed to a foreign component: the same restricted scalars expressions produce. */
export type IslandProps = Readonly<Record<string, string | number | boolean | null>>

/** One foreign-component reference in the island manifest. */
export interface IslandRef {
  readonly id: number
  readonly from: string
  readonly export: string
  readonly props: IslandProps
}
