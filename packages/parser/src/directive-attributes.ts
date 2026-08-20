import { factorySpace } from 'micromark-factory-space'
import { factoryWhitespace } from 'micromark-factory-whitespace'
import {
  markdownLineEnding,
  markdownLineEndingOrSpace,
  markdownSpace,
  unicodePunctuation,
  unicodeWhitespace,
} from 'micromark-util-character'
import type { Construct, State, TokenType } from 'micromark-util-types'

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    directiveContainerAttributeIdMarker: 'directiveContainerAttributeIdMarker'
    directiveContainerAttributeClassMarker: 'directiveContainerAttributeClassMarker'
    directiveLeafAttributeIdMarker: 'directiveLeafAttributeIdMarker'
    directiveLeafAttributeClassMarker: 'directiveLeafAttributeClassMarker'
    directiveTextAttributeIdMarker: 'directiveTextAttributeIdMarker'
    directiveTextAttributeClassMarker: 'directiveTextAttributeClassMarker'
  }
}

interface AttributeTokenTypes {
  readonly attributes: TokenType
  readonly attributesMarker: TokenType
  readonly attribute: TokenType
  readonly id: TokenType
  readonly idMarker: TokenType
  readonly idValue: TokenType
  readonly className: TokenType
  readonly classMarker: TokenType
  readonly classValue: TokenType
  readonly name: TokenType
  readonly initializer: TokenType
  readonly literal: TokenType
  readonly value: TokenType
  readonly valueMarker: TokenType
  readonly valueData: TokenType
}

/**
 * Creates the upstream directive-attribute state machine with one extension: an unquoted
 * value beginning with `{` is balanced through its matching `}` so expression-valued
 * attributes do not terminate the surrounding attribute list early.
 */
