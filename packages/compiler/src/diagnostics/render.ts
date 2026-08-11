import type { Diagnostic, Span } from '@hymarkx/ast'

/** Options controlling human-readable diagnostic rendering. */
export interface RenderDiagnosticOptions {
  /** Enables ANSI colors. Default: `false`. */
  readonly color?: boolean
  /** File name displayed in source-frame headers. Default: `'<anonymous>'`. */
  readonly from?: string
}

const ANSI_RESET = '\u001b[0m'
const ANSI_BOLD = '\u001b[1m'
const ANSI_RED = '\u001b[31m'
const ANSI_YELLOW = '\u001b[33m'
const ANSI_CYAN = '\u001b[36m'

function paint(value: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${value}${ANSI_RESET}` : value
}

function severityColor(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return ANSI_RED
    case 'warning':
      return ANSI_YELLOW
    case 'info':
      return ANSI_CYAN
  }
}

function expandTabs(value: string): string {
  let output = ''
  for (const character of value) {
    if (character === '\t') {
      const spaces = 4 - (output.length % 4)
      output += ' '.repeat(spaces)
    } else {
      output += character
    }
  }
  return output
}

function visualColumn(line: string, sourceColumn: number): number {
  return expandTabs(line.slice(0, Math.max(0, sourceColumn - 1))).length + 1
}

function normalizedLine(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1
}

function normalizedColumn(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1
}

function sourceFrame(
  span: Span,
  source: string,
  from: string,
  annotation: string,
  color: boolean,
  markerColor: string,
): string {
  const lines = source.split('\n')
  const startLine = normalizedLine(span.start.line)
  const requestedEnd = Math.max(startLine, normalizedLine(span.end.line))
  const maximumSourceLine = Math.max(1, lines.length)
  const endLine =
    startLine > maximumSourceLine ? startLine : Math.min(requestedEnd, maximumSourceLine)
  const gutterWidth = String(endLine).length
  const output = [`  ┌─ ${from}:${startLine}:${normalizedColumn(span.start.column)}`, '  │']

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    const rawLine = lines[lineNumber - 1] ?? ''
    const expandedLine = expandTabs(rawLine)
    const firstColumn = lineNumber === startLine ? normalizedColumn(span.start.column) : 1
    const visualStart = visualColumn(rawLine, firstColumn)
    const sourceEnd =
      lineNumber === requestedEnd ? normalizedColumn(span.end.column) : rawLine.length + 1
    const visualEnd = visualColumn(rawLine, sourceEnd)
    const markerLength = Math.max(1, visualEnd - visualStart)
    const marker = lineNumber === startLine ? '^' : '~'
    const suffix = lineNumber === startLine && annotation.length > 0 ? ` ${annotation}` : ''

    output.push(`${String(lineNumber).padStart(gutterWidth)} │ ${expandedLine}`)
    output.push(
      `${' '.repeat(gutterWidth)} │ ${' '.repeat(visualStart - 1)}${paint(
        marker.repeat(markerLength),
        markerColor,
        color,
      )}${suffix}`,
    )
  }

  output.push('  │')
  return output.join('\n')
}

/** Renders one diagnostic with source excerpts and optional ANSI color. */
export function renderDiagnostic(
  diagnostic: Diagnostic,
  source: string,
  options: RenderDiagnosticOptions = {},
): string {
  const color = options.color === true
  const from = options.from ?? '<anonymous>'
  const severity = paint(diagnostic.severity, severityColor(diagnostic.severity), color)
  const code = paint(`[${diagnostic.code}]`, ANSI_BOLD, color)
  const annotation = diagnostic.expected === undefined ? '' : `expected ${diagnostic.expected}`
  const output = [
    `${severity}${code}: ${diagnostic.message}`,
    sourceFrame(
      diagnostic.span,
      source,
      from,
      annotation,
      color,
      severityColor(diagnostic.severity),
    ),
  ]

  for (const related of diagnostic.related ?? []) {
    output.push(`note: ${related.message}`)
    output.push(sourceFrame(related.span, source, from, '', color, ANSI_CYAN))
  }
  if (diagnostic.suggestion !== undefined) {
    output.push(`help: ${diagnostic.suggestion.replacement}`)
  }
  if (diagnostic.url !== undefined) {
    output.push(`docs: ${diagnostic.url}`)
  }

  return output.join('\n')
}

/** Renders diagnostics in input order separated by a blank line. */
export function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  source: string,
  options: RenderDiagnosticOptions = {},
): string {
  return diagnostics.map((diagnostic) => renderDiagnostic(diagnostic, source, options)).join('\n\n')
}
