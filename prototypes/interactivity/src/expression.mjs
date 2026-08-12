const FORBIDDEN_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'new',
  'this',
  'import',
  'await',
  'function',
])

const TWO_CHARACTER_OPERATORS = new Set(['&&', '||', '==', '!=', '<=', '>='])
const THREE_CHARACTER_OPERATORS = new Set(['===', '!=='])
const SINGLE_CHARACTER_TOKENS = new Set(['+', '-', '*', '/', '<', '>', '!', '=', '(', ')'])

function expressionError(message, offset) {
  return new SyntaxError(`${message} at offset ${offset}`)
}

function isDigit(character) {
  return character !== undefined && character >= '0' && character <= '9'
}

function isIdentifierStart(character) {
  return (
    character !== undefined &&
    ((character >= 'A' && character <= 'Z') ||
      (character >= 'a' && character <= 'z') ||
      character === '_' ||
      character === '$')
  )
}

function isIdentifierContinue(character) {
  return isIdentifierStart(character) || isDigit(character)
}

function readNumber(source, start) {
  let cursor = start
  while (isDigit(source[cursor])) cursor += 1
  if (source[cursor] === '.') {
    cursor += 1
    while (isDigit(source[cursor])) cursor += 1
  }
  if (source[cursor] === 'e' || source[cursor] === 'E') {
    const exponentStart = cursor
    cursor += 1
    if (source[cursor] === '+' || source[cursor] === '-') cursor += 1
    const digitsStart = cursor
    while (isDigit(source[cursor])) cursor += 1
    if (cursor === digitsStart) {
      throw expressionError('Invalid numeric exponent', exponentStart)
    }
  }
  const raw = source.slice(start, cursor)
  const value = Number(raw)
  if (!Number.isFinite(value)) throw expressionError('Number must be finite', start)
  return { token: { type: 'literal', value, offset: start }, cursor }
}

function readString(source, start) {
  const quote = source[start]
  let cursor = start + 1
  let value = ''
  while (cursor < source.length) {
    const character = source[cursor]
    if (character === quote) {
      return { token: { type: 'literal', value, offset: start }, cursor: cursor + 1 }
    }
    if (character === '\n' || character === '\r') {
      throw expressionError('String literals cannot contain a line break', cursor)
    }
    if (character !== '\\') {
      value += character
      cursor += 1
      continue
    }

    const escaped = source[cursor + 1]
    if (escaped === undefined) throw expressionError('Unterminated string escape', cursor)
    const escapes = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      0: '\0',
      '\\': '\\',
      "'": "'",
      '"': '"',
    }
    if (!Object.hasOwn(escapes, escaped)) {
      throw expressionError(`Unsupported string escape \\${escaped}`, cursor)
    }
    value += escapes[escaped]
    cursor += 2
  }
  throw expressionError('Unterminated string literal', start)
}

/** Tokenizes the restricted expression language without invoking a JavaScript parser. */
export function tokenizeExpression(source) {
  const tokens = []
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
      cursor = result.cursor
      continue
    }

    if (isDigit(character) || (character === '.' && isDigit(source[cursor + 1]))) {
      const result = readNumber(source, cursor)
      tokens.push(result.token)
      cursor = result.cursor
      continue
    }

    if (isIdentifierStart(character)) {
      const start = cursor
      cursor += 1
      while (isIdentifierContinue(source[cursor])) cursor += 1
      const name = source.slice(start, cursor)
      if (FORBIDDEN_NAMES.has(name)) {
        throw expressionError(`Identifier "${name}" is forbidden`, start)
      }
      if (name === 'true' || name === 'false' || name === 'null') {
        tokens.push({
          type: 'literal',
          value: name === 'true' ? true : name === 'false' ? false : null,
          offset: start,
        })
      } else {
        tokens.push({ type: 'identifier', value: name, offset: start })
      }
      continue
    }

    const three = source.slice(cursor, cursor + 3)
    if (THREE_CHARACTER_OPERATORS.has(three)) {
      tokens.push({ type: 'operator', value: three, offset: cursor })
      cursor += 3
      continue
    }
    const two = source.slice(cursor, cursor + 2)
    if (TWO_CHARACTER_OPERATORS.has(two)) {
      tokens.push({ type: 'operator', value: two, offset: cursor })
      cursor += 2
      continue
    }
    if (SINGLE_CHARACTER_TOKENS.has(character)) {
      tokens.push({
        type: character === '(' || character === ')' ? 'punctuation' : 'operator',
        value: character,
        offset: cursor,
      })
      cursor += 1
      continue
    }
    if (character === '.') {
      throw expressionError('Member access is not allowed', cursor)
    }
    throw expressionError(`Unexpected character "${character}"`, cursor)
  }
  tokens.push({ type: 'eof', value: '', offset: source.length })
  return tokens
}

