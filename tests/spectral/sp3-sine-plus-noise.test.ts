import { expect, it } from 'vitest';
import { mulberry32 } from '../invariants/helpers';
import { CHAR_CELLS, SHED_FREQ, U0, estimatorFrom, relErr, tone } from './helpers';

// SP-3 (spec §3): sine + white noise at 20 dB SNR. Acceptance: within 1%.
//
// 20 dB is a power ratio of 100, i.e. an amplitude ratio of 10: unit-amplitude
// tone, noise σ = 0.1. Seeded PRNG — the fast tier must be reproducible.

it('SP-3: recovers a tone buried in 20 dB SNR white noise within 1%', () => {
  const rand = mulberry32(0x2f00);
  const clean = tone(SHED_FREQ);
  // A sum of 12 uniforms, σ exactly 1 — adequate here and keeps the generator
  // dependency-free.
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += rand();
    return s - 6;
  };
  const est = estimatorFrom(2048, (i) => clean(i) + 0.1 * gauss());
  const r = est.estimate(CHAR_CELLS, U0);

  expect(r.status).toBe('ok');
  const fErr = relErr(r.frequency!, SHED_FREQ);
  process.stdout.write(
    `SP-3: f = ${r.frequency!.toExponential(5)} 1/steps, rel.err ` +
      `${(fErr * 100).toFixed(3)}%, prominence = ${r.prominence.toFixed(1)}\n`,
  );
  expect(Math.abs(fErr), `frequency rel.err ${(fErr * 100).toFixed(3)}% exceeds 1%`).toBeLessThan(0.01);
});