export function directiveAttributes(types: AttributeTokenTypes, disallowEol: boolean): Construct {
  return {
    partial: true,
    tokenize(effects, ok, nok) {
      let type: TokenType
      let shortcutMarker: TokenType
      let shortcutValue: TokenType
      let marker: number | undefined
      let expressionDepth = 0
      let expressionQuote: 34 | 39 | undefined
      let expressionEscaped = false

      const start: State = (code) => {
        effects.enter(types.attributes)
        effects.enter(types.attributesMarker)
        effects.consume(code)
        effects.exit(types.attributesMarker)
        return between
      }

      const between: State = (code) => {
        if (code === 35) {
          type = types.id
          shortcutMarker = types.idMarker
          shortcutValue = types.idValue
          return shortcutStart(code)
        }
        if (code === 46) {
          type = types.className
          shortcutMarker = types.classMarker
          shortcutValue = types.classValue
          return shortcutStart(code)
        }
        if (disallowEol && markdownSpace(code)) {
          return factorySpace(effects, between, 'whitespace')(code)
        }
        if (!disallowEol && markdownLineEndingOrSpace(code)) {
          return factoryWhitespace(effects, between)(code)
        }
        if (
          code === null ||
          markdownLineEnding(code) ||
          unicodeWhitespace(code) ||
          (unicodePunctuation(code) && code !== 45 && code !== 95)
        ) {
          return end(code)
        }
        effects.enter(types.attribute)
        effects.enter(types.name)
        effects.consume(code)
        return name
      }

      const shortcutStart: State = (code) => {
        effects.enter(types.attribute)
        effects.enter(type)
        effects.enter(shortcutMarker)
        effects.consume(code)
        effects.exit(shortcutMarker)
        return shortcutStartAfter
      }

      const shortcutStartAfter: State = (code) => {
        if (
          code === null ||
          code === 34 ||
          code === 35 ||
          code === 39 ||
          code === 46 ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96 ||
          code === 125 ||
          markdownLineEndingOrSpace(code)
        ) {
          return nok(code)
        }
        effects.enter(shortcutValue)
        effects.consume(code)
        return shortcut
      }

      const shortcut: State = (code) => {
        if (
          code === null ||
          code === 34 ||
          code === 39 ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96
        ) {
          return nok(code)
        }
        if (code === 35 || code === 46 || code === 125 || markdownLineEndingOrSpace(code)) {
          effects.exit(shortcutValue)
          effects.exit(type)
          effects.exit(types.attribute)
          return between(code)
        }
        effects.consume(code)
        return shortcut
      }

      const name: State = (code) => {
        if (
          code === null ||
          markdownLineEnding(code) ||
          unicodeWhitespace(code) ||
          (unicodePunctuation(code) && code !== 45 && code !== 46 && code !== 58 && code !== 95)
        ) {
          effects.exit(types.name)
          if (disallowEol && markdownSpace(code)) {
            return factorySpace(effects, nameAfter, 'whitespace')(code)
          }
          if (!disallowEol && markdownLineEndingOrSpace(code)) {
            return factoryWhitespace(effects, nameAfter)(code)
          }
          return nameAfter(code)
        }
        effects.consume(code)
        return name
      }

      const nameAfter: State = (code) => {
        if (code === 61) {
          effects.enter(types.initializer)
          effects.consume(code)
          effects.exit(types.initializer)
          return valueBefore
        }
        effects.exit(types.attribute)
        return between(code)
      }

      const valueBefore: State = (code) => {
        if (code === 123) {
          effects.enter(types.value)
          effects.enter(types.valueData)
          effects.consume(code)
          expressionDepth = 1
          expressionQuote = undefined
          expressionEscaped = false
          return valueExpression
        }
        if (
          code === null ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96 ||
          code === 125 ||
          (disallowEol && markdownLineEnding(code))
        ) {
          return nok(code)
        }
        if (code === 34 || code === 39) {
          effects.enter(types.literal)
          effects.enter(types.valueMarker)
          effects.consume(code)
          effects.exit(types.valueMarker)
          marker = code
          return valueQuotedStart
        }
        if (disallowEol && markdownSpace(code)) {
          return factorySpace(effects, valueBefore, 'whitespace')(code)
        }
        if (!disallowEol && markdownLineEndingOrSpace(code)) {
          return factoryWhitespace(effects, valueBefore)(code)
        }
        effects.enter(types.value)
        effects.enter(types.valueData)
        effects.consume(code)
        marker = undefined
        return valueUnquoted
      }

      const valueExpression: State = (code) => {
        if (code === null || (disallowEol && markdownLineEnding(code))) {
          return nok(code)
        }
        if (expressionQuote !== undefined) {
          effects.consume(code)
          if (expressionEscaped) {
            expressionEscaped = false
          } else if (code === 92) {
            expressionEscaped = true
          } else if (code === expressionQuote) {
            expressionQuote = undefined
          }
          return valueExpression
        }
        if (code === 34 || code === 39) {
          expressionQuote = code
          effects.consume(code)
          return valueExpression
        }
        if (code === 123) {
          expressionDepth += 1
          effects.consume(code)
          return valueExpression
        }
        if (code === 125) {
          expressionDepth -= 1
          effects.consume(code)
          if (expressionDepth === 0) {
            effects.exit(types.valueData)
            effects.exit(types.value)
            effects.exit(types.attribute)
            return between
          }
          return valueExpression
        }
        effects.consume(code)
        return valueExpression
      }

      const valueUnquoted: State = (code) => {
        if (
          code === null ||
          code === 34 ||
          code === 39 ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96
        ) {
          return nok(code)
        }
        if (code === 125 || markdownLineEndingOrSpace(code)) {
          effects.exit(types.valueData)
          effects.exit(types.value)
          effects.exit(types.attribute)
          return between(code)
        }
        effects.consume(code)
        return valueUnquoted
      }

      const valueQuotedStart: State = (code) => {
        if (code === marker) {
          effects.enter(types.valueMarker)
          effects.consume(code)
          effects.exit(types.valueMarker)
          effects.exit(types.literal)
          effects.exit(types.attribute)
          return valueQuotedAfter
        }
        effects.enter(types.value)
        return valueQuotedBetween(code)
      }

      const valueQuotedBetween: State = (code) => {
        if (code === marker) {
          effects.exit(types.value)
          return valueQuotedStart(code)
        }
        if (code === null) {
          return nok(code)
        }
        if (markdownLineEnding(code)) {
          return disallowEol ? nok(code) : factoryWhitespace(effects, valueQuotedBetween)(code)
        }
        effects.enter(types.valueData)
        effects.consume(code)
        return valueQuoted
      }

      const valueQuoted: State = (code) => {
        // ADR-0018: a backslash escapes a backslash, a double quote or a single quote, so an
        // escaped delimiter does not end the value. Anything else after a backslash stays
        // literal, which is what keeps a Windows path in an attribute working.
        if (code === 92) {
          effects.consume(code)
          return valueQuotedEscape
        }
        if (code === marker || code === null || markdownLineEnding(code)) {
          effects.exit(types.valueData)
          return valueQuotedBetween(code)
        }
        effects.consume(code)
        return valueQuoted
      }

      const valueQuotedEscape: State = (code) => {
        if (code === null || markdownLineEnding(code)) {
          // A backslash at the end of the line escapes nothing; fall back to the normal rules.
          effects.exit(types.valueData)
          return valueQuotedBetween(code)
        }
        effects.consume(code)
        return valueQuoted
      }

      const valueQuotedAfter: State = (code) =>
        code === 125 || markdownLineEndingOrSpace(code) ? between(code) : end(code)

      const end: State = (code) => {
        if (code === 125) {
          effects.enter(types.attributesMarker)
          effects.consume(code)
          effects.exit(types.attributesMarker)
          effects.exit(types.attributes)
          return ok
        }
        return nok(code)
      }

      return start
    },
  }
}

/** Produces token names matching micromark-extension-directive for one directive form. */
export function directiveAttributeTokenTypes(
  kind: 'containerDirective' | 'leafDirective' | 'textDirective',
): AttributeTokenTypes {
  const prefix =
    kind === 'containerDirective'
      ? 'directiveContainer'
      : kind === 'leafDirective'
        ? 'directiveLeaf'
        : 'directiveText'
  return {
    attributes: `${prefix}Attributes`,
    attributesMarker: `${prefix}AttributesMarker`,
    attribute: `${prefix}Attribute`,
    id: `${prefix}AttributeId`,
    idMarker: `${prefix}AttributeIdMarker`,
    idValue: `${prefix}AttributeIdValue`,
    className: `${prefix}AttributeClass`,
    classMarker: `${prefix}AttributeClassMarker`,
    classValue: `${prefix}AttributeClassValue`,
    name: `${prefix}AttributeName`,
    initializer: `${prefix}AttributeInitializerMarker`,
    literal: `${prefix}AttributeValueLiteral`,
    value: `${prefix}AttributeValue`,
    valueMarker: `${prefix}AttributeValueMarker`,
    valueData: `${prefix}AttributeValueData`,
  }
}
