import type { Diagnostic } from '@hymarkx/ast'
import { describe, expect, it } from 'vitest'
import { renderDiagnostic, renderDiagnostics } from '../src/index.js'

const diagnostic: Diagnostic = {
  code: 'HMX1023',
  severity: 'error',
  message: 'expression was not closed',
  span: {
    start: { line: 1, column: 8, offset: 7 },
    end: { line: 1, column: 9, offset: 8 },
  },
  expected: '`}` before end of directive attributes',
}

describe('diagnostic rendering', () => {
  it('renders the documented heading, location, excerpt, and expectation', () => {
    const rendered = renderDiagnostic(diagnostic, ':::card{x', { from: 'dashboard.hmx' })

    expect(rendered).toContain('error[HMX1023]: expression was not closed')
    expect(rendered).toContain('┌─ dashboard.hmx:1:8')
    expect(rendered).toContain('1 │ :::card{x')
    expect(rendered).toContain('^ expected `}` before end of directive attributes')
    expect(rendered).not.toContain('\u001b[')
  })

  it('expands tabs, marks multiline continuation, and renders related spans', () => {
    const rendered = renderDiagnostic(
      {
        ...diagnostic,
        span: {
          start: { line: 1, column: 2, offset: 1 },
          end: { line: 2, column: 3, offset: 7 },
        },
        related: [
          {
            message: 'opened here',
            span: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: 2, offset: 1 },
            },
          },
        ],
      },
      '\tfoo\nbar',
    )

    expect(rendered).toContain('1 │     foo')
    expect(rendered).toContain('~')
    expect(rendered).toContain('note: opened here')
  })

  it('handles spans past end-of-file and emits color only when requested', () => {
    const pastEnd = {
      ...diagnostic,
      span: {
        start: { line: 99, column: 8, offset: 999 },
        end: { line: 99, column: 9, offset: 1000 },
      },
    }

    expect(() => renderDiagnostic(pastEnd, 'short')).not.toThrow()
    expect(renderDiagnostic(pastEnd, 'short')).toContain('99 │ ')
    expect(renderDiagnostic(diagnostic, 'source', { color: true })).toContain('\u001b[')
  })

  it('renders suggestions and multiple diagnostics in order', () => {
    const withSuggestion: Diagnostic = {
      ...diagnostic,
      suggestion: {
        message: 'close the directive',
        replacement: ':::card{x}',
        span: diagnostic.span,
      },
    }
    const rendered = renderDiagnostics([withSuggestion, { ...diagnostic, code: 'HMX1024' }], 'x')

    expect(rendered).toContain('help: :::card{x}')
    expect(rendered.indexOf('HMX1023')).toBeLessThan(rendered.indexOf('HMX1024'))
  })
})
