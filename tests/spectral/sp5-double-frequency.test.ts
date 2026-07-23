import { expect, it } from 'vitest';
import { CHAR_CELLS, SHED_FREQ, U0, estimatorFrom, relErr, tone } from './helpers';

// SP-5 (spec §3): a Cd-like input — energy at 2·f_shed.
//
// THIS IS A DOCUMENTATION TEST, NOT A BUG REPORT. The drag coefficient of a
// shedding cylinder oscillates at twice the shedding frequency: each half
// cycle of the wake produces one drag maximum, regardless of which side the
// vortex left from. The estimator is a frequency estimator — fed Cd it
// faithfully returns 2·f, which the caller would then read as a doubled St.
//
// The contract this pins is on the *caller*: push Cl, never Cd. It is asserted
// here so that anyone who "fixes" the estimator to halve its answer breaks a
// test that explains why they must not.

it('SP-5: returns 2·f for a Cd-like input — the caller must pass Cl', () => {
  const est = estimatorFrom(2048, tone(2 * SHED_FREQ));
  const r = est.estimate(CHAR_CELLS, U0);

  expect(r.status).toBe('ok');
  const errVsDouble = relErr(r.frequency!, 2 * SHED_FREQ);
  process.stdout.write(
    `SP-5: input at 2·f = ${(2 * SHED_FREQ).toExponential(5)} 1/steps → ` +
      `estimator returns ${r.frequency!.toExponential(5)} ` +
      `(rel.err ${(errVsDouble * 100).toFixed(3)}%), i.e. St doubled to ` +
      `${r.st!.toFixed(4)} instead of ${((SHED_FREQ * CHAR_CELLS) / U0).toFixed(4)}\n`,
  );

  expect(Math.abs(errVsDouble)).toBeLessThan(0.01);
  // And emphatically not f: the doubling is silent, which is the whole point.
  expect(Math.abs(relErr(r.frequency!, SHED_FREQ))).toBeGreaterThan(0.5);
  expect(r.st!).toBeCloseTo((2 * SHED_FREQ * CHAR_CELLS) / U0, 3);
});
