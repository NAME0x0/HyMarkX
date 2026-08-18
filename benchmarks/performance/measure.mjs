/**
 * Performance baseline harness.
 *
 * Charter §29 requires measuring before targeting, so this produces the measurement and
 * `baseline.json` records it.
 *
 * What it deliberately does not produce is a millisecond threshold for a regression test to
 * assert. Wall-clock numbers are a property of the machine that took them: this tree measured
 * 1460 and 2324 ns/byte on two runs an hour apart with no code between them. Any absolute
 * threshold either sits above a 60% swing or is a flake.
 *
 * Two machine-independent numbers are produced instead, and both were arrived at by discarding
 * something that did not work — see the notes on each.
 *
 *   1. `complexity`: the growth exponent between two large documents. 1.0 is linear, 2.0 is
 *      quadratic. Accidental quadratic behaviour is the failure that actually breaks a build on
 *      a real document, and this is what detects it.
 *   2. `invariantOne`: the cost of a plain CommonMark document through the HMX parser against a
 *      bare mdast + GFM parse, measured in the same run on the same machine. Invariant 1 says
 *      such a document *is* CommonMark; this says it is also priced like it.
 *
 * Absolute per-workload numbers are still recorded. They are only comparable between two
 * commits on one machine, which is also the only place a constant-factor regression can be
 * seen — see the limitation note on `complexity`.
 *
 * The pipeline is injected rather than imported so the CLI can measure `dist/` (what users
 * actually run) while the regression test measures `src/` (no build step required).
 *
 * Usage: `node benchmarks/performance/measure.mjs [--write] [--json]`
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bareParse } from './bare-parser.mjs'
import { WORKLOADS, build } from './workloads.mjs'

/** Size the per-workload absolute numbers are reported at. */
const REPORT_SCALE = 8

/**
 * The two sizes the growth exponent is computed from, roughly 31 KB and 124 KB.
 *
 * Both are deliberately large. An earlier version compared 450 B against 3.6 KB and was
 * useless: at those sizes per-byte cost is still dominated by warm-up and fixed overhead, so a
 * healthy tree produced factors anywhere from 0.44 to 2.28 and a document with an injected
 * quadratic pass was indistinguishable from a clean one. Starting where the curve has settled
 * is what makes the exponent mean anything.
 */
const COMPLEXITY_SCALES = [32, 128]

const MIN_SAMPLES = 25

/**
 * Times `run` repeatedly and returns the best observed nanoseconds per operation.
 *
 * The minimum, not the mean: the distribution is a true cost plus non-negative noise from GC,
 * scheduling and frequency scaling, so the minimum is the closest available estimate of the
 * true cost and is far more stable across runs than the mean.
 */
function time(run, minDurationMs, minSamples = MIN_SAMPLES) {
  // Warm up so JIT compilation and lazy initialisation are not counted as work.
  for (let index = 0; index < 3; index += 1) {
    run()
  }

  let best = Number.POSITIVE_INFINITY
  let samples = 0
  const deadline = performance.now() + minDurationMs
  while (samples < minSamples || performance.now() < deadline) {
    const started = process.hrtime.bigint()
    run()
    const elapsed = Number(process.hrtime.bigint() - started)
    if (elapsed < best) {
      best = elapsed
    }
    samples += 1
  }
  return best
}

/**
 * A fixed unit of arithmetic, timed on the machine doing the measuring.
 *
 * Recorded so committed absolute numbers carry some indication of how fast the machine was.
 * It is a coarse instrument — it does not model memory bandwidth or allocation cost — so it is
 * for orientation only, never for a pass or fail decision.
 */
function calibrate(minDurationMs, minSamples) {
  const nanoseconds = time(
    () => {
      let total = 0
      for (let index = 0; index < 1_000_000; index += 1) {
        total = (total + index) % 9973
      }
      return total
    },
    minDurationMs,
    minSamples,
  )
  return nanoseconds / 1_000_000
}

