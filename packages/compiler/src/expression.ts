import { createDiagnostic, isForbiddenAttributeName } from '@hymarkx/ast'
import type { Diagnostic, Point, Span } from '@hymarkx/ast'
import { nearestSuggestion } from './suggestions.js'
import type { FrontmatterValue } from './types.js'

/** A value that can be produced by the restricted expression evaluator. */
export type ExpressionValue =
  | string
  | number
  | boolean
  | null
  | readonly ExpressionValue[]
  | { readonly [key: string]: ExpressionValue }

/** Source context used to turn expression-relative offsets into document spans. */
export interface ExpressionSourceContext {
  readonly documentSource: string
  readonly startOffset: number
  /** Names considered for HMX2040 suggestions when scope contains only resolved values. */
  readonly identifierNames?: readonly string[]
}

/** Total result of parsing and evaluating one restricted expression. */
export type ExpressionEvaluation =
  | { readonly ok: true; readonly value: ExpressionValue; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly [Diagnostic] }

type ExpressionDiagnosticCode =
  'HMX1021' | 'HMX1022' | 'HMX2040' | 'HMX2041' | 'HMX2042' | 'HMX2043' | 'HMX2044'

interface ExpressionIssue {
  readonly code: ExpressionDiagnosticCode
  readonly message: string
  readonly start: number
  readonly end: number
  readonly replacement?: string
}

type PrimitiveValue = string | number | boolean | null

interface Token {
  readonly kind: 'literal' | 'identifier' | 'keyword' | 'operator' | 'punctuation' | 'eof'
  readonly value: string
  readonly start: number
  readonly end: number
  readonly literal?: PrimitiveValue
}

interface LiteralExpression {
  readonly type: 'literal'
  readonly value: PrimitiveValue
  readonly start: number
  readonly end: number
}

interface IdentifierExpression {
  readonly type: 'identifier'
  readonly name: string
  readonly start: number
  readonly end: number
}

interface UnaryExpression {
  readonly type: 'unary'
  readonly operator: '!' | '-' | '+'
  readonly argument: Expression
  readonly start: number
  readonly end: number
}

interface BinaryExpression {
  readonly type: 'binary'
  readonly operator:
    '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '??'
  readonly left: Expression
  readonly right: Expression
  readonly operatorStart: number
  readonly start: number
  readonly end: number
}

interface ConditionalExpression {
  readonly type: 'conditional'
  readonly test: Expression
  readonly consequent: Expression
  readonly alternate: Expression
  readonly start: number
  readonly end: number
}

interface MemberExpression {
  readonly type: 'member'
  readonly object: Expression
  readonly property: string | Expression
  readonly computed: boolean
  readonly optional: boolean
  readonly propertyStart: number
  readonly propertyEnd: number
  readonly start: number
  readonly end: number
}

interface ArrayExpression {
  readonly type: 'array'
  readonly elements: readonly Expression[]
  readonly start: number
  readonly end: number
}

interface ObjectProperty {
  readonly key: string
  readonly value: Expression
}

interface ObjectExpression {
  readonly type: 'object'
  readonly properties: readonly ObjectProperty[]
  readonly start: number
  readonly end: number
}

interface GroupExpression {
  readonly type: 'group'
  readonly expression: Expression
  readonly start: number
  readonly end: number
}

type Expression =
  | LiteralExpression
  | IdentifierExpression
  | UnaryExpression
  | BinaryExpression
  | ConditionalExpression
  | MemberExpression
  | ArrayExpression
  | ObjectExpression
  | GroupExpression

const MAX_EXPRESSION_DEPTH = 128
const OPTIONAL_MISSING: unique symbol = Symbol('optional-missing')
const BINARY_PRECEDENCE = new Map<BinaryExpression['operator'], number>([
  ['??', 1],
  ['||', 1],
  ['&&', 2],
  ['==', 3],
  ['!=', 3],
  ['<', 4],
  ['<=', 4],
  ['>', 4],
  ['>=', 4],
  ['+', 5],
  ['-', 5],
  ['*', 6],
  ['/', 6],
  ['%', 6],
])
const ASSIGNMENT_OPERATORS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&&=', '||=', '??='])
const KEYWORDS = new Set(['new', 'function', 'this', 'import', 'await', 'yield'])
const THREE_CHARACTER_OPERATORS = new Set(['===', '!==', '&&=', '||=', '??=', '...'])
const TWO_CHARACTER_OPERATORS = new Set([
  '?.',
  '??',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '=>',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**',
])
const SINGLE_OPERATORS = new Set(['+', '-', '*', '/', '%', '<', '>', '!', '='])
const PUNCTUATION = new Set(['(', ')', '[', ']', '{', '}', '?', ':', '.', ',', '`'])

