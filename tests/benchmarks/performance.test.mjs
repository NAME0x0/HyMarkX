import { describe, expect, it } from 'vitest'
import { measure } from '../../benchmarks/performance/measure.mjs'
import { compile } from '../../packages/compiler/src/index.js'
import { parse } from '../../packages/parser/src/index.js'

/**
 * The performance regression gate.
 *
 * It asserts nothing about milliseconds. The same unchanged tree measured 1460 and 2324
 * ns/byte on two runs an hour apart on this machine — a 60% swing with no code between them,
 * so any absolute threshold either sits above that or is a flake.
 *
 * Two things are asserted, both ratios, both measured in the same run on the same machine:
 * how compile time grows with document size, and what a plain CommonMark document costs
 * against a bare CommonMark parser.
 *
 * Both thresholds sit in measured empty space rather than being guessed, and neither is
 * claimed to catch more than it does — see the limitation in `measureComplexity`.
 * `benchmarks/performance/baseline.json` holds the absolute numbers, which is where a
 * constant-factor regression is visible.
 */

// A smaller budget than the CLI uses, because this runs on every `pnpm test`. The thresholds
// have enough margin to survive the extra noise that buys.
const result = measure({ compile, parse }, { minDurationMs: 40, minSamples: 6 })

describe('performance shape', () => {
  // Linear is 1.0 and quadratic is 2.0. A healthy tree read 0.68-1.11 across eight runs, and an
  // injected quadratic that had taken over the compile read 1.73. 1.5 sits between them. The
  // calibration table in `measureComplexity` records what this does and does not detect —
  // notably, it does not catch a quadratic term that is present but not yet dominant.
  it('compile time grows about linearly with document size', () => {
    expect(result.complexity.growthExponent).toBeLessThan(1.5)
  })

  // Invariant 1 priced. Measured at 0.98-1.05 across runs — a document with no HMX construct
  // costs about what a bare mdast + GFM parse costs. 1.5 catches an extra tree walk, a per-node
  // regex, or a sanitizer that stopped short-circuiting, while leaving room for the noise.
  it('parses plain CommonMark for about what a bare CommonMark parser costs', () => {
    expect(result.invariantOne.overheadVersusBareParse).toBeLessThan(1.5)
  })

  // Directives and interpolation are the features and may cost more than prose. What they may
  // not do is cost an order of magnitude more, which is what a per-occurrence tree walk would
  // produce. Measured at 0.9-1.6.
  it.each(['directives', 'expressions', 'mixed'])(
    'compiles %s at a small multiple of plain prose',
    (name) => {
      const workload = result.workloads.find((entry) => entry.name === name)

      expect(workload.compileCostVersusProse).toBeLessThan(4)
    },
  )

  // Guards the harness itself: a measurement of zero bytes or zero time would satisfy every
  // threshold above while measuring nothing at all.
  it('measured every workload at a realistic size', () => {
    expect(result.workloads).toHaveLength(5)
    for (const workload of result.workloads) {
      expect(workload.bytes).toBeGreaterThan(1000)
      expect(workload.parseNsPerByte).toBeGreaterThan(0)
      expect(workload.compileNsPerByte).toBeGreaterThan(0)
    }
    expect(result.complexity.largeBytes).toBeGreaterThan(100_000)
  })
})
