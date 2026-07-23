import { expect, it } from 'vitest';
import { CADENCE, CHAR_CELLS, SHED_FREQ, U0, estimatorFrom, tone } from './helpers';

// SP-6 (spec §3): partial fill below 6 periods → st === null, status
// 'filling'.
//
// The search band's lower edge is 6/(L·cadence) 1/steps, i.e. exactly six
// periods in the record. A tone slower than that falls below the band and the
// dominant bin lands outside it — there is nothing to resolve yet, and the
// honest answer is "still filling", not a number.
//
// 500 samples hold 500·20·3.85e-4 ≈ 3.85 periods; 900 hold ≈ 6.9 and must
// produce a number. The transition between the two is the guard.

it('SP-6: reports filling below 6 periods and recovers above it', () => {
  const short = estimatorFrom(500, tone(SHED_FREQ)).estimate(CHAR_CELLS, U0);
  const long = estimatorFrom(900, tone(SHED_FREQ)).estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-6: L = 500 → ${short.status}, periods ≈ ${short.periods.toFixed(2)} | ` +
      `L = 900 → ${long.status}, periods ≈ ${long.periods.toFixed(2)}\n`,
  );

  expect(short.status).toBe('filling');
  expect(short.st).toBeNull();
  expect(short.frequency).toBeNull();
  expect(500 * CADENCE * SHED_FREQ).toBeLessThan(6);

  expect(long.status).toBe('ok');
  expect(long.st).not.toBeNull();
  expect(long.periods).toBeGreaterThan(6);
});

it('SP-6: an empty estimator is filling, not a crash', () => {
  const r = estimatorFrom(0, () => 0).estimate(CHAR_CELLS, U0);
  expect(r.status).toBe('filling');
  expect(r.st).toBeNull();
  expect(r.periods).toBe(0);
});