class ExpressionFailure extends Error {
  readonly issue: ExpressionIssue

  constructor(issue: ExpressionIssue) {
    super(issue.message)
    this.issue = issue
  }
}

function failure(
  code: ExpressionDiagnosticCode,
  message: string,
  start: number,
  end: number,
  replacement?: string,
): never {
  throw new ExpressionFailure({
    code,
    message,
    start,
    end: Math.max(start, end),
    ...(replacement === undefined ? {} : { replacement }),
  })
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

function isHexDigit(character: string | undefined): boolean {
  return (
    isDigit(character) ||
    (character !== undefined && character.toLowerCase() >= 'a' && character.toLowerCase() <= 'f')
  )
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= 'A' && character <= 'Z') ||
      (character >= 'a' && character <= 'z') ||
      character === '_' ||
      character === '$')
  )
}

function isIdentifierContinue(character: string | undefined): boolean {
  return isIdentifierStart(character) || isDigit(character)
}

function readFixedHex(source: string, start: number, length: number): number {
  const end = start + length
  if (end > source.length) {
    failure('HMX1022', 'Unicode escape is incomplete.', start, source.length)
  }
  for (let index = start; index < end; index += 1) {
    if (!isHexDigit(source[index])) {
      failure('HMX1022', 'Unicode escape contains a non-hexadecimal digit.', index, index + 1)
    }
  }
  return Number.parseInt(source.slice(start, end), 16)
}

function readString(
  source: string,
  start: number,
): { readonly token: Token; readonly end: number } {
  const quote = source[start]
  let cursor = start + 1
  let value = ''

  while (cursor < source.length) {
    const character = source[cursor]
    if (character === quote) {
      return {
        token: {
          kind: 'literal',
          value: source.slice(start, cursor + 1),
          literal: value,
          start,
          end: cursor + 1,
        },
        end: cursor + 1,
      }
    }
    if (
      character === '\n' ||
      character === '\r' ||
      character === '\u2028' ||
      character === '\u2029'
    ) {
      failure('HMX1022', 'String literals cannot contain a line break.', cursor, cursor + 1)
    }
    if (character !== '\\') {
      value += character
      cursor += 1
      continue
    }

    const escapeStart = cursor
    const escaped = source[cursor + 1]
    if (escaped === undefined) {
      failure('HMX1022', 'String escape is not terminated.', escapeStart, cursor + 1)
    }
    const simpleEscapes: Readonly<Record<string, string>> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '0': '\0',
      '\\': '\\',
      "'": "'",
      '"': '"',
    }
    const decodedEscape = simpleEscapes[escaped]
    if (decodedEscape !== undefined) {
      if (escaped === '0' && isDigit(source[cursor + 2])) {
        failure(
          'HMX1022',
          'Legacy octal string escapes are not supported.',
          escapeStart,
          cursor + 2,
        )
      }
      value += decodedEscape
      cursor += 2
      continue
    }
    if (escaped === 'x') {
      value += String.fromCharCode(readFixedHex(source, cursor + 2, 2))
      cursor += 4
      continue
    }
    if (escaped === 'u') {
      if (source[cursor + 2] === '{') {
        const closing = source.indexOf('}', cursor + 3)
        if (closing < 0) {
          failure(
            'HMX1022',
            'Unicode code-point escape is not terminated.',
            escapeStart,
            source.length,
          )
        }
        const digits = source.slice(cursor + 3, closing)
        if (
          digits.length === 0 ||
          digits.length > 6 ||
          [...digits].some((digit) => !isHexDigit(digit))
        ) {
          failure('HMX1022', 'Unicode code-point escape is invalid.', escapeStart, closing + 1)
        }
        const codePoint = Number.parseInt(digits, 16)
        if (codePoint > 0x10ffff) {
          failure('HMX1022', 'Unicode code point is out of range.', escapeStart, closing + 1)
        }
        value += String.fromCodePoint(codePoint)
        cursor = closing + 1
        continue
      }
      value += String.fromCharCode(readFixedHex(source, cursor + 2, 4))
      cursor += 6
      continue
    }
    failure('HMX1022', `Unsupported string escape \\${escaped}.`, escapeStart, cursor + 2)
  }

  failure('HMX1022', 'String literal is not terminated.', start, source.length)
}

