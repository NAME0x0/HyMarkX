import type {
  ComponentRegistry,
  RenderedAttributeBinding,
  RenderPlan,
  ResolvedAttributes,
} from './types.js'

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
  button: {
    name: 'button',
    kinds: ['container'],
    attributes: {
      type: {
        type: 'enum',
        values: ['button', 'submit', 'reset'],
        default: 'button',
        description: 'Native button behavior.',
      },
    },
    children: 'block',
    label: 'optional',
    description: 'A native button used by event handlers.',
  },
  input: {
    name: 'input',
    kinds: ['leaf', 'container'],
    attributes: {
      type: {
        type: 'enum',
        values: ['text'],
        default: 'text',
        description: 'Native text-input type.',
      },
      value: {
        type: 'string',
        default: '',
        description: 'Initial text-input value.',
      },
      name: {
        type: 'string',
        description: 'Native form field name.',
      },
    },
    children: 'none',
    label: 'forbidden',
    description: 'A native text input used by input and change handlers.',
  },
  form: {
    name: 'form',
    kinds: ['container'],
    attributes: {},
    children: 'block',
    label: 'forbidden',
    description: 'A native form used by submit handlers.',
  },
}

function classPlan(
  tag: string,
  className: string,
  labelTag?: string,
  labelClass?: string,
  attributeBindings?: readonly RenderedAttributeBinding[],
): RenderPlan {
  return {
    wrappers: [{ tag, attributes: { class: className } }],
    ...(labelTag === undefined || labelClass === undefined
      ? {}
      : { labelWrapper: { tag: labelTag, attributes: { class: labelClass } } }),
    ...(attributeBindings === undefined ? {} : { attributeBindings }),
  }
}

function classBinding(
  prefix: string,
  attributes: ResolvedAttributes,
  variant?: string,
): RenderedAttributeBinding {
  const segments: (string | { readonly attribute: string })[] = [prefix]
  if (variant !== undefined) segments.push({ attribute: variant })
  if (typeof attributes.class === 'string') {
    segments.push(' ', { attribute: 'class' })
  }
  return { name: 'class', segments }
}

const renderers: ComponentRegistry['renderers'] = {
  note: (_node, attributes) =>
    classPlan(
      'aside',
      typeof attributes.type === 'string' ? `hmx-note hmx-note-${attributes.type}` : 'hmx-note',
      'p',
      'hmx-note-title',
      [classBinding('hmx-note hmx-note-', attributes, 'type')],
    ),
  card: (_node, attributes) =>
    classPlan('article', 'hmx-card', 'h3', 'hmx-card-title', [
      classBinding('hmx-card', attributes),
    ]),
  grid: (_node, attributes: ResolvedAttributes) => {
    const numericStyle =
      typeof attributes.columns === 'number' && typeof attributes.gap === 'number'
        ? { style: `--hmx-grid-columns:${attributes.columns};--hmx-grid-gap:${attributes.gap}` }
        : {}
    return {
      wrappers: [{ tag: 'div', attributes: { class: 'hmx-grid', ...numericStyle } }],
      attributeBindings: [
        classBinding('hmx-grid', attributes),
        {
          name: 'style',
          segments: [
            '--hmx-grid-columns:',
            { attribute: 'columns' },
            ';--hmx-grid-gap:',
            { attribute: 'gap' },
          ],
        },
      ],
    }
  },
  metric: (_node, attributes) =>
    classPlan('div', 'hmx-metric', 'p', 'hmx-metric-label', [
      classBinding('hmx-metric', attributes),
    ]),
  badge: (_node, attributes) =>
    classPlan(
      'span',
      typeof attributes.kind === 'string' ? `hmx-badge hmx-badge-${attributes.kind}` : 'hmx-badge',
      undefined,
      undefined,
      [classBinding('hmx-badge hmx-badge-', attributes, 'kind')],
    ),
  button: (_node, attributes) => ({
    wrappers: [
      {
        tag: 'button',
        attributes: {
          type: typeof attributes.type === 'string' ? attributes.type : 'button',
        },
      },
    ],
    flattenSingleParagraph: true,
  }),
  input: (_node, attributes) => ({
    wrappers: [
      {
        tag: 'input',
        attributes: {
          type: typeof attributes.type === 'string' ? attributes.type : 'text',
          value: typeof attributes.value === 'string' ? attributes.value : '',
          ...(typeof attributes.name === 'string' ? { name: attributes.name } : {}),
        },
        void: true,
      },
    ],
  }),
  form: () => ({ wrappers: [{ tag: 'form', attributes: {} }] }),
}

/** The built-in component schemas and their separate trusted renderers. */
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