/**
 * Times two candidates against each other, alternating between them.
 *
 * Comparing two separately-taken minima is unreliable: they come from different moments, so
 * thermal throttling or a background process during one of them shows up as a difference in the
 * code. Alternating puts both candidates under the same conditions in each round, and the
 * median of the per-round ratios discards the round where something else ran.
 */
function compareInterleaved(runA, runB, minDurationMs, minSamples, rounds = 5) {
  const ratios = []
  const perRound = []
  for (let round = 0; round < rounds; round += 1) {
    // The spread across rounds was 0.98-1.12 on a quiet machine and 0.82-1.28 on a busy one with
    // the same budget, so its width is set by what else the machine is doing rather than by the
    // sampling. The median is the part that holds still: it read 1.05, 1.05, 0.98 and 1.00
    // across four runs spanning both conditions.
    const a = time(runA, minDurationMs, minSamples)
    const b = time(runB, minDurationMs, minSamples)
    perRound.push({ a, b })
    ratios.push(a / b)
  }
  const median = (values) => [...values].sort((left, right) => left - right)[values.length >> 1]
  const sorted = [...ratios].sort((left, right) => left - right)
  return {
    a: median(perRound.map((entry) => entry.a)),
    b: median(perRound.map((entry) => entry.b)),
    ratio: median(ratios),
    range: [sorted[0], sorted[sorted.length - 1]],
  }
}

/**
 * How compile time grows with document size, as an exponent of size.
 *
 * 1.0 is linear, 2.0 is quadratic. Measured on the `mixed` workload because it exercises every
 * construct at once, which is where a per-occurrence tree walk would show up.
 *
 * Sensitivity was calibrated by injecting a pass that re-scans the document once per line and
 * varying how much of it each line touches. A healthy tree reads 0.68-1.11 over eight runs
 * (median 1.05); the injected quadratic reads:
 *
 * | quadratic work at 124 KB | exponent | caught at 1.5 |
 * |---|--:|---|
 * | ~6% of compile time | 1.10 | no — indistinguishable from healthy |
 * | ~25% | 1.16 | no |
 * | ~2x compile time | 1.35 | no |
 * | ~5x compile time | 1.73 | yes |
 *
 * So this catches a quadratic that has taken over the compile, which is the one that turns a
 * large document into a hung build. It does not catch a quadratic term that is merely present,
 * and it cannot catch a constant-factor slowdown at all — a blended exponent stays near 1.0
 * until the quadratic term dominates, and no threshold above the healthy spread can change
 * that. Those need a quiet machine and a stored baseline, which is what `baseline.json` is for.
 */
function measureComplexity(pipeline, minDurationMs, minSamples) {
  const workload = WORKLOADS.find((entry) => entry.name === 'mixed')
  const sizes = COMPLEXITY_SCALES.map((repeats) => {
    const source = build(workload, repeats)
    return {
      bytes: Buffer.byteLength(source, 'utf8'),
      nanoseconds: time(
        () => pipeline.compile(source, { trust: workload.trust }),
        minDurationMs,
        minSamples,
      ),
    }
  })

  const [small, large] = sizes
  const sizeRatio = large.bytes / small.bytes
  return {
    smallBytes: small.bytes,
    largeBytes: large.bytes,
    smallMs: Number((small.nanoseconds / 1e6).toFixed(2)),
    largeMs: Number((large.nanoseconds / 1e6).toFixed(2)),
    growthExponent: Number(
      (Math.log(large.nanoseconds / small.nanoseconds) / Math.log(sizeRatio)).toFixed(3),
    ),
  }
}

/**
 * @param {{ parse: Function, compile: Function }} pipeline
 * @param {{ minDurationMs?: number, minSamples?: number }} [options]
 */
