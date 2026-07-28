// Shared fixtures for the spectral tier (docs/specs/phase-1-3a-strouhal-fft.md §3).

import { StrouhalEstimator } from '../../src/physics/spectral';

/** Solver steps per sample — the forceHistory tick the estimator assumes. */
export const CADENCE = 20;

/** Lattice inlet velocity (AGENTS.md invariant). */
export const U0 = 0.07;

/** Cylinder diameter in cells, matching the official BM-3 setup. */
export const CHAR_CELLS = 30;

/**
 * Frequency used by SP-2's cadence-conversion check, in 1/steps. Deliberately
 * non-round: round frequencies let a missing factor-`cadence` or a stray 2π
 * pass by landing back on a valid bin by coincidence (spec §3, SP-2).
 *
 * Rev 2: this was 0.0137 (St 5.87), chosen as a near-Nyquist stress case when
 * the search band had no physical upper edge. The rev-2 St cap (ST_MAX = 0.35,
 * spec §Rev 2 a) now correctly rejects anything that fast, so the tone moves
 * inside the band: 4.27e-4 1/steps is St 0.1830 at the BM-3 setup — non-round
 * in both f and St (bin 8.74 at cap 1024, not integer), so it still catches a
 * factor-20 or 2π error, which is all SP-2 exists to do.
 */
export const TEST_FREQ = 4.27e-4;

/**
 * A realistic shedding frequency in 1/steps for the official BM-3 setup:
 * f = St·u0/D with St = 0.165, i.e. ≈ 3.85·10⁻⁴ (a period of ≈ 2,600 steps).
 *
 * SP-2 pins the cadence conversion with the mandated non-round 0.0137; the
 * remaining tests run here instead, three orders of magnitude lower, where the
 * pipeline actually operates — a drift skirt or a noise floor competes with a
 * peak at 0.0077 cycles/sample in a way it never does at 0.274. It also keeps
 * 2·f (SP-5) below Nyquist, which 2·0.0137 is not.
 */
export const SHED_FREQ = (0.165 * U0) / CHAR_CELLS;

/**
 * A sampled sinusoid at `freqPerStep` (1/steps). Sample i is taken at solver
 * step i·CADENCE, which is exactly what the app's 20-step tick produces.
 */
export function tone(
  freqPerStep: number,
  amp = 1,
  phase = 0,
): (i: number) => number {
  return (i) => amp * Math.sin(2 * Math.PI * freqPerStep * CADENCE * i + phase);
}

/** Push `n` samples of `signal` into `est`. */
export function pushSignal(
  est: StrouhalEstimator,
  n: number,
  signal: (i: number) => number,
): void {
  for (let i = 0; i < n; i++) est.push(signal(i));
}

/** Estimator wired to the app's cadence, fed `n` samples of `signal`. */
export function estimatorFrom(
  n: number,
  signal: (i: number) => number,
  capacity = 4096,
): StrouhalEstimator {
  const est = new StrouhalEstimator({ capacity, cadence: CADENCE });
  pushSignal(est, n, signal);
  return est;
}

/** Signed relative error of `measured` against `expected`. */
export function relErr(measured: number, expected: number): number {
  return (measured - expected) / expected;
}