function readNumber(
  source: string,
  start: number,
): { readonly token: Token; readonly end: number } {
  let cursor = start
  if (source[cursor] === '.') {
    cursor += 1
  }
  while (isDigit(source[cursor])) {
    cursor += 1
  }
  if (source[cursor] === '.' && source[start] !== '.') {
    cursor += 1
    while (isDigit(source[cursor])) {
      cursor += 1
    }
  }
  if (source[cursor] === 'e' || source[cursor] === 'E') {
    const exponentStart = cursor
    cursor += 1
    if (source[cursor] === '+' || source[cursor] === '-') {
      cursor += 1
    }
    const digitsStart = cursor
    while (isDigit(source[cursor])) {
      cursor += 1
    }
    if (cursor === digitsStart) {
      failure('HMX1022', 'Numeric exponent requires at least one digit.', exponentStart, cursor)
    }
  }
  if (isIdentifierStart(source[cursor])) {
    failure('HMX1022', 'Numeric literal has an invalid suffix.', cursor, cursor + 1)
  }

  const raw = source.slice(start, cursor)
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    failure('HMX2042', 'Numeric result must be finite.', start, cursor)
  }
  return {
    token: { kind: 'literal', value: raw, literal: value, start, end: cursor },
    end: cursor,
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0

  while (cursor < source.length) {
    const character = source[cursor]
    if (character === ' ' || character === '\t' || character === '\n' || character === '\r') {
      cursor += 1
      continue
    }
    if (character === '"' || character === "'") {
      const result = readString(source, cursor)
      tokens.push(result.token)
      cursor = result.end
      continue
    }
    if (isDigit(character) || (character === '.' && isDigit(source[cursor + 1]))) {
      const result = readNumber(source, cursor)
      tokens.push(result.token)
      cursor = result.end
      continue
    }
    if (isIdentifierStart(character)) {
      const start = cursor
      cursor += 1
      while (isIdentifierContinue(source[cursor])) {
        cursor += 1
      }
      const value = source.slice(start, cursor)
      if (value === 'true' || value === 'false' || value === 'null') {
        tokens.push({
          kind: 'literal',
          value,
          literal: value === 'true' ? true : value === 'false' ? false : null,
          start,
          end: cursor,
        })
      } else {
        tokens.push({
          kind: KEYWORDS.has(value) ? 'keyword' : 'identifier',
          value,
          start,
          end: cursor,
        })
      }
      continue
    }

    const three = source.slice(cursor, cursor + 3)
    if (THREE_CHARACTER_OPERATORS.has(three)) {
      tokens.push({ kind: 'operator', value: three, start: cursor, end: cursor + 3 })
      cursor += 3
      continue
    }
    const two = source.slice(cursor, cursor + 2)
    if (TWO_CHARACTER_OPERATORS.has(two)) {
      tokens.push({ kind: 'operator', value: two, start: cursor, end: cursor + 2 })
      cursor += 2
      continue
    }
    if (character !== undefined && SINGLE_OPERATORS.has(character)) {
      tokens.push({ kind: 'operator', value: character, start: cursor, end: cursor + 1 })
      cursor += 1
      continue
    }
    if (character !== undefined && PUNCTUATION.has(character)) {
      tokens.push({ kind: 'punctuation', value: character, start: cursor, end: cursor + 1 })
      cursor += 1
      continue
    }
    failure(
      'HMX1022',
      `Unexpected character ${JSON.stringify(character)} in expression.`,
      cursor,
      cursor + 1,
    )
  }

  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length })
  return tokens
}

function binaryOperator(token: Token): BinaryExpression['operator'] | undefined {
  return BINARY_PRECEDENCE.has(token.value as BinaryExpression['operator'])
    ? (token.value as BinaryExpression['operator'])
    : undefined
}

function logicalFamily(expression: Expression): 'logical' | 'nullish' | undefined {
  if (expression.type !== 'binary') {
    return undefined
  }
  if (expression.operator === '??') {
    return 'nullish'
  }
  return expression.operator === '&&' || expression.operator === '||' ? 'logical' : undefined
}

class Parser {
  readonly #tokens: readonly Token[]
  #cursor = 0
  #nesting = 0

  constructor(tokens: readonly Token[]) {
    this.#tokens = tokens
  }

  current(): Token {
    return this.#tokens[this.#cursor] ?? this.#tokens[this.#tokens.length - 1]!
  }

  peek(distance = 1): Token {
    return this.#tokens[this.#cursor + distance] ?? this.#tokens[this.#tokens.length - 1]!
  }

  consume(): Token {
    const token = this.current()
    this.#cursor += 1
    return token
  }

  matches(value: string): boolean {
    return this.current().value === value
  }

  expect(value: string, message: string): Token {
    const token = this.current()
    if (token.value !== value) {
      failure('HMX1022', message, token.start, token.end)
    }
    return this.consume()
  }

