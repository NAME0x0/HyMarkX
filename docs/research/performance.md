# Performance baseline

ROADMAP Phase 9 calls for "performance targets from measured baselines" — in that order. This
is the measurement. Regenerate it with `node benchmarks/performance/measure.mjs --write`, which
rewrites [`benchmarks/performance/baseline.json`](../../benchmarks/performance/baseline.json).

## The headline number

**A document containing no HMX construct parses for about what a bare CommonMark + GFM parse
costs — 1.00x, with a run-to-run spread of 0.94x to 1.39x.**

Invariant 1 says such a document *is* CommonMark. This says it is also priced like CommonMark:
the source spans on every node, the diagnostic machinery, and the directive and frontmatter
tokenizer extensions sitting in the construct table without ever matching do not add a
measurable toll to plain Markdown.

The comparison is `mdast-util-from-markdown` configured with the same four GFM extensions the
parser uses — table, strikethrough, autolink literal, task list item — and no footnotes, since
HMX has none. A baseline configured differently from the thing it measures produces a
flattering number rather than a true one. The two were confirmed to produce identical node
types on the same input before any timing was taken.

## Growth with document size

| | |
|---|---|
| 31 KB document | ~69 ms |
| 124 KB document | ~310 ms |
| Growth exponent | **1.09** (1.0 is linear, 2.0 is quadratic) |

Compile time grows linearly with document size. This is the number the regression gate asserts
on, because accidental quadratic behaviour is the failure that turns a large document into a
hung build.

## Cost by construct

Per byte, relative to plain CommonMark prose on the same machine in the same run:

| Workload | vs prose |
|---|--:|
| prose (CommonMark + GFM) | 1.00 |
| directives | 0.91 |
| expressions + frontmatter | 0.64 |
| raw HTML | 0.19 |
| all of the above mixed | 0.98 |

No construct costs more than plain prose per byte. That is less impressive than it looks:
Markdown's inline phase is the expensive part, and a line of directive syntax contains less
inline content to chew through than a line of prose. It is reported because the number that
would matter is the one that came out high, and none did.

## What the gate actually catches

Set out plainly, because a passing performance test invites more confidence than it has earned.

Sensitivity was calibrated by injecting a pass that re-scans the document once per line and
varying how much of it each line touches. A healthy tree reads 0.68–1.11 across eight runs
(median 1.05):

| Injected quadratic work at 124 KB | Exponent | Caught by the 1.5 threshold |
|---|--:|---|
| ~6% of compile time | 1.10 | no — indistinguishable from healthy |
| ~25% | 1.16 | no |
| ~2x compile time | 1.35 | no |
| ~5x compile time | 1.73 | **yes** |

So the gate catches a quadratic that has taken over the compile. It does not catch one that is
merely present, and it cannot catch a constant-factor slowdown at all — a blended exponent
stays near 1.0 until the quadratic term dominates, and no threshold above the healthy spread
changes that. Catching smaller regressions needs a quiet machine and a stored baseline, which
is what `baseline.json` is for.

## Why there are no millisecond thresholds

The same unchanged tree measured 1460 and 2324 ns/byte on two runs an hour apart on the
development machine — a 60% swing with no code between them. An absolute threshold either sits
above that swing, catching nothing, or below it, flaking until somebody deletes the test. Every
asserted number here is a ratio between two measurements taken in the same run on the same
machine, which is the only form that survives.

The absolute figures are still recorded. They are comparable between two commits on one
machine, and that comparison is where a constant-factor regression would be seen.

## Two measurements that were discarded

Recorded because the discarded versions looked perfectly reasonable, and a later reader
otherwise has no way to know they were tried.

**Per-byte cost across a 450 B to 3.6 KB range.** At those sizes per-byte cost is still
dominated by warm-up and fixed overhead. A healthy tree produced factors anywhere from 0.44 to
2.28 — wider than the signal being looked for — and a document with an injected quadratic pass
was indistinguishable from a clean one. The fix was to start measuring where the curve has
settled, at 31 KB.

**A single pair of timings for each ratio.** At the largest size one compile takes
milliseconds, so a 120 ms sampling budget buys about ten samples. A scaling factor computed
from two such minima swung between 0.77 and 1.61 on unchanged code — and 1.61 was briefly
mistaken for a real superlinearity worth investigating. Requiring a minimum sample count, and
taking the median of interleaved rounds for the invariant-1 ratio, is what made the numbers
hold still.
