import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'

const codes = (result: ReturnType<typeof compile>) =>
  result.diagnostics.map((diagnostic) => diagnostic.code)

describe('foreign components', () => {
  it('records a reference and emits only a placeholder', () => {
    const result = compile(
      '# Report\n\n::island{from="./Chart.tsx" export="RevenueChart" series="monthly" live}\n',
      { trust: 'app' },
    )

    expect(result.islands).toEqual([
      {
        id: 0,
        from: './Chart.tsx',
        export: 'RevenueChart',
        props: { series: 'monthly', live: true },
      },
    ])
    expect(result.html).toContain('<div data-hmx-island="0"></div>')
    // The compiler must not ship a framework, or resolve the module at all.
    expect(result.js).toBe('')
  })

  it('defaults the export to default', () => {
    const result = compile('::island{from="./Chart.tsx"}\n', { trust: 'app' })

    expect(result.islands[0]?.export).toBe('default')
  })

  it('reports the runtime cost so it is not silent', () => {
    const result = compile('::island{from="./Chart.tsx"}\n', { trust: 'app' })
    const info = result.diagnostics.find((diagnostic) => diagnostic.code === 'HMX2070')

    expect(info?.severity).toBe('info')
    expect(info?.message).toContain('framework runtime')
  })

  // An untrusted document must not be able to make a host load arbitrary modules.
  it('refuses islands in document trust mode', () => {
    const result = compile('::island{from="./Chart.tsx"}\n')

    expect(codes(result)).toContain('HMX3010')
    expect(result.islands).toEqual([])
    expect(result.html).not.toContain('data-hmx-island')
  })

  it.each([
    'https://evil.test/payload.js',
    'data:text/javascript,alert(1)',
    'file:///etc/passwd',
    '//evil.test/x.js',
    '',
  ])('refuses the specifier %j', (specifier) => {
    const result = compile(`::island{from="${specifier}"}\n`, { trust: 'app' })

    expect(codes(result)).toContain('HMX2072')
    expect(result.islands).toEqual([])
  })

  it.each(['./Chart.tsx', '../shared/Chart.tsx', '@scope/charts', 'charts/bar'])(
    'accepts the specifier %j',
    (specifier) => {
      const result = compile(`::island{from="${specifier}"}\n`, { trust: 'app' })

      expect(result.islands[0]?.from).toBe(specifier)
    },
  )

  it('numbers multiple islands in document order', () => {
    const result = compile(
      '::island{from="./A.tsx"}\n\n::island{from="./B.tsx"}\n\n::island{from="./C.tsx"}\n',
      { trust: 'app' },
    )

    expect(result.islands.map((island) => [island.id, island.from])).toEqual([
      [0, './A.tsx'],
      [1, './B.tsx'],
      [2, './C.tsx'],
    ])
  })

  it('leaves documents without islands completely unchanged', () => {
    const withoutIslands = compile('# Plain\n\nProse only.\n', { trust: 'app' })

    expect(withoutIslands.islands).toEqual([])
    expect(withoutIslands.js).toBe('')
    expect(withoutIslands.html).toBe('<h1>Plain</h1>\n<p>Prose only.</p>\n')
  })

  it('keeps props free of the reserved attributes', () => {
    const result = compile('::island{from="./C.tsx" export="X" title="Tip"}\n', { trust: 'app' })

    expect(result.islands[0]?.props).not.toHaveProperty('from')
    expect(result.islands[0]?.props).not.toHaveProperty('export')
    expect(result.islands[0]?.props).toEqual({ title: 'Tip' })
  })

  it('gives props a null prototype so a prop name cannot reach Object.prototype', () => {
    const result = compile('::island{from="./C.tsx" __proto__="polluted"}\n', { trust: 'app' })

    expect(Object.getPrototypeOf(result.islands[0]?.props)).toBeNull()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
