import type { Attribute, AttributeList } from './types.js'

/** Returns the last attribute with the requested name. */
export function getAttribute(list: AttributeList, name: string): Attribute | undefined {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const attribute = list[index]
    if (attribute?.name === name) {
      return attribute
    }
  }

  return undefined
}

/** Returns the last matching attribute's value while preserving bare attributes as `null`. */
export function getAttributeValue(list: AttributeList, name: string): string | null | undefined {
  return getAttribute(list, name)?.value
}

/** Reports whether an attribute name occurs at least once. */
export function hasAttribute(list: AttributeList, name: string): boolean {
  return getAttribute(list, name) !== undefined
}

/** Reports whether a name could target JavaScript object prototype machinery. */
export function isForbiddenAttributeName(name: string): boolean {
  return name === '__proto__' || name === 'constructor' || name === 'prototype'
}

/** Converts attributes to a null-prototype record, with last occurrence winning. */
export function toAttributeRecord(list: AttributeList): Record<string, string | null> {
  const record = Object.create(null) as Record<string, string | null>

  for (const attribute of list) {
    if (!isForbiddenAttributeName(attribute.name)) {
      record[attribute.name] = attribute.value
    }
  }

  return record
}
