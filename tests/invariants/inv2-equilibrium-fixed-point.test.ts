import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';

// INV-2 (docs/specs/phase-1-validation.md §1.1): uniform flow at u0 with no
// obstacles is an equilibrium fixed point — after 1,000 steps nothing may
// have moved. The domain has no walls (top/bottom rows are fluid; their
// out-of-domain streaming directions keep their previous value, which for a
// uniform equilibrium state is exactly the equilibrium again) and the inlet
// prescribes the same (ρ=1, u=(u0,0)) equilibrium the field is initialised
// with, so the setup is periodic-equivalent in the spec's sense.
//
// Tolerance is the spec's, verbatim: max deviation of ρ and u ≤ 1e-10.
const TOL = 1e-10;
const STEPS = 1000;

it(`INV-2: uniform equilibrium is a fixed point over ${STEPS} steps`, () => {
  const Nx = 100;
  const Ny = 50;
  const u0 = 0.07;
  const solver = new LBMSolver({ Nx, Ny, tau: 0.8, u0 });
  solver.initialise(); // rho=1, u=(u0, 0) everywhere; no solids anywhere

  for (let s = 0; s < STEPS; s++) solver.iterate();

  let maxDev = 0;
  let worst = '';
  const { rho, ux, uy } = solver;
  for (let k = 0; k < Nx * Ny; k++) {
    const devs: [string, number][] = [
      ['rho', Math.abs(rho[k] - 1)],
      ['ux', Math.abs(ux[k] - u0)],
      ['uy', Math.abs(uy[k])],
    ];
    for (const [name, dev] of devs) {
      if (dev > maxDev) {
        maxDev = dev;
        worst = `${name} at node ${k}`;
      }
    }
  }

  expect(
    maxDev,
    `max deviation from the initial uniform state ${maxDev.toExponential(3)} (${worst}) exceeds ${TOL}`,
  ).toBeLessThanOrEqual(TOL);
});
