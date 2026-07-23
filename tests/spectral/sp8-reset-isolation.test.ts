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
  const est = new StrouhalEstimator({ capacity: 1024, cadence: CADENCE });
  pushSignal(est, 3072, tone(FREQ_A, 3));
  pushSignal(est, 1024, tone(FREQ_B, 1));

  const r = est.estimate(CHAR_CELLS, U0);
  expect(est.length).toBe(1024);
  expect(r.status).toBe('ok');
  expect(Math.abs(relErr(r.frequency!, FREQ_B))).toBeLessThan(0.01);
});