export function measure(pipeline, options = {}) {
  const minDurationMs = options.minDurationMs ?? 120
  const minSamples = options.minSamples ?? MIN_SAMPLES
  const calibration = calibrate(minDurationMs, minSamples)

  const measured = WORKLOADS.map((workload) => {
    const source = build(workload, REPORT_SCALE)
    const bytes = Buffer.byteLength(source, 'utf8')
    return {
      name: workload.name,
      bytes,
      parseNsPerByte: time(() => pipeline.parse(source), minDurationMs, minSamples) / bytes,
      compileNsPerByte:
        time(() => pipeline.compile(source, { trust: workload.trust }), minDurationMs, minSamples) /
        bytes,
    }
  })
  const prose = measured.find((workload) => workload.name === 'prose')

  const proseSource = build(
    WORKLOADS.find((workload) => workload.name === 'prose'),
    REPORT_SCALE,
  )
  const proseBytes = Buffer.byteLength(proseSource, 'utf8')
  const invariantOne = compareInterleaved(
    () => pipeline.parse(proseSource),
    () => bareParse(proseSource),
    minDurationMs,
    minSamples,
  )

  return {
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      calibrationNsPerIteration: Number(calibration.toFixed(4)),
    },
    complexity: measureComplexity(pipeline, minDurationMs, minSamples),
    invariantOne: {
      bytes: proseBytes,
      bareParseNsPerByte: Number((invariantOne.b / proseBytes).toFixed(2)),
      hmxParseNsPerByte: Number((invariantOne.a / proseBytes).toFixed(2)),
      // What a document with no HMX construct pays for HMX being available: source spans on
      // every node, diagnostics, and the directive and frontmatter tokenizer extensions sitting
      // in the construct table without ever matching.
      overheadVersusBareParse: Number(invariantOne.ratio.toFixed(3)),
      // The honest width of the instrument. Any reading of the headline figure narrower than
      // this spread is reading noise.
      observedRatioRange: invariantOne.range.map((value) => Number(value.toFixed(3))),
    },
    workloads: measured.map((workload) => ({
      name: workload.name,
      bytes: workload.bytes,
      parseNsPerByte: Number(workload.parseNsPerByte.toFixed(2)),
      compileNsPerByte: Number(workload.compileNsPerByte.toFixed(2)),
      // How much more a byte of this workload costs than a byte of plain CommonMark, on the
      // same machine in the same run.
      compileCostVersusProse: Number(
        (workload.compileNsPerByte / prose.compileNsPerByte).toFixed(3),
      ),
    })),
  }
}

function report(result) {
  const pad = (value, width) => String(value).padStart(width)
  console.log(
    `node ${result.environment.node} ${result.environment.platform}  ` +
      `calibration ${result.environment.calibrationNsPerIteration} ns/iter`,
  )
  console.log('')
  console.log('workload      bytes  parse ns/B  compile ns/B  vs prose')
  for (const workload of result.workloads) {
    console.log(
      `${workload.name.padEnd(12)}${pad(workload.bytes, 7)}` +
        `${pad(workload.parseNsPerByte, 12)}${pad(workload.compileNsPerByte, 14)}` +
        `${pad(workload.compileCostVersusProse, 10)}`,
    )
  }
  console.log('')
  console.log(
    `complexity: ${(result.complexity.smallBytes / 1024).toFixed(0)} KB in ` +
      `${result.complexity.smallMs} ms, ${(result.complexity.largeBytes / 1024).toFixed(0)} KB in ` +
      `${result.complexity.largeMs} ms — growth exponent ${result.complexity.growthExponent} ` +
      `(1.0 linear, 2.0 quadratic).`,
  )
  console.log(
    `invariant 1: plain CommonMark parses at ${result.invariantOne.hmxParseNsPerByte} ns/B ` +
      `against ${result.invariantOne.bareParseNsPerByte} ns/B for a bare mdast + GFM parse ` +
      `— ${result.invariantOne.overheadVersusBareParse}x ` +
      `(observed ${result.invariantOne.observedRatioRange.join('-')}x across rounds).`,
  )
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  // dist, not src: the CLI reports what a user of the published package would experience.
  const { compile } = await import('../../packages/compiler/dist/index.js')
  const { parse } = await import('../../packages/parser/dist/index.js')

  const result = measure({ compile, parse })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    report(result)
  }
  if (process.argv.includes('--write')) {
    const path = fileURLToPath(new URL('./baseline.json', import.meta.url))
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`)
    console.log(`\nwrote ${path}`)
  }
}
