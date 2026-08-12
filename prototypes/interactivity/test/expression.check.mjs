import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertExpressionScope,
  evaluateExpression,
  parseExpression,
  tokenizeExpression,
} from '../src/expression.mjs'

describe('restricted expression language', () => {
  it('tokenizes, parses, and interprets the counter assignment', () => {
    const scope = Object.assign(Object.create(null), { count: 0 })
    const expression = parseExpression('count = count + 1 * 2')
    assertExpressionScope(expression, new Set(['count']))

    assert.equal(evaluateExpression(expression, scope), 2)
    assert.equal(scope.count, 2)
  })

  it('preserves short-circuit behavior', () => {
    const scope = Object.assign(Object.create(null), { left: false, right: 0 })
    const expression = parseExpression('left && (right = 1)')
    assertExpressionScope(expression, new Set(['left', 'right']))

    assert.equal(evaluateExpression(expression, scope), false)
    assert.equal(scope.right, 0)
  })

  it('reads escaped strings without using the host language parser', () => {
    const expression = parseExpression("name = 'Ada\\nLovelace'")
    const scope = Object.assign(Object.create(null), { name: '' })

    assert.equal(evaluateExpression(expression, scope), 'Ada\nLovelace')
  })

  it('rejects calls, host access, dynamic import, and forbidden names clearly', () => {
    for (const source of ['alert(1)', 'window.location', 'a.b', "import('x')", 'constructor']) {
      assert.throws(() => parseExpression(source), SyntaxError, source)
    }
  })

  it('rejects assignment to an undeclared state variable', () => {
    const expression = parseExpression('missing = 1')
    assert.throws(
      () => assertExpressionScope(expression, new Set(['count'])),
      /Undeclared state variable "missing"/,
    )
  })

  it('does not silently accept trailing tokens', () => {
    assert.throws(() => tokenizeExpression('count @ 1'), /Unexpected character/)
    assert.throws(() => parseExpression('count(1)'), /Function calls are not allowed/)
  })
})