const BINARY_PRECEDENCE = new Map([
  ['||', 1],
  ['&&', 2],
  ['==', 3],
  ['!=', 3],
  ['===', 3],
  ['!==', 3],
  ['<', 4],
  ['<=', 4],
  ['>', 4],
  ['>=', 4],
  ['+', 5],
  ['-', 5],
  ['*', 6],
  ['/', 6],
])

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.cursor = 0
  }

  current() {
    return this.tokens[this.cursor]
  }

  consume() {
    const token = this.current()
    this.cursor += 1
    return token
  }

  parse() {
    const expression = this.parseAssignment()
    const token = this.current()
    if (token.type !== 'eof') {
      if (token.value === '(') throw expressionError('Function calls are not allowed', token.offset)
      if (token.value === '.') throw expressionError('Member access is not allowed', token.offset)
      throw expressionError(`Unexpected token "${token.value}"`, token.offset)
    }
    return expression
  }

  parseAssignment() {
    const left = this.parseBinary(1)
    const token = this.current()
    if (token.type !== 'operator' || token.value !== '=') return left
    if (left[0] !== 'i') {
      throw expressionError('Assignment target must be a state identifier', token.offset)
    }
    this.consume()
    return ['a', left[1], this.parseAssignment()]
  }

  parseBinary(minimumPrecedence) {
    let left = this.parseUnary()
    while (true) {
      const token = this.current()
      const precedence = token.type === 'operator' ? BINARY_PRECEDENCE.get(token.value) : undefined
      if (precedence === undefined || precedence < minimumPrecedence) return left
      this.consume()
      const right = this.parseBinary(precedence + 1)
      left = ['b', token.value, left, right]
    }
  }

  parseUnary() {
    const token = this.current()
    if (
      token.type === 'operator' &&
      (token.value === '!' || token.value === '-' || token.value === '+')
    ) {
      this.consume()
      return ['u', token.value, this.parseUnary()]
    }
    return this.parsePrimary()
  }

  parsePrimary() {
    const token = this.consume()
    if (token.type === 'literal') return ['l', token.value]
    if (token.type === 'identifier') return ['i', token.value]
    if (token.type === 'punctuation' && token.value === '(') {
      const expression = this.parseAssignment()
      const closing = this.consume()
      if (closing.type !== 'punctuation' || closing.value !== ')') {
        throw expressionError('Expected a closing parenthesis', closing.offset)
      }
      return expression
    }
    throw expressionError(
      token.type === 'eof' ? 'Expected an expression' : `Unexpected token "${token.value}"`,
      token.offset,
    )
  }
}

/** Parses an expression to a compact, JSON-serializable AST. */
export function parseExpression(source) {
  return new Parser(tokenizeExpression(source)).parse()
}

/** Checks every read and assignment against the compiler-known page state. */
export function assertExpressionScope(expression, declaredNames) {
  const stack = [expression]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node[0] === 'i' || node[0] === 'a') {
      const name = node[1]
      if (!declaredNames.has(name)) throw new SyntaxError(`Undeclared state variable "${name}"`)
    }
    if (node[0] === 'u') stack.push(node[2])
    if (node[0] === 'b') stack.push(node[2], node[3])
    if (node[0] === 'a') stack.push(node[2])
  }
}

/** Collects only the interpreter operations needed by one generated document. */
export function expressionFeatures(expression) {
  const nodeTypes = new Set()
  const unaryOperators = new Set()
  const binaryOperators = new Set()
  const stack = [expression]
  while (stack.length > 0) {
    const node = stack.pop()
    nodeTypes.add(node[0])
    if (node[0] === 'u') {
      unaryOperators.add(node[1])
      stack.push(node[2])
    } else if (node[0] === 'b') {
      binaryOperators.add(node[1])
      stack.push(node[2], node[3])
    } else if (node[0] === 'a') {
      stack.push(node[2])
    }
  }
  return { nodeTypes, unaryOperators, binaryOperators }
}

function readIdentifier(scope, name) {
  if (!Object.hasOwn(scope, name)) throw new ReferenceError(`Unknown identifier "${name}"`)
  return scope[name]
}

/** Interprets the restricted AST directly; it never hands source to the host language. */
export function evaluateExpression(expression, scope, assign) {
  const write =
    assign ??
    ((name, value) => {
      if (!Object.hasOwn(scope, name)) throw new ReferenceError(`Unknown identifier "${name}"`)
      scope[name] = value
      return value
    })

  const run = (node) => {
    if (node[0] === 'l') return node[1]
    if (node[0] === 'i') return readIdentifier(scope, node[1])
    if (node[0] === 'a') return write(node[1], run(node[2]))
    if (node[0] === 'u') {
      const value = run(node[2])
      if (node[1] === '!') return !value
      if (node[1] === '-') return -value
      if (node[1] === '+') return +value
    }
    if (node[0] === 'b') {
      if (node[1] === '&&') return run(node[2]) && run(node[3])
      if (node[1] === '||') return run(node[2]) || run(node[3])
      const left = run(node[2])
      const right = run(node[3])
      if (node[1] === '+') return left + right
      if (node[1] === '-') return left - right
      if (node[1] === '*') return left * right
      if (node[1] === '/') return left / right
      if (node[1] === '<') return left < right
      if (node[1] === '<=') return left <= right
      if (node[1] === '>') return left > right
      if (node[1] === '>=') return left >= right
      if (node[1] === '==') return left == right
      if (node[1] === '!=') return left != right
      if (node[1] === '===') return left === right
      if (node[1] === '!==') return left !== right
    }
    throw new TypeError(`Unsupported expression node ${JSON.stringify(node)}`)
  }

  return run(expression)
}

/** Returns whether a state declaration name can be referenced by this grammar. */
export function isAllowedIdentifier(name) {
  if (name.length === 0 || !isIdentifierStart(name[0]) || FORBIDDEN_NAMES.has(name)) return false
  for (let index = 1; index < name.length; index += 1) {
    if (!isIdentifierContinue(name[index])) return false
  }
  return true
}
