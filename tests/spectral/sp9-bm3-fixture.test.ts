import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { StrouhalEstimator } from '../../src/physics/spectral';
import type { ClTraceFixture } from '../benchmarks/helpers';

// SP-9 (spec 1.3a §2, §3): the FFT estimator against zero crossings on BM-3's
// recorded Cl trace — the estimator gate of the corrected Phase 1 Definition
// of Done. Two comparisons, both gated at 1%:
//
//   (a) zero crossings recomputed on the SAME decimated trace — isolates the
//       estimator, since both see identical samples;
//   (b) the full-rate zero-crossing St stored in the fixture — the run's own
//       reference, not the published 0.1691 (BM-3's transient uses
//       Math.random(), so another run lands on slightly different statistics).
//
// (a) vs (b) also validates the decimation: the full-rate estimate sees 20×
// more samples per period, so agreement means the 20-step app cadence does not
// bias the measurement.
//
// Per the discrepancy protocol, if this misses 1% the finding is *which
// estimator is wrong* — a maintainer decision. Zero crossings on a clean limit
// cycle are the more trustworthy of the two. Do not retune the gate.

const FIXTURE = 'tests/fixtures/bm3-cl-trace.json';

/**
 * St from upward zero crossings of the mean-removed signal, linearly
 * interpolated for sub-sample timing — the same method BM-3 uses at full rate,
 * applied here in the sample domain and converted back to 1/steps.
 */
function zeroCrossingSt(
  samples: readonly number[],
  cadence: number,
  D: number,
  u0: number,
): { st: number; periods: number } {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const crossings: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] - mean;
    const b = samples[i] - mean;
    if (a < 0 && b >= 0) crossings.push(i - 1 + -a / (b - a));
  }
  const periods = crossings.length - 1;
  const span = crossings[crossings.length - 1] - crossings[0]; // samples
  const frequency = periods / (span * cadence); // 1/steps
  return { st: (frequency * D) / u0, periods };
}

// SKIPPED ON THIS BRANCH: tests/fixtures/bm3-cl-trace.json needs a ~3 h BM-3
// run to generate — `SOPLO_WRITE_FIXTURES=1 npm run test:bench -- bm3-cylinder-re100`
// (spec 1.3a §2); un-skip in the same commit that lands the fixture.
it.skip('SP-9: FFT estimate on the BM-3 Cl fixture agrees with zero crossings within 1%', () => {
  const fixture: ClTraceFixture = JSON.parse(
    readFileSync(resolve(process.cwd(), FIXTURE), 'utf8'),
  );
  const { samples, cadence, D, u0, stFullRate } = fixture;

  const est = new StrouhalEstimator({ cadence });
  for (const cl of samples) est.push(cl);
  const r = est.estimate(D, u0);

  const zc = zeroCrossingSt(samples, cadence, D, u0);

  const errVsDecimated = (r.st! - zc.st) / zc.st;
  const errVsFullRate = (r.st! - stFullRate) / stFullRate;

  process.stdout.write(
    `\nSP-9 · BM-3 Cl fixture (${samples.length} samples, cadence ${cadence}, ` +
      `D = ${D}, ${fixture.Nx}×${fixture.Ny}, ${fixture.sideWalls}, commit ` +
      `${fixture.commit.slice(0, 7)})\n` +
      `  FFT                  St = ${r.st!.toFixed(4)}  ` +
      `(f = ${r.frequency!.toExponential(4)} 1/steps, ` +
      `${r.periods.toFixed(1)} periods)\n` +
      `  zero-cross decimated St = ${zc.st.toFixed(4)}  ` +
      `(${zc.periods} periods)   rel.err ${(errVsDecimated * 100).toFixed(3)}%\n` +
      `  zero-cross full rate  St = ${stFullRate.toFixed(4)}` +
      `                 rel.err ${(errVsFullRate * 100).toFixed(3)}%\n` +
      `  peak prominence = ${r.prominence.toFixed(1)}× ` +
      `(threshold 10; within 3× of it is a finding)\n`,
  );

  expect(r.status).toBe('ok');
  expect(
    Math.abs(errVsDecimated),
    `FFT St ${r.st!.toFixed(4)} vs decimated zero crossings ${zc.st.toFixed(4)}: ` +
      `${(errVsDecimated * 100).toFixed(3)}% exceeds 1%`,
  ).toBeLessThan(0.01);
  expect(
    Math.abs(errVsFullRate),
    `FFT St ${r.st!.toFixed(4)} vs full-rate zero crossings ${stFullRate.toFixed(4)}: ` +
      `${(errVsFullRate * 100).toFixed(3)}% exceeds 1%`,
  ).toBeLessThan(0.01);
});