  nested<T>(token: Token, parse: () => T): T {
    this.#nesting += 1
    if (this.#nesting > MAX_EXPRESSION_DEPTH) {
      failure('HMX1021', 'Expression nesting is too deep.', token.start, token.end)
    }
    try {
      return parse()
    } finally {
      this.#nesting -= 1
    }
  }

  parse(): Expression {
    const expression = this.parseConditional()
    const trailing = this.current()
    if (trailing.kind !== 'eof') {
      this.rejectTrailing(trailing)
    }
    this.assertDepth(expression)
    return expression
  }

  rejectTrailing(token: Token): never {
    if (ASSIGNMENT_OPERATORS.has(token.value)) {
      failure('HMX2044', 'Assignment is not allowed in expressions.', token.start, token.end)
    }
    if (token.value === '++' || token.value === '--') {
      failure('HMX2044', 'Increment and decrement are not allowed.', token.start, token.end)
    }
    if (token.value === '=>') {
      failure('HMX2044', 'Arrow function literals are not allowed.', token.start, token.end)
    }
    if (token.value === ',') {
      failure('HMX2044', 'The comma operator is not allowed.', token.start, token.end)
    }
    if (token.value === '(' || token.value === '?.') {
      failure('HMX2044', 'Function calls are not allowed.', token.start, token.end)
    }
    if (token.value === '`') {
      failure('HMX2044', 'Tagged templates are not allowed.', token.start, token.end)
    }
    failure('HMX1022', `Unexpected token ${JSON.stringify(token.value)}.`, token.start, token.end)
  }

  parseConditional(): Expression {
    const test = this.parseBinary(1)
    if (!this.matches('?')) {
      return test
    }
    const question = this.consume()
    return this.nested(question, () => {
      const consequent = this.parseConditional()
      this.expect(':', 'Ternary expression requires a colon.')
      const alternate = this.parseConditional()
      return {
        type: 'conditional',
        test,
        consequent,
        alternate,
        start: test.start,
        end: alternate.end,
      }
    })
  }

  parseBinary(minimumPrecedence: number): Expression {
    let left = this.parseUnary()
    while (true) {
      const token = this.current()
      const operator = binaryOperator(token)
      const precedence = operator === undefined ? undefined : BINARY_PRECEDENCE.get(operator)
      if (operator === undefined || precedence === undefined || precedence < minimumPrecedence) {
        return left
      }
      this.consume()
      const right = this.parseBinary(precedence + 1)
      const family =
        operator === '??'
          ? 'nullish'
          : operator === '&&' || operator === '||'
            ? 'logical'
            : undefined
      if (
        family !== undefined &&
        [logicalFamily(left), logicalFamily(right)].some(
          (childFamily) => childFamily !== undefined && childFamily !== family,
        )
      ) {
        failure(
          'HMX1022',
          'Nullish coalescing cannot be mixed with && or || without parentheses.',
          token.start,
          token.end,
        )
      }
      left = {
        type: 'binary',
        operator,
        left,
        right,
        operatorStart: token.start,
        start: left.start,
        end: right.end,
      }
    }
  }

  parseUnary(): Expression {
    const token = this.current()
    if (token.value === '!' || token.value === '-' || token.value === '+') {
      this.consume()
      return this.nested(token, () => {
        const argument = this.parseUnary()
        return {
          type: 'unary',
          operator: token.value as UnaryExpression['operator'],
          argument,
          start: token.start,
          end: argument.end,
        }
      })
    }
    return this.parsePostfix(this.parsePrimary())
  }

