const TOKENS = `:where(:root) {
  --hmx-color-surface: #f8fafc;
  --hmx-color-text: #172033;
  --hmx-color-muted: #526176;
  --hmx-color-border: #cbd5e1;
  --hmx-color-info: #2563eb;
  --hmx-color-warning: #b45309;
  --hmx-color-danger: #dc2626;
  --hmx-color-success: #15803d;
  --hmx-space-sm: 0.5rem;
  --hmx-space-md: 1rem;
  --hmx-space-lg: 1.5rem;
  --hmx-radius: 0.5rem;
  --hmx-border: 0.0625rem solid var(--hmx-color-border);
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    --hmx-color-surface: #172033;
    --hmx-color-text: #f8fafc;
    --hmx-color-muted: #cbd5e1;
    --hmx-color-border: #475569;
    --hmx-color-info: #60a5fa;
    --hmx-color-warning: #fbbf24;
    --hmx-color-danger: #f87171;
    --hmx-color-success: #4ade80;
  }
}`

const COMPONENT_STYLES: Readonly<Record<string, string>> = {
  button: `:where(.hmx-button) {
  font: inherit;
  padding: var(--hmx-space-sm) var(--hmx-space-md);
  border: var(--hmx-border);
  border-radius: var(--hmx-radius);
  background: var(--hmx-color-surface);
  color: var(--hmx-color-text);
  cursor: pointer;
}
:where(.hmx-button):hover {
  border-color: var(--hmx-color-info);
}
:where(.hmx-button):focus-visible {
  outline: 0.125rem solid var(--hmx-color-info);
  outline-offset: 0.125rem;
}
:where(.hmx-button):disabled {
  cursor: not-allowed;
  opacity: 0.6;
}`,
  input: `:where(.hmx-input) {
  font: inherit;
  padding: var(--hmx-space-sm);
  border: var(--hmx-border);
  border-radius: var(--hmx-radius);
  background: var(--hmx-color-surface);
  color: var(--hmx-color-text);
}
:where(.hmx-input):focus-visible {
  outline: 0.125rem solid var(--hmx-color-info);
  outline-offset: 0.125rem;
}`,
  form: `:where(.hmx-form) {
  display: flex;
  flex-direction: column;
  gap: var(--hmx-space-md);
}`,
  note: `:where(.hmx-note) {
  --hmx-status-color: var(--hmx-color-info);
  border: var(--hmx-border);
  border-inline-start: 0.25rem solid var(--hmx-status-color);
  border-radius: var(--hmx-radius);
  padding: var(--hmx-space-md);
  background: var(--hmx-color-surface);
  color: var(--hmx-color-text);
}
:where(.hmx-note-warning) { --hmx-status-color: var(--hmx-color-warning); }
:where(.hmx-note-danger) { --hmx-status-color: var(--hmx-color-danger); }
:where(.hmx-note-success) { --hmx-status-color: var(--hmx-color-success); }
:where(.hmx-note-title) {
  margin-block: 0 var(--hmx-space-sm);
  font-weight: 650;
}`,
  card: `:where(.hmx-card) {
  border: var(--hmx-border);
  border-radius: var(--hmx-radius);
  padding: var(--hmx-space-lg);
  background: var(--hmx-color-surface);
  color: var(--hmx-color-text);
}
:where(.hmx-card-title) {
  margin-block: 0 var(--hmx-space-md);
  font-size: 1.125rem;
}`,
  grid: `:where(.hmx-grid) {
  display: grid;
  grid-template-columns: repeat(var(--hmx-grid-columns), minmax(0, 1fr));
  gap: calc(var(--hmx-grid-gap) * 0.25rem);
}
@media (max-width: 40rem) {
  :where(.hmx-grid) { grid-template-columns: minmax(0, 1fr); }
}`,
  metric: `:where(.hmx-metric) {
  border-block-start: 0.1875rem solid var(--hmx-color-info);
  border-radius: var(--hmx-radius);
  padding: var(--hmx-space-md);
  background: var(--hmx-color-surface);
  color: var(--hmx-color-text);
  font-size: 1.75rem;
  font-variant-numeric: tabular-nums;
}
:where(.hmx-metric-label) {
  margin-block: 0 var(--hmx-space-sm);
  color: var(--hmx-color-muted);
  font-size: 0.875rem;
}`,
  badge: `:where(.hmx-badge) {
  --hmx-status-color: var(--hmx-color-info);
  display: inline-flex;
  align-items: center;
  border: 0.0625rem solid var(--hmx-status-color);
  border-radius: 999rem;
  padding: 0.125rem var(--hmx-space-sm);
  color: var(--hmx-status-color);
  font-size: 0.8125rem;
  line-height: 1.25;
}
:where(.hmx-badge-warning) { --hmx-status-color: var(--hmx-color-warning); }
:where(.hmx-badge-danger) { --hmx-status-color: var(--hmx-color-danger); }
:where(.hmx-badge-success) { --hmx-status-color: var(--hmx-color-success); }`,
}

// Order is emission order, so a later rule can rely on winning a specificity tie. Every
// component with styles must appear here: this list, not COMPONENT_STYLES, decides what ships.
const COMPONENT_ORDER = [
  'note',
  'card',
  'grid',
  'metric',
  'badge',
  'form',
  'button',
  'input',
] as const

/** Returns design tokens and only the built-in rules selected by a document. */
export function builtinStylesFor(usedComponents: ReadonlySet<string>): string {
  const styles = COMPONENT_ORDER.flatMap((name) =>
    usedComponents.has(name) ? [COMPONENT_STYLES[name] ?? ''] : [],
  )
  return styles.length === 0 ? '' : [TOKENS, ...styles].join('\n')
}
