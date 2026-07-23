import { expect, it } from 'vitest';
import { CHAR_CELLS, SHED_FREQ, U0, estimatorFrom, relErr, tone } from './helpers';

// SP-4 (spec §3): sine + slow linear drift. Acceptance: within 1%.
//
// This is the mean-removal and windowing test. A drifting baseline is what a
// real Cl trace does while the wake is still saturating; without mean removal
// and the Hann taper its low-frequency skirt leaks across the band and can
// outrank the shedding peak — and at 0.0077 cycles/sample the peak sits close
// enough to DC for that to be a live risk. The drift spans 4× the tone
// amplitude over the record, far beyond anything a settled limit cycle shows.

it('SP-4: recovers a tone under a slow linear drift within 1%', () => {
  const N = 2048;
  const clean = tone(SHED_FREQ);
  const est = estimatorFrom(N, (i) => clean(i) + (4 * i) / N - 2);
  const r = est.estimate(CHAR_CELLS, U0);

  expect(r.status).toBe('ok');
  const fErr = relErr(r.frequency!, SHED_FREQ);
  process.stdout.write(
    `SP-4: f = ${r.frequency!.toExponential(5)} 1/steps, rel.err ` +
      `${(fErr * 100).toFixed(3)}%, prominence = ${r.prominence.toFixed(1)}\n`,
  );
  expect(Math.abs(fErr), `frequency rel.err ${(fErr * 100).toFixed(3)}% exceeds 1%`).toBeLessThan(0.01);
});