  parsePostfix(initial: Expression): Expression {
    let expression = initial
    while (true) {
      const token = this.current()
      if (token.value === '(' || (token.value === '?.' && this.peek().value === '(')) {
        failure('HMX2044', 'Function calls are not allowed.', token.start, token.end)
      }
      if (token.value === '`') {
        failure('HMX2044', 'Tagged templates are not allowed.', token.start, token.end)
      }
      if (token.value === '.' || token.value === '?.') {
        const optional = token.value === '?.'
        this.consume()
        if (this.matches('[')) {
          this.consume()
          const property = this.nested(token, () => this.parseConditional())
          const closing = this.expect(']', 'Computed member access requires a closing bracket.')
          expression = {
            type: 'member',
            object: expression,
            property,
            computed: true,
            optional,
            propertyStart: property.start,
            propertyEnd: property.end,
            start: expression.start,
            end: closing.end,
          }
          continue
        }
        const property = this.current()
        if (
          property.kind !== 'identifier' &&
          property.kind !== 'keyword' &&
          property.kind !== 'literal'
        ) {
          failure(
            'HMX1022',
            'Member access requires a property name.',
            property.start,
            property.end,
          )
        }
        if (
          property.kind === 'literal' &&
          typeof property.literal !== 'boolean' &&
          property.literal !== null
        ) {
          failure(
            'HMX1022',
            'Member access requires an identifier-style property name.',
            property.start,
            property.end,
          )
        }
        this.consume()
        expression = {
          type: 'member',
          object: expression,
          property: property.value,
          computed: false,
          optional,
          propertyStart: property.start,
          propertyEnd: property.end,
          start: expression.start,
          end: property.end,
        }
        continue
      }
      if (token.value === '[') {
        this.consume()
        const property = this.nested(token, () => this.parseConditional())
        const closing = this.expect(']', 'Computed member access requires a closing bracket.')
        expression = {
          type: 'member',
          object: expression,
          property,
          computed: true,
          optional: false,
          propertyStart: property.start,
          propertyEnd: property.end,
          start: expression.start,
          end: closing.end,
        }
        continue
      }
      return expression
    }
  }

  parsePrimary(): Expression {
    const token = this.consume()
    if (token.kind === 'literal') {
      return { type: 'literal', value: token.literal!, start: token.start, end: token.end }
    }
    if (token.kind === 'identifier') {
      return { type: 'identifier', name: token.value, start: token.start, end: token.end }
    }
    if (token.kind === 'keyword') {
      const messages: Readonly<Record<string, string>> = {
        new: 'new expressions are not allowed.',
        function:
          this.current().value === '*'
            ? 'Generator literals are not allowed.'
            : 'Function literals are not allowed.',
        this: 'this is not available in expressions.',
        import: 'import expressions are not allowed.',
        await: 'await expressions are not allowed.',
        yield: 'Generators are not allowed.',
      }
      failure(
        'HMX2044',
        messages[token.value] ?? 'This construct is not allowed.',
        token.start,
        token.end,
      )
    }
    if (token.value === '`') {
      failure('HMX2044', 'Template literals are not allowed.', token.start, token.end)
    }
    if (token.value === '/') {
      failure('HMX2044', 'Regular expression literals are not allowed.', token.start, token.end)
    }
    if (token.value === '++' || token.value === '--') {
      failure('HMX2044', 'Increment and decrement are not allowed.', token.start, token.end)
    }
    if (token.value === '(') {
      if (this.matches(')') && this.peek().value === '=>') {
        const arrow = this.peek()
        failure('HMX2044', 'Arrow function literals are not allowed.', arrow.start, arrow.end)
      }
      return this.nested(token, () => {
        const expression = this.parseConditional()
        if (this.matches(',')) {
          const comma = this.current()
          failure('HMX2044', 'The comma operator is not allowed.', comma.start, comma.end)
        }
        const closing = this.expect(')', 'Parenthesized expression requires a closing parenthesis.')
        return { type: 'group', expression, start: token.start, end: closing.end }
      })
    }
    if (token.value === '[') {
      return this.parseArray(token)
    }
    if (token.value === '{') {
      return this.parseObject(token)
    }
    if (token.kind === 'eof') {
      failure('HMX1022', 'Expected an expression.', token.start, token.end)
    }
    this.rejectTrailing(token)
  }

  parseArray(opening: Token): ArrayExpression {
    return this.nested(opening, () => {
      const elements: Expression[] = []
      if (this.matches(']')) {
        const closing = this.consume()
        return { type: 'array', elements, start: opening.start, end: closing.end }
      }
      while (true) {
        if (this.matches(',')) {
          const comma = this.current()
          failure('HMX1022', 'Array holes are not supported.', comma.start, comma.end)
        }
        elements.push(this.parseConditional())
        if (!this.matches(',')) {
          const closing = this.expect(']', 'Array literal requires a closing bracket.')
          return { type: 'array', elements, start: opening.start, end: closing.end }
        }
        this.consume()
        if (this.matches(']')) {
          const closing = this.consume()
          return { type: 'array', elements, start: opening.start, end: closing.end }
        }
      }
    })
  }

