import { expect, it } from 'vitest';
import { mulberry32 } from '../invariants/helpers';
import { CHAR_CELLS, U0, estimatorFrom } from './helpers';

// SP-7 (spec §3): broadband noise, no tone → st === null, status 'no-peak'.
//
// The prominence guard is peak/median of the in-band magnitudes < 10. For
// Rayleigh-distributed noise magnitudes the largest of ~1,000 bins sits around
// 3–4× the median, an order of magnitude below a saturated limit cycle. This
// is the test that keeps a pre-shedding or steady wake from displaying a
// meaningless St.

it('SP-7: reports no-peak on broadband noise', () => {
  const rand = mulberry32(0x1234);
  const r = estimatorFrom(2048, () => rand() * 2 - 1).estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-7: status ${r.status}, prominence = ${r.prominence.toFixed(2)} ` +
      `(threshold 100)\n`,
  );

  expect(r.status).toBe('no-peak');
  expect(r.st).toBeNull();
  expect(r.frequency).toBeNull();
  expect(r.prominence).toBeLessThan(10);
});
