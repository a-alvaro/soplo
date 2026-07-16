import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';

// INV-6 (docs/specs/phase-1-2b-boundary-conditions.md, rev 3): mass
// stationarity in a driven channel — the regression guard for the Phase 1.2
// failure mode (inlet pinning pressure + anchorless outlet → secular
// pressurization until the flow chokes). Two gates over the last 40,000 of
// 50,000 steps:
//  - secular trend: |linear-fit slope of ρ_mean| ≤ 1e-9 per step;
//  - mean offset, physics-referenced (rev 3): with the outlet anchored at
//    ρ = 1 the domain mean must sit above 1 by half the analytic Poiseuille
//    ramp Δρ = 36·ν·ū·L/H²: |ρ_mean − (1 + Δρ/2)| ≤ 0.5·(Δρ/2). The 50%
//    margin absorbs entrance-region overpressure; the 1.2 failure mode
//    (drift to ρ ≈ 1.22, ~20× the predicted offset) still fails by an
//    order of magnitude.
const NY = 50; // rows 0 and 49 are walls; H = 48 fluid rows
const NX = 120;
const H = NY - 2;
const U0 = 0.07;
// Re_H = u_mean·H/ν = 20 with u_mean = u0 (uniform inlet, mass conservation)
const NU = (U0 * H) / 20;
const TAU = 3 * NU + 0.5;
const TOTAL_STEPS = 50_000;
const WINDOW_START = 10_000; // measure over the last 40,000 steps
const SAMPLE_EVERY = 50;
const SLOPE_TOL = 1e-9; // per step
// Analytic Poiseuille ramp for this case (lattice units, p = ρ/3): the
// domain-mean density must sit half the ramp above the outlet reference.
const DRHO = (36 * NU * U0 * NX) / (H * H);
const MEAN_PREDICTED = 1 + DRHO / 2;
const MEAN_TOL = 0.5 * (DRHO / 2);

it(`INV-6: domain-mean density is stationary over a ${TOTAL_STEPS}-step driven channel`, { timeout: 120_000 }, () => {
  const solver = new LBMSolver({ Nx: NX, Ny: NY, tau: TAU, u0: U0 });
  solver.addWalls();
  solver.initialise();

  const steps: number[] = [];
  const means: number[] = [];
  const { rho, solid } = solver;
  let nFluid = 0;
  for (let k = 0; k < NX * NY; k++) if (solid[k] === 0) nFluid++;

  for (let s = 1; s <= TOTAL_STEPS; s++) {
    solver.iterate();
    if (s > WINDOW_START && s % SAMPLE_EVERY === 0) {
      let sum = 0;
      for (let k = 0; k < NX * NY; k++) {
        if (solid[k] === 0) sum += rho[k];
      }
      steps.push(s);
      means.push(sum / nFluid);
    }
  }

  // Least-squares linear fit of mean density vs step number.
  const n = steps.length;
  const tBar = steps.reduce((a, b) => a + b, 0) / n;
  const rBar = means.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (steps[i] - tBar) * (means[i] - rBar);
    sxx += (steps[i] - tBar) * (steps[i] - tBar);
  }
  const slope = sxy / sxx;

  expect(
    Math.abs(slope),
    `secular density trend ${slope.toExponential(3)}/step exceeds ${SLOPE_TOL} ` +
      `(window mean ρ = ${rBar.toFixed(6)}, ${n} samples)`,
  ).toBeLessThanOrEqual(SLOPE_TOL);
  expect(
    Math.abs(rBar - MEAN_PREDICTED),
    `window-mean density ${rBar.toFixed(6)} deviates from the analytic ` +
      `prediction ${MEAN_PREDICTED.toFixed(6)} (Δρ/2 = ${(DRHO / 2).toExponential(3)}) ` +
      `by more than ${MEAN_TOL.toExponential(3)}`,
  ).toBeLessThanOrEqual(MEAN_TOL);
});
