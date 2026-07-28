import { expect, it } from 'vitest';
import { StrouhalEstimator } from '../../src/physics/spectral';
import { CADENCE, CHAR_CELLS, SHED_FREQ, U0, pushSignal, relErr, tone } from './helpers';

// SP-8 (spec §3): reset() isolation — push sine A, reset, push sine B, recover
// B with no contamination from A.
//
// This is the guard behind the UI rule that the estimator must be reset
// wherever forceHistory is cleared and on every solver rebuild: a buffer
// spanning two configurations produces a peak belonging to neither.

const FREQ_A = SHED_FREQ;
const FREQ_B = 1.7 * SHED_FREQ;

it('SP-8: reset() drops the old record entirely', () => {
  const est = new StrouhalEstimator({ cadence: CADENCE });

  pushSignal(est, 2048, tone(FREQ_A, 3));
  const before = est.estimate(CHAR_CELLS, U0);
  expect(before.status).toBe('ok');
  expect(Math.abs(relErr(before.frequency!, FREQ_A))).toBeLessThan(0.01);

  est.reset();
  expect(est.length).toBe(0);
  expect(est.estimate(CHAR_CELLS, U0).status).toBe('filling');

  // Amplitude 1 against A's 3: any surviving A samples would dominate.
  pushSignal(est, 2048, tone(FREQ_B, 1));
  const after = est.estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-8: before reset f = ${before.frequency!.toExponential(5)}, after ` +
      `f = ${after.frequency!.toExponential(5)} (B = ${FREQ_B.toExponential(5)})\n`,
  );

  expect(after.status).toBe('ok');
  expect(Math.abs(relErr(after.frequency!, FREQ_B))).toBeLessThan(0.01);
});

it('SP-8: the ring buffer keeps only the newest `capacity` samples', () => {
  // Overfill by 3×: the record must be sine B alone, in the right order.
  //
  // Capacity 2,048 (not 1,024): under the rev-2 St cap the search band is only
  // ~11 bins wide at cap 1,024, so a pure tone near the upper edge sees its own
  // skirt inflate the in-band median and prominence falls to ~44 — below the
  // rev-2 threshold of 100. That is a synthetic-tone artifact of a tiny band,
  // not an app condition (a real limit cycle at cap 4,096 gives O(10⁴)); 2,048
  // widens the band enough to measure isolation, which is what SP-8 is for.
  const CAP = 2048;
  const est = new StrouhalEstimator({ capacity: CAP, cadence: CADENCE });
  pushSignal(est, 3 * CAP, tone(FREQ_A, 3));
  pushSignal(est, CAP, tone(FREQ_B, 1));

  const r = est.estimate(CHAR_CELLS, U0);
  expect(est.length).toBe(CAP);
  expect(r.status).toBe('ok');
  expect(Math.abs(relErr(r.frequency!, FREQ_B))).toBeLessThan(0.01);
});
