import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';
import { Q } from '../../src/lbm/constants';
import { mulberry32, nodeMoments } from './helpers';

// INV-1 (docs/specs/phase-1-validation.md §1.1): a single collision step must
// conserve per-node density and momentum — the MRT conserved moments (ρ, jx,
// jy) relax onto themselves and may not change.
//
// Tolerance is the spec's, verbatim: per-node relative error ≤ 1e-12.
const TOL = 1e-12;

it('INV-1: collision conserves per-node mass and momentum', () => {
  const Nx = 24;
  const Ny = 16;
  const NxNy = Nx * Ny;
  const solver = new LBMSolver({ Nx, Ny, tau: 0.8, u0: 0.07 });

  // Randomized valid state: equilibrium at ρ ∈ [0.95, 1.05] and velocity
  // components with |u| ∈ [0.01, 0.05] (bounded away from zero so relative
  // momentum error is well defined), plus ±5% non-equilibrium noise per
  // population. All populations stay positive and Ma stays low.
  const rand = mulberry32(0x501f10);
  for (let k = 0; k < NxNy; k++) {
    const rho = 0.95 + 0.1 * rand();
    const ux = (rand() < 0.5 ? -1 : 1) * (0.01 + 0.04 * rand());
    const uy = (rand() < 0.5 ? -1 : 1) * (0.01 + 0.04 * rand());
    for (let i = 0; i < Q; i++) {
      solver.f[i * NxNy + k] =
        LBMSolver.feq(i, rho, ux, uy) * (1 + 0.05 * (2 * rand() - 1));
    }
  }

  const before = new Array<{ rho: number; jx: number; jy: number }>(NxNy);
  for (let k = 0; k < NxNy; k++) before[k] = nodeMoments(solver.f, NxNy, k);

  solver['collide']();

  let maxErr = 0;
  let worst = '';
  for (let k = 0; k < NxNy; k++) {
    const a = nodeMoments(solver.f, NxNy, k);
    const b = before[k];
    const errs: [string, number][] = [
      ['rho', Math.abs(a.rho - b.rho) / Math.abs(b.rho)],
      ['jx', Math.abs(a.jx - b.jx) / Math.abs(b.jx)],
      ['jy', Math.abs(a.jy - b.jy) / Math.abs(b.jy)],
    ];
    for (const [name, err] of errs) {
      if (err > maxErr) {
        maxErr = err;
        worst = `${name} at node ${k}`;
      }
    }
  }

  expect(
    maxErr,
    `max per-node relative conservation error ${maxErr.toExponential(3)} (${worst}) exceeds ${TOL}`,
  ).toBeLessThanOrEqual(TOL);
});
