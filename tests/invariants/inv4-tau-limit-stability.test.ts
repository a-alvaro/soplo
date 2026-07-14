import { describe, expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';
import { TAU_STABLE_HI, TAU_STABLE_LO } from '../../src/physics/physicsToLBM';
import { firstNonFinite } from './helpers';

// INV-4 (docs/specs/phase-1-validation.md §1.1): a small cylinder case run
// for 10,000 steps at both ends of the stable τ band must stay finite —
// no NaN/Inf anywhere in f, ρ, u, and finite forces.
//
// τ values come from src/physics (the exact band the safety indicator
// promises the user). At τ = 0.51 with D = 8 the lattice Reynolds is
// u0·D/ν = 168 = 21·D — exactly the Re_safe ceiling the UI advertises as
// safe, so this doubles as a check that the advertised limit is honest.
//
// Step count (10,000) is fixed by the spec; the grid is sized to fit the
// fast-tier budget.
const STEPS = 10_000;

describe('INV-4: stability at the τ band limits', () => {
  it.each([
    ['low', TAU_STABLE_LO],
    ['high', TAU_STABLE_HI],
  ])(`stays finite for ${STEPS} steps at τ_%s`, (_label, tau) => {
    const Nx = 80;
    const Ny = 41;
    const D = 8;
    const solver = new LBMSolver({ Nx, Ny, tau, u0: 0.07 });
    solver.addWalls();
    solver.addCircle(20, 20, D / 2);
    solver.initialise();

    for (let s = 0; s < STEPS; s++) solver.iterate();

    for (const [name, arr] of [
      ['f', solver.f],
      ['rho', solver.rho],
      ['ux', solver.ux],
      ['uy', solver.uy],
    ] as const) {
      const bad = firstNonFinite(arr);
      expect(
        bad,
        `non-finite value in ${name} at flat index ${bad} after ${STEPS} steps at τ=${tau}`,
      ).toBe(-1);
    }

    const { Fx, Fy, Cd, Cl } = solver.computeForces(D);
    for (const [name, v] of [
      ['Fx', Fx],
      ['Fy', Fy],
      ['Cd', Cd],
      ['Cl', Cl],
    ] as const) {
      expect(Number.isFinite(v), `${name} = ${v} is not finite at τ=${tau}`).toBe(true);
    }
  });
});
