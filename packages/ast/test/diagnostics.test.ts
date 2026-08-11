import { describe, expect, it } from 'vitest'
import { SYNTHETIC_SPAN, createDiagnostic, hasErrors } from '../src/index.js'
import type { Diagnostic } from '../src/index.js'

function diagnostic(code: string, severity: Diagnostic['severity'] = 'error'): Diagnostic {
  return {
    code,
    severity,
    message: 'Example diagnostic',
    span: SYNTHETIC_SPAN,
  }
}

describe('diagnostics', () => {
  it.each(['HMX0001', 'hmx1001', 'HMX10001', 'HMX1001\n', ''])(
    'rejects malformed code %j',
    (code) => {
      expect(() => createDiagnostic(diagnostic(code))).toThrow(TypeError)
    },
  )

  it.each(['HMX1001', 'HMX1999', 'HMX2000', 'HMX3999', 'HMX4000', 'HMX5999'])(
    'accepts valid code %s',
    (code) => {
      const value = diagnostic(code)
      expect(createDiagnostic(value)).toBe(value)
    },
  )

  it('reports whether a diagnostic list contains an error', () => {
    expect(hasErrors([])).toBe(false)
    expect(hasErrors([diagnostic('HMX1001', 'warning'), diagnostic('HMX1002', 'info')])).toBe(false)
    expect(hasErrors([diagnostic('HMX1001', 'warning'), diagnostic('HMX1002')])).toBe(true)
  })
})