  parseObject(opening: Token): ObjectExpression {
    return this.nested(opening, () => {
      const properties: ObjectProperty[] = []
      if (this.matches('}')) {
        const closing = this.consume()
        return { type: 'object', properties, start: opening.start, end: closing.end }
      }
      while (true) {
        const keyToken = this.consume()
        let key: string
        if (keyToken.kind === 'identifier' || keyToken.kind === 'keyword') {
          key = keyToken.value
        } else if (
          keyToken.kind === 'literal' &&
          (typeof keyToken.literal === 'string' || typeof keyToken.literal === 'number')
        ) {
          key = String(keyToken.literal)
        } else {
          failure(
            'HMX1022',
            'Object literal requires a static property name.',
            keyToken.start,
            keyToken.end,
          )
        }

        let value: Expression
        if (this.matches(':')) {
          this.consume()
          value = this.parseConditional()
        } else if (keyToken.kind === 'identifier') {
          value = { type: 'identifier', name: key, start: keyToken.start, end: keyToken.end }
        } else {
          failure(
            'HMX1022',
            'Object property requires a colon and value.',
            keyToken.start,
            keyToken.end,
          )
        }
        properties.push({ key, value })

        if (!this.matches(',')) {
          const closing = this.expect('}', 'Object literal requires a closing brace.')
          return { type: 'object', properties, start: opening.start, end: closing.end }
        }
        this.consume()
        if (this.matches('}')) {
          const closing = this.consume()
          return { type: 'object', properties, start: opening.start, end: closing.end }
        }
      }
    })
  }

  assertDepth(expression: Expression): void {
    const stack: Array<{ readonly expression: Expression; readonly depth: number }> = [
      { expression, depth: 1 },
    ]
    while (stack.length > 0) {
      const frame = stack.pop()
      if (frame === undefined) {
        continue
      }
      if (frame.depth > MAX_EXPRESSION_DEPTH) {
        failure(
          'HMX1021',
          'Expression nesting is too deep.',
          frame.expression.start,
          Math.min(frame.expression.start + 1, frame.expression.end),
        )
      }
      const nextDepth = frame.depth + 1
      const node = frame.expression
      if (node.type === 'unary') {
        stack.push({ expression: node.argument, depth: nextDepth })
      } else if (node.type === 'binary') {
        stack.push(
          { expression: node.left, depth: nextDepth },
          { expression: node.right, depth: nextDepth },
        )
      } else if (node.type === 'conditional') {
        stack.push(
          { expression: node.test, depth: nextDepth },
          { expression: node.consequent, depth: nextDepth },
          { expression: node.alternate, depth: nextDepth },
        )
      } else if (node.type === 'member') {
        stack.push({ expression: node.object, depth: nextDepth })
        if (node.computed) {
          stack.push({ expression: node.property as Expression, depth: nextDepth })
        }
      } else if (node.type === 'array') {
        for (const element of node.elements) {
          stack.push({ expression: element, depth: nextDepth })
        }
      } else if (node.type === 'object') {
        for (const property of node.properties) {
          stack.push({ expression: property.value, depth: nextDepth })
        }
      } else if (node.type === 'group') {
        stack.push({ expression: node.expression, depth: nextDepth })
      }
    }
  }
}

function isStructured(value: ExpressionValue): value is Exclude<ExpressionValue, PrimitiveValue> {
  return typeof value === 'object' && value !== null
}

function scalarString(value: PrimitiveValue): string {
  if (value === null) {
    return 'null'
  }
  return String(value)
}

class Evaluator {
  readonly #scope: FrontmatterValue
  readonly #identifierNames: readonly string[]

  constructor(scope: FrontmatterValue, identifierNames: readonly string[]) {
    this.#scope = scope
    this.#identifierNames = identifierNames
  }

  evaluate(expression: Expression): ExpressionValue {
    const value = this.evaluateNode(expression)
    return value === OPTIONAL_MISSING ? null : value
  }

