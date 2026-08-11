import type { ContainerDirective, LeafDirective, TextDirective } from '@hymarkx/ast'

/** Attribute value categories supported by component schemas. */
export type AttributeType = 'string' | 'number' | 'boolean' | 'enum' | 'url' | 'identifier'

/** JSON-serializable validation rules for one component attribute. */
export interface AttributeSchema {
  readonly type: AttributeType
  /** Required when `type` is `enum`. */
  readonly values?: readonly string[]
  readonly required?: boolean
  /** Applied when the attribute is absent. Must satisfy this schema. */
  readonly default?: string
  /** Inclusive lower bound for numbers. */
  readonly min?: number
  /** Inclusive upper bound for numbers. */
  readonly max?: number
  /** One sentence used by diagnostics and future editor tooling. */
  readonly description: string
}

/** Directive syntax forms understood by component schemas. */
export type DirectiveKind = 'container' | 'leaf' | 'text'

/** Pure-data contract for one registered component. */
export interface ComponentSchema {
  readonly name: string
  /** Forms in which the component may be written. */
  readonly kinds: readonly DirectiveKind[]
  readonly attributes: Readonly<Record<string, AttributeSchema>>
  /** Content accepted between fences or inside a text directive label. */
  readonly children: 'block' | 'phrasing' | 'none'
  readonly label: 'required' | 'optional' | 'forbidden'
  readonly description: string
}

/** A validated component attribute value. */
export type ResolvedAttribute = string | number | boolean

/** Null-prototype, post-validation attributes supplied to renderers. */
export type ResolvedAttributes = Readonly<Record<string, ResolvedAttribute>>

/** One trusted HTML wrapper requested by a component renderer. */
export interface RenderedElement {
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
}

/** Trusted wrapper structure returned by a component renderer. */
export interface RenderPlan {
  /** Outermost to innermost. Children are emitted inside the last wrapper. */
  readonly wrappers: readonly RenderedElement[]
  /** Wraps the label before children inside the innermost wrapper. */
  readonly labelWrapper?: RenderedElement
}

/** A parsed directive node accepted by component renderers. */
export type DirectiveNode = TextDirective | LeafDirective | ContainerDirective

/**
 * Trusted host code that renders already validated attributes.
 *
 * Validation is identical in both trust modes except that `url` attributes use the
 * host-selected mode's URL-scheme policy.
 */
export type ComponentRenderer = (node: DirectiveNode, attributes: ResolvedAttributes) => RenderPlan

/** Separate schema-data and renderer-code lookups keyed by component name. */
export interface ComponentRegistry {
  readonly schemas: Readonly<Record<string, ComponentSchema>>
  readonly renderers: Readonly<Record<string, ComponentRenderer>>
}
