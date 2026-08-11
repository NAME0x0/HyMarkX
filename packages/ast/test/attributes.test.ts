import { describe, expect, it } from 'vitest'
import {
  SYNTHETIC_SPAN,
  getAttribute,
  getAttributeValue,
  hasAttribute,
  isForbiddenAttributeName,
  toAttributeRecord,
} from '../src/index.js'
import type { Attribute } from '../src/index.js'

function attribute(name: string, value: string | null): Attribute {
  return {
    name,
    value,
    position: SYNTHETIC_SPAN,
    nameSpan: SYNTHETIC_SPAN,
  }
}

describe('attribute helpers', () => {
  it('uses the last occurrence of a duplicate name', () => {
    const first = attribute('tone', 'quiet')
    const last = attribute('tone', 'loud')
    const attributes = [first, attribute('other', 'value'), last]

    expect(getAttribute(attributes, 'tone')).toBe(last)
    expect(getAttributeValue(attributes, 'tone')).toBe('loud')
    expect(hasAttribute(attributes, 'tone')).toBe(true)
    expect(getAttribute(attributes, 'missing')).toBeUndefined()
    expect(getAttributeValue(attributes, 'missing')).toBeUndefined()
    expect(hasAttribute(attributes, 'missing')).toBe(false)
  })

  it('keeps bare and explicitly empty values distinct', () => {
    expect(getAttributeValue([attribute('disabled', null)], 'disabled')).toBeNull()
    expect(getAttributeValue([attribute('label', '')], 'label')).toBe('')
  })

  it('creates a null-prototype, last-wins record', () => {
    const record = toAttributeRecord([
      attribute('tone', 'quiet'),
      attribute('bare', null),
      attribute('tone', 'loud'),
    ])

    expect(Object.getPrototypeOf(record)).toBeNull()
    expect(record).toEqual({ tone: 'loud', bare: null })
  })

  it('skips forbidden names without polluting Object.prototype', () => {
    const record = toAttributeRecord([
      attribute('__proto__', 'polluted'),
      attribute('constructor', 'polluted'),
      attribute('prototype', 'polluted'),
      attribute('safe', 'value'),
    ])

    expect(Object.hasOwn(record, '__proto__')).toBe(false)
    expect(Object.hasOwn(record, 'constructor')).toBe(false)
    expect(Object.hasOwn(record, 'prototype')).toBe(false)
    expect(record.safe).toBe('value')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('matches forbidden names case-sensitively', () => {
    expect(isForbiddenAttributeName('__proto__')).toBe(true)
    expect(isForbiddenAttributeName('constructor')).toBe(true)
    expect(isForbiddenAttributeName('prototype')).toBe(true)
    expect(isForbiddenAttributeName('Constructor')).toBe(false)
    expect(isForbiddenAttributeName('__PROTO__')).toBe(false)
  })
})