  safeValue(value: unknown, expression: Expression): ExpressionValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        failure('HMX2042', 'Numeric result must be finite.', expression.start, expression.end)
      }
      return value
    }
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return value as ExpressionValue
    }
    failure(
      'HMX2044',
      typeof value === 'function'
        ? 'Function values are not allowed.'
        : 'This value is not available to expressions.',
      expression.start,
      expression.end,
    )
  }

  value(expression: Expression): ExpressionValue {
    const value = this.evaluateNode(expression)
    return value === OPTIONAL_MISSING ? null : value
  }

  evaluateNode(expression: Expression): ExpressionValue | typeof OPTIONAL_MISSING {
    switch (expression.type) {
      case 'literal':
        return expression.value
      case 'identifier': {
        if (!Object.hasOwn(this.#scope, expression.name)) {
          const replacement = nearestSuggestion(
            expression.name,
            this.#identifierNames.filter((name) => name !== expression.name),
          )
          failure(
            'HMX2040',
            replacement === undefined
              ? `Unknown identifier "${expression.name}".`
              : `Unknown identifier "${expression.name}"; did you mean "${replacement}"?`,
            expression.start,
            expression.end,
            replacement,
          )
        }
        return this.safeValue(this.#scope[expression.name], expression)
      }
      case 'group':
        return this.value(expression.expression)
      case 'unary':
        return this.evaluateUnary(expression)
      case 'binary':
        return this.evaluateBinary(expression)
      case 'conditional':
        return this.isTruthy(this.value(expression.test))
          ? this.value(expression.consequent)
          : this.value(expression.alternate)
      case 'member':
        return this.evaluateMember(expression)
      case 'array':
        return expression.elements.map((element) => this.value(element))
      case 'object': {
        const output = Object.create(null) as Record<string, ExpressionValue>
        for (const property of expression.properties) {
          output[property.key] = this.value(property.value)
        }
        return output
      }
    }
  }

  isTruthy(value: ExpressionValue): boolean {
    if (value === null || value === false || value === '' || value === 0) {
      return false
    }
    return !(typeof value === 'number' && Number.isNaN(value))
  }

  finite(value: number, expression: Expression): number {
    if (!Number.isFinite(value)) {
      failure('HMX2042', 'Numeric result must be finite.', expression.start, expression.end)
    }
    return value
  }

  number(value: ExpressionValue, expression: Expression): number {
    if (isStructured(value)) {
      failure(
        'HMX2043',
        'Objects and arrays cannot be coerced to numbers.',
        expression.start,
        expression.end,
      )
    }
    return this.finite(Number(value), expression)
  }

  evaluateUnary(expression: UnaryExpression): ExpressionValue {
    const value = this.value(expression.argument)
    if (expression.operator === '!') {
      return !this.isTruthy(value)
    }
    const numeric = this.number(value, expression)
    return expression.operator === '-' ? this.finite(-numeric, expression) : numeric
  }

  evaluateBinary(expression: BinaryExpression): ExpressionValue {
    const operator = expression.operator
    if (operator === '&&') {
      const left = this.value(expression.left)
      return this.isTruthy(left) ? this.value(expression.right) : left
    }
    if (operator === '||') {
      const left = this.value(expression.left)
      return this.isTruthy(left) ? left : this.value(expression.right)
    }
    if (operator === '??') {
      const left = this.value(expression.left)
      return left === null ? this.value(expression.right) : left
    }

    const left = this.value(expression.left)
    const right = this.value(expression.right)
    if (operator === '==') {
      return this.equal(left, right, expression)
    }
    if (operator === '!=') {
      return !this.equal(left, right, expression)
    }
    if (operator === '+') {
      if (isStructured(left) || isStructured(right)) {
        failure(
          'HMX2043',
          'Objects and arrays cannot be used with +.',
          expression.operatorStart,
          expression.operatorStart + 1,
        )
      }
      return typeof left === 'string' || typeof right === 'string'
        ? scalarString(left) + scalarString(right)
        : this.finite(this.number(left, expression) + this.number(right, expression), expression)
    }
    if (operator === '-') {
      return this.finite(this.number(left, expression) - this.number(right, expression), expression)
    }
    if (operator === '*') {
      return this.finite(this.number(left, expression) * this.number(right, expression), expression)
    }
    if (operator === '/') {
      return this.finite(this.number(left, expression) / this.number(right, expression), expression)
    }
    if (operator === '%') {
      return this.finite(this.number(left, expression) % this.number(right, expression), expression)
    }
    return this.compare(operator, left, right, expression)
  }

  equal(left: ExpressionValue, right: ExpressionValue, expression: BinaryExpression): boolean {
    if (isStructured(left) || isStructured(right)) {
      if (isStructured(left) && isStructured(right)) {
        return left === right
      }
      failure(
        'HMX2043',
        'Objects and arrays cannot be compared with scalar values.',
        expression.operatorStart,
        expression.operatorStart + expression.operator.length,
      )
    }
    if (left === null || right === null) {
      return left === right
    }
    if (typeof left === typeof right) {
      return left === right
    }
    if (typeof left === 'boolean') {
      return this.number(left, expression) === this.number(right, expression)
    }
    if (typeof right === 'boolean') {
      return this.number(left, expression) === this.number(right, expression)
    }
    if (
      (typeof left === 'number' && typeof right === 'string') ||
      (typeof left === 'string' && typeof right === 'number')
    ) {
      return this.number(left, expression) === this.number(right, expression)
    }
    return false
  }

  compare(
    operator: '<' | '<=' | '>' | '>=',
    left: ExpressionValue,
    right: ExpressionValue,
    expression: BinaryExpression,
  ): boolean {
    if (isStructured(left) || isStructured(right)) {
      failure(
        'HMX2043',
        'Objects and arrays cannot be ordered.',
        expression.operatorStart,
        expression.operatorStart + operator.length,
      )
    }
    const comparableLeft =
      typeof left === 'string' && typeof right === 'string' ? left : this.number(left, expression)
    const comparableRight =
      typeof left === 'string' && typeof right === 'string' ? right : this.number(right, expression)
    if (operator === '<') return comparableLeft < comparableRight
    if (operator === '<=') return comparableLeft <= comparableRight
    if (operator === '>') return comparableLeft > comparableRight
    return comparableLeft >= comparableRight
  }

  propertyKey(value: ExpressionValue, expression: MemberExpression): string {
    if (isStructured(value)) {
      failure(
        'HMX2041',
        'Computed property name must be a scalar value.',
        expression.propertyStart,
        expression.propertyEnd,
      )
    }
    return scalarString(value)
  }

  ownProperty(
    value: ExpressionValue,
    key: string,
  ): { readonly found: boolean; readonly value?: unknown } {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      return { found: false }
    }
    if (typeof value === 'string') {
      if (key === 'length') {
        return { found: true, value: value.length }
      }
      const index = Number(key)
      return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key
        ? { found: true, value: value[index] }
        : { found: false }
    }
    if (!Object.hasOwn(value, key)) {
      return { found: false }
    }
    const record = value as unknown as Readonly<Record<string, unknown>>
    return { found: true, value: record[key] }
  }

  evaluateMember(expression: MemberExpression): ExpressionValue | typeof OPTIONAL_MISSING {
    const object = this.evaluateNode(expression.object)
    if (object === OPTIONAL_MISSING) {
      return OPTIONAL_MISSING
    }
    if (object === null) {
      if (expression.optional) {
        return OPTIONAL_MISSING
      }
      failure(
        'HMX2041',
        'Property does not exist on null.',
        expression.propertyStart,
        expression.propertyEnd,
      )
    }

    const key = expression.computed
      ? this.propertyKey(this.value(expression.property as Expression), expression)
      : (expression.property as string)
    if (isForbiddenAttributeName(key)) {
      failure(
        'HMX2044',
        `Property "${key}" is forbidden.`,
        expression.propertyStart,
        expression.propertyEnd,
      )
    }
    const property = this.ownProperty(object, key)
    if (!property.found) {
      if (expression.optional) {
        return OPTIONAL_MISSING
      }
      failure(
        'HMX2041',
        `Property "${key}" does not exist on this value.`,
        expression.propertyStart,
        expression.propertyEnd,
      )
    }
    return this.safeValue(property.value, expression)
  }
}

