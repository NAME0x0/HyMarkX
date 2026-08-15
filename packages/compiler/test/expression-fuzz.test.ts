import { expect, it } from 'vitest'
import { evaluateExpression } from '../src/expression.js'
import type { ExpressionValue } from '../src/expression.js'
import type { FrontmatterValue } from '../src/types.js'

const FUZZ_SEED = 0x484d5808
const RANDOM_CASES = 5_000
const GRAMMAR_CASES = 5_000
const TOTAL_CASES = RANDOM_CASES + GRAMMAR_CASES

const grammarSeeds = [
  'null',
  'true',
  'false',
  '0',
  '-1.25e2',
  '"text"',
  "'single'",
  'title',
  'user.name',
  'user?.missing',
  'items[0]',
  'items?.[count]',
  '!enabled',
  '+count',
  '-count',
  'count + 2 * 3',
  'count / 2 % 3',
  'count == "3"',
  'count != 4',
  'count < 10',
  'count <= 3',
  'count > 1',
  'count >= 3',
  'enabled && title',
  'enabled || missing',
  'null ?? title',
  'enabled ? title : "off"',
  '[title, count, null]',
  '{title, count: count + 1}',
  '({nested: user}).nested.name',
  'value = 1',
  'new Thing',
  'function () {}',
  'value => value',
  'this',
  '`template`',
  'tag`template`',
  'import("x")',
  'await value',
  'function* () {}',
  '/regex/',
  'value++',
  'value, other',
  'value()',
]

function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

function randomBytes(random: () => number): string {
  const length = random() % 129
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(random() & 0xff)
  }
  return value
}

const mutationCharacters = '()[]{}?:.,+-*/%!=<>&|? abcXYZ019"\'`\\'

function grammarMutation(random: () => number, sample: number): string {
  const seed = grammarSeeds[random() % grammarSeeds.length] ?? 'null'
  const index = seed.length === 0 ? 0 : random() % seed.length
  const character = mutationCharacters[random() % mutationCharacters.length] ?? ' '

  switch (sample % 8) {
    case 0:
      return seed.slice(0, index) + seed.slice(index + 1)
    case 1:
      return seed.slice(0, index) + character + seed.slice(index)
    case 2:
      return seed.slice(0, index) + character + seed.slice(index + 1)
    case 3:
      return index + 1 >= seed.length
        ? seed
        : seed.slice(0, index) + seed[index + 1] + seed[index] + seed.slice(index + 2)
    case 4:
      return `(${seed})`
    case 5:
      return `[${seed}, ${grammarSeeds[random() % grammarSeeds.length] ?? 'null'}]`
    case 6:
      return seed.slice(0, index)
    default:
      return `${seed} ${['+', '&&', '??', '?'][random() % 4] ?? '+'} ${grammarSeeds[random() % grammarSeeds.length] ?? 'null'}`
  }
}

function nullRecord(values: Readonly<Record<string, ExpressionValue>>): FrontmatterValue {
  return Object.assign(Object.create(null) as FrontmatterValue, values)
}

function assertNoFunction(value: ExpressionValue): void {
  const stack: ExpressionValue[] = [value]
  while (stack.length > 0) {
    const current = stack.pop()
    expect(typeof current).not.toBe('function')
    if (Array.isArray(current)) {
      stack.push(...current)
    } else if (typeof current === 'object' && current !== null) {
      stack.push(...Object.values(current))
    }
  }
}

it('evaluates or diagnoses 10,000 seeded random and grammar-mutated expressions', () => {
  const random = createRandom(FUZZ_SEED)
  const user = Object.freeze(nullRecord({ name: 'Ada' }))
  const items = Object.freeze(['first', 'second'])
  const scope = Object.freeze(
    nullRecord({ title: 'Dashboard', count: 3, enabled: true, user, items }),
  )
  const before = JSON.stringify(scope)

  for (let sample = 0; sample < TOTAL_CASES; sample += 1) {
    const source =
      sample < RANDOM_CASES ? randomBytes(random) : grammarMutation(random, sample - RANDOM_CASES)
    let result: ReturnType<typeof evaluateExpression> | undefined

    expect(
      () => {
        result = evaluateExpression(source, scope)
      },
      `sample ${sample}: ${JSON.stringify(source)}`,
    ).not.toThrow()
    expect(result).toBeDefined()
    if (result?.ok === true) {
      expect(result.diagnostics).toEqual([])
      assertNoFunction(result.value)
    } else {
      expect(result?.diagnostics.length).toBeGreaterThan(0)
    }
  }

  expect(JSON.stringify(scope)).toBe(before)
  expect(Object.isFrozen(scope)).toBe(true)
  process.stdout.write(
    `HMX expression fuzz: PASS cases=${TOTAL_CASES} random=${RANDOM_CASES} grammar=${GRAMMAR_CASES} seed=0x${FUZZ_SEED.toString(16)}\n`,
  )
}, 120_000) // 5 MB and fuzz runs take ~3-7s locally; a wide margin keeps a
// loaded CI runner or a cold start from turning a slow machine into a red build.
