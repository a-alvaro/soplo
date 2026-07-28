import { expect, it } from 'vitest';
import { StrouhalEstimator } from '../../src/physics/spectral';
import { CADENCE, CHAR_CELLS, SHED_FREQ, U0, tone } from './helpers';

// SP-12 (spec §Rev 2 b): pin the prominence threshold (raised 10 → 100 in
// rev 2) as behaviour, so a future change to it fails a test instead of
// passing silently. A tone whose peak-to-median prominence lands between the
// old and new thresholds must be rejected; a clearly prominent one accepted.
//
// Prominence is controlled by burying the tone in white noise: more noise
// lifts the in-band median and lowers peak/median. The two noise levels below
// were tuned to straddle 100 (they bracket it with margin; the exact figures
// are logged so a drift is visible).

it('SP-12: prominence between the old and new thresholds is rejected', () => {
  // Heavy noise: prominence in the 10–100 band that rev-1 would have accepted.
  const est = new StrouhalEstimator({ capacity: 4096, cadence: CADENCE });
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const signal = tone(SHED_FREQ);
  // Amplitude 6 noise drives prominence into the tens on this record.
  for (let i = 0; i < 4096; i++) est.push(signal(i) + 6 * rnd());
  const r = est.estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-12: heavy-noise prominence ${r.prominence.toFixed(1)} → status ${r.status}\n`,
  );

  expect(r.prominence).toBeGreaterThan(10); // rev-1 would have accepted this
  expect(r.prominence).toBeLessThan(100); // rev-2 rejects it
  expect(r.st).toBeNull();
  expect(r.status).toBe('no-peak');
});

it('SP-12: a clearly prominent tone is accepted', () => {
  const est = new StrouhalEstimator({ capacity: 4096, cadence: CADENCE });
  const signal = tone(SHED_FREQ);
  for (let i = 0; i < 4096; i++) est.push(signal(i));
  const r = est.estimate(CHAR_CELLS, U0);

  process.stdout.write(
    `SP-12: clean-tone prominence ${r.prominence.toFixed(0)} → status ${r.status}\n`,
  );

  expect(r.prominence).toBeGreaterThan(100);
  expect(r.status).toBe('ok');
});