function pointAt(source: string, offset: number): Point {
  const clamped = Math.min(Math.max(offset, 0), source.length)
  let line = 1
  let lineStart = 0
  for (let index = 0; index < clamped; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1
      lineStart = index + 1
    }
  }
  return { line, column: clamped - lineStart + 1, offset: clamped }
}

function issueSpan(issue: ExpressionIssue, context: ExpressionSourceContext): Span {
  const start = context.startOffset + issue.start
  const end = context.startOffset + issue.end
  return {
    start: pointAt(context.documentSource, start),
    end: pointAt(context.documentSource, end),
  }
}

function issueDiagnostic(issue: ExpressionIssue, context: ExpressionSourceContext): Diagnostic {
  const span = issueSpan(issue, context)
  return createDiagnostic({
    code: issue.code,
    severity: 'error',
    message: issue.message,
    span,
    ...(issue.replacement === undefined
      ? {}
      : {
          suggestion: {
            message: `Replace with "${issue.replacement}".`,
            replacement: issue.replacement,
            span,
          },
        }),
  })
}

/**
 * Parses and evaluates one expression without host evaluation. Every input returns either
 * a value or one source-located diagnostic; no expression failure escapes as an exception.
 */
export function evaluateExpression(
  source: string,
  scope: FrontmatterValue,
  context: ExpressionSourceContext = { documentSource: source, startOffset: 0 },
): ExpressionEvaluation {
  try {
    const expression = new Parser(tokenize(source)).parse()
    const value = new Evaluator(scope, context.identifierNames ?? Object.keys(scope)).evaluate(
      expression,
    )
    return { ok: true, value, diagnostics: [] }
  } catch (error) {
    const issue =
      error instanceof ExpressionFailure
        ? error.issue
        : {
            code: 'HMX1022' as const,
            message: 'Expression could not be evaluated safely.',
            start: 0,
            end: Math.min(1, source.length),
          }
    return { ok: false, diagnostics: [issueDiagnostic(issue, context)] }
  }
}
