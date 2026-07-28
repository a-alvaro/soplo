import { expect, it } from 'vitest';
import { CHAR_CELLS, SHED_FREQ, U0, estimatorFrom, relErr, tone } from './helpers';

// SP-10 / SP-11 (spec §Rev 2, findings F2 + F3): the rev-2 search band, capped
// in Strouhal space at ST_MAX = 0.35, must reject the impulsive-start acoustic
// box mode while still recovering genuine shedding. Neither test alone proves
// anything: SP-10 could pass by rejecting everything, SP-11 could pass by
// accepting everything. Together they are the discrimination test.
//
// The offending mode in the 1.3a smoke sat at St ≈ 1.2 (a period of ≈ 116
// steps at D = 10). Scaled to the BM-3 test setup (D = 30, u0 = 0.07) that is
// f = 1.2·u0/D. The shedding tone is at St 0.165 (SHED_FREQ). Both are pushed
// as clean, prominent tones — the point is that the band, not the prominence
// gate, is what separates them by frequency.

const BOX_MODE_ST = 1.2;
const BOX_MODE_FREQ = (BOX_MODE_ST * U0) / CHAR_CELLS;

it('SP-10: a box-mode tone at St 1.2 is rejected (above the St cap)', () => {
  const r = estimatorFrom(2048, tone(BOX_MODE_FREQ)).estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-10: tone at St ${BOX_MODE_ST} (f = ${BOX_MODE_FREQ.toExponential(4)} 1/steps) ` +
      `→ status ${r.status}, st ${r.st === null ? 'null' : r.st.toFixed(4)}\n`,
  );

  // Above ST_MAX the tone falls outside the search band entirely, so no peak is
  // found there and the in-band content is featureless.
  expect(r.st).toBeNull();
  expect(['no-peak', 'band-edge', 'filling']).toContain(r.status);
});

it('SP-11: a shedding tone at St 0.165 is recovered within 1%', () => {
  const r = estimatorFrom(2048, tone(SHED_FREQ)).estimate(CHAR_CELLS, U0);

  const stExpected = (SHED_FREQ * CHAR_CELLS) / U0;
  process.stdout.write(
    `SP-11: tone at St ${stExpected.toFixed(4)} → status ${r.status}, ` +
      `st ${r.st!.toFixed(4)}, prominence ${r.prominence.toFixed(1)}\n`,
  );

  expect(r.status).toBe('ok');
  expect(r.st).not.toBeNull();
  expect(Math.abs(relErr(r.st!, stExpected))).toBeLessThan(0.01);
});
