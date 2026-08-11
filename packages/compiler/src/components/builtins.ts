import type { ComponentRegistry, RenderPlan, ResolvedAttributes } from './types.js'

const statusValues = ['info', 'warning', 'danger', 'success'] as const

const schemas: ComponentRegistry['schemas'] = {
  note: {
    name: 'note',
    kinds: ['container'],
    attributes: {
      type: {
        type: 'enum',
        values: statusValues,
        default: 'info',
        description: 'Visual status of the note.',
      },
    },
    children: 'block',
    label: 'optional',
    description: 'A callout containing related information.',
  },
  card: {
    name: 'card',
    kinds: ['container'],
    attributes: {},
    children: 'block',
    label: 'optional',
    description: 'A grouped card of content.',
  },
  grid: {
    name: 'grid',
    kinds: ['container'],
    attributes: {
      columns: {
        type: 'number',
        default: '3',
        min: 1,
        max: 12,
        description: 'Integer number of grid columns from 1 through 12.',
      },
      gap: {
        type: 'number',
        default: '4',
        min: 0,
        max: 16,
        description: 'Integer grid gap from 0 through 16.',
      },
    },
    children: 'block',
    label: 'optional',
    description: 'A grid layout for block content.',
  },
  metric: {
    name: 'metric',
    kinds: ['container'],
    attributes: {},
    children: 'block',
    label: 'optional',
    description: 'A labelled metric or key figure.',
  },
  badge: {
    name: 'badge',
    kinds: ['text'],
    attributes: {
      kind: {
        type: 'enum',
        values: statusValues,
        default: 'info',
        description: 'Visual status of the badge.',
      },
    },
    children: 'phrasing',
    label: 'optional',
    description: 'An inline status badge.',
  },
}

function classPlan(
  tag: string,
  className: string,
  labelTag?: string,
  labelClass?: string,
): RenderPlan {
  return {
    wrappers: [{ tag, attributes: { class: className } }],
    ...(labelTag === undefined || labelClass === undefined
      ? {}
      : { labelWrapper: { tag: labelTag, attributes: { class: labelClass } } }),
  }
}

const renderers: ComponentRegistry['renderers'] = {
  note: (_node, attributes) =>
    classPlan(
      'aside',
      typeof attributes.type === 'string' ? `hmx-note hmx-note-${attributes.type}` : 'hmx-note',
      'p',
      'hmx-note-title',
    ),
  card: () => classPlan('article', 'hmx-card', 'h3', 'hmx-card-title'),
  grid: (_node, attributes: ResolvedAttributes) => {
    const numericStyle =
      typeof attributes.columns === 'number' && typeof attributes.gap === 'number'
        ? { style: `--hmx-grid-columns:${attributes.columns};--hmx-grid-gap:${attributes.gap}` }
        : {}
    return { wrappers: [{ tag: 'div', attributes: { class: 'hmx-grid', ...numericStyle } }] }
  },
  metric: () => classPlan('div', 'hmx-metric', 'p', 'hmx-metric-label'),
  badge: (_node, attributes) =>
    classPlan(
      'span',
      typeof attributes.kind === 'string' ? `hmx-badge hmx-badge-${attributes.kind}` : 'hmx-badge',
    ),
}

/** The five built-in component schemas and their separate trusted renderers. */
export const builtinComponents: ComponentRegistry = { schemas, renderers }

/** Merges caller components over the built-ins in each name-keyed lookup. */
export function mergeComponentRegistries(
  components: ComponentRegistry | undefined,
): ComponentRegistry {
  if (components === undefined) {
    return builtinComponents
  }
  return {
    schemas: { ...builtinComponents.schemas, ...components.schemas },
    renderers: { ...builtinComponents.renderers, ...components.renderers },
  }
}
