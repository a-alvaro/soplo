import { expect, it } from 'vitest';
import {
  CADENCE,
  CHAR_CELLS,
  TEST_FREQ,
  U0,
  estimatorFrom,
  relErr,
  tone,
} from './helpers';

// SP-2 (spec §3): pure sine at a non-round frequency, 4.27e-4 1/steps
// (St 0.183, inside the rev-2 St cap). Acceptance: recovered frequency
// within 1%.
//
// The non-roundness is the point. A missing `cadence` division is a factor-20
// error — 2,000% against a 1% gate, i.e. 20× margin — and a stray 2π is
// larger still; a round frequency could hide either by aliasing onto a valid
// answer. St is checked alongside f because it is what the user reads.

it('SP-2: recovers a non-round pure tone within 1%', () => {
  // 2,048 samples hold ≈ 17 periods at the rev-2 frequency (St 0.183),
  // comfortably above the 6-period guard.
  const N = 2048;
  const est = estimatorFrom(N, tone(TEST_FREQ));
  const r = est.estimate(CHAR_CELLS, U0);

  expect(r.status).toBe('ok');
  expect(r.frequency).not.toBeNull();

  const fErr = relErr(r.frequency!, TEST_FREQ);
  const stExpected = (TEST_FREQ * CHAR_CELLS) / U0;
  const stErr = relErr(r.st!, stExpected);

  process.stdout.write(
    `SP-2: f = ${r.frequency!.toExponential(5)} 1/steps (expected ` +
      `${TEST_FREQ.toExponential(5)}, rel.err ${(fErr * 100).toFixed(3)}%), ` +
      `St = ${r.st!.toFixed(4)} (expected ${stExpected.toFixed(4)}), ` +
      `periods = ${r.periods.toFixed(1)}, prominence = ${r.prominence.toFixed(1)}\n`,
  );

  expect(Math.abs(fErr), `frequency rel.err ${(fErr * 100).toFixed(3)}% exceeds 1%`).toBeLessThan(0.01);
  expect(Math.abs(stErr)).toBeLessThan(0.01);

  // Periods held by the record — the sample-domain sanity check on cadence.
  expect(r.periods).toBeCloseTo(N * TEST_FREQ * CADENCE, 0);
});
