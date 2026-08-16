/** Event names accepted by HMX handler attributes. */
export const eventNames = [
  'click',
  'input',
  'change',
  'submit',
  'focus',
  'blur',
  'keydown',
] as const

/** Browser event name represented by one allowlisted HMX handler attribute. */
export type EventName = (typeof eventNames)[number]

const allowedAttributes = new Set(eventNames.map((name) => `on-${name}`))

/** Returns whether an attribute is one of the seven allowlisted event handlers. */
export function isAllowedEventAttribute(name: string): boolean {
  return allowedAttributes.has(name)
}
