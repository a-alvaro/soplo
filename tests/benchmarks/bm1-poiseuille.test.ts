import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';
import { printReport } from './helpers';

// BM-1 (docs/specs/phase-1-validation.md §1.2): developed plane Poiseuille
// flow vs the exact analytic parabola — validates viscosity, half-way
// bounce-back wall placement and the velocity BCs in one shot.
//
// Half-cell bookkeeping (part of the test per spec): solver rows 0 and
// Ny_solver−1 are solid, fluid rows are 1..50. With half-way bounce-back the
// physical walls sit at lattice y = 0.5 and y = 50.5, so the analytic channel
// height is H = 50 and the wall-normal coordinate of fluid row y is
// ŷ = y − 0.5 ∈ (0, H). The parabola has zeros exactly at ŷ = 0 and ŷ = H
// and peak 1.5·u_mean at midchannel.

const H = 50; // analytic channel height = fluid rows
const NY = H + 2; // + two solid wall rows
const NX = 6 * H; // spec: channel length 6·H
const X_MEASURE = 5 * H; // spec requires x ≥ 4·H (L_e ≈ 1·H at Re_H = 20)
const U0 = 0.07;
// Re_H = u_mean·H/ν = 20 with u_mean = u0 (uniform inlet, mass conservation)
const NU = (U0 * H) / 20;
const TAU = 3 * NU + 0.5;
const CONV_INTERVAL = 500; // spec: profile change ≤ 1e-8 over 500 steps
const CONV_TOL = 1e-8;
// Safety cap; convergence failure is a finding. The transient is long: the
// velocity-inlet / zero-gradient-outlet pair adjusts the global density
// field on a much slower timescale than the profile itself (measured: the
// change metric plateaus at ~7e-2 for 100k+ steps before decaying).
const MAX_STEPS = 500_000;

function profileAt(solver: LBMSolver, x: number): number[] {
  const out: number[] = [];
  for (let y = 1; y <= H; y++) out.push(solver.ux[x * NY + y]);
  return out;
}

it('BM-1: developed Poiseuille profile matches the analytic parabola (L2 ≤ 1%)', { timeout: 15 * 60_000 }, () => {
  const solver = new LBMSolver({ Nx: NX, Ny: NY, tau: TAU, u0: U0 });
  solver.addWalls();
  solver.initialise();

  // Run to steadiness: max relative change of the measured profile over
  // 500-step windows ≤ 1e-8.
  let prev = profileAt(solver, X_MEASURE);
  let converged = false;
  let steps = 0;
  while (steps < MAX_STEPS) {
    for (let s = 0; s < CONV_INTERVAL; s++) solver.iterate();
    steps += CONV_INTERVAL;
    const cur = profileAt(solver, X_MEASURE);
    let maxRel = 0;
    for (let i = 0; i < cur.length; i++) {
      maxRel = Math.max(maxRel, Math.abs(cur[i] - prev[i]) / Math.abs(prev[i]));
    }
    prev = cur;
    if (maxRel <= CONV_TOL) {
      converged = true;
      break;
    }
  }
  expect(converged, `profile did not converge to ${CONV_TOL} within ${MAX_STEPS} steps`).toBe(true);

  // L2 relative error vs analytic parabola, flux-matched via the measured
  // mean (compressibility shifts the local flux slightly; the profile shape
  // is what the analytic solution constrains).
  const u = prev;
  const uMean = u.reduce((a, b) => a + b, 0) / u.length;
  let num = 0;
  let den = 0;
  for (let y = 1; y <= H; y++) {
    const yHat = y - 0.5;
    const ua = ((6 * uMean) / (H * H)) * yHat * (H - yHat);
    const d = u[y - 1] - ua;
    num += d * d;
    den += ua * ua;
  }
  const l2 = Math.sqrt(num / den);
  const uPeak = Math.max(...u);

  printReport(
    'BM-1 · Plane Poiseuille, Re_H = 20',
    `channel ${NX}×${NY} (H = ${H} fluid rows, walls at ŷ = 0 and ŷ = H), τ = ${TAU.toFixed(3)}, ` +
      `profile at x = ${X_MEASURE} = 5H, converged after ${steps} steps`,
    [
      {
        label: 'L2(u_x profile vs analytic parabola)',
        measured: `${(l2 * 100).toFixed(3)}%`,
        literature: 'exact solution (tolerance 1%)',
        relError: `${(l2 * 100).toFixed(3)}%`,
        pass: l2 <= 0.01,
      },
      {
        label: 'peak/mean ratio (analytic: 1.500)',
        measured: (uPeak / uMean).toFixed(4),
        literature: '1.500',
        relError: `${((uPeak / uMean / 1.5 - 1) * 100).toFixed(2)}%`,
        pass: true, // informative — gated by the L2 norm above
      },
    ],
  );

  expect(l2, `L2 relative error ${(l2 * 100).toFixed(3)}% exceeds 1%`).toBeLessThanOrEqual(0.01);
});
