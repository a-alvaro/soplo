import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';

// BC-2 (docs/specs/phase-1-2c-benchmark-fidelity.md): the free-slip
// (specular-reflection) side-wall mode must (i) admit uniform flow
// u = (u0, 0) as an exact fixed point — no wall boundary layer forms, unlike
// bounce-back where the wall drags the tangential flow — and (ii) drain no
// tangential (x) momentum at the wall rows. This pins the y-mirror
// reflection mapping the same way BC-1 pinned the Zou–He direction mapping.
//
// Tolerances are the spec's, verbatim: (i) max deviation of ρ and u ≤ 1e-10
// over 1,000 steps; (ii) net tangential momentum flux at the wall rows
// ≤ 1e-12 per step.
const DEV_TOL = 1e-10;
const FLUX_TOL = 1e-12;
const STEPS = 1000;

const Nx = 100;
const Ny = 50;
const u0 = 0.07;

function buildFreeSlipChannel(): LBMSolver {
  const solver = new LBMSolver({ Nx, Ny, tau: 0.8, u0, sideWalls: 'free-slip' });
  solver.addWalls(); // walls present — that is the point of the test
  solver.initialise(); // rho=1, u=(u0, 0) on fluid nodes; no obstacle
  return solver;
}

/**
 * Tangential (x) momentum carried INTO the walls by the populations that
 * will hit them during the next streaming step. Only in-domain wall targets
 * count; ex = 0 directions (N/S) carry no tangential momentum and are
 * omitted. Reads f as-is: at the uniform fixed point collision is the
 * identity, so pre-iterate populations equal the post-collision ones that
 * actually stream (to round-off) — the regime this test runs in.
 */
function tangentialMomentumIn(solver: LBMSolver): number {
  const { f } = solver;
  const NxNy = Nx * Ny;
  let px = 0;
  for (let x = 0; x < Nx; x++) {
    const kBot = x * Ny + 1; // row adjacent to the bottom wall (y=0)
    const kTop = x * Ny + (Ny - 2); // row adjacent to the top wall (y=Ny-1)
    // Bottom wall: SW (i=7, ex=-1) hits (x-1,0); SE (i=8, ex=+1) hits (x+1,0).
    if (x >= 1) px -= f[7 * NxNy + kBot];
    if (x <= Nx - 2) px += f[8 * NxNy + kBot];
    // Top wall: NW (i=6, ex=-1) hits (x-1,Ny-1); NE (i=5, ex=+1) hits (x+1,Ny-1).
    if (x >= 1) px -= f[6 * NxNy + kTop];
    if (x <= Nx - 2) px += f[5 * NxNy + kTop];
  }
  return px;
}

/**
 * Tangential (x) momentum carried OUT of the walls by the populations the
 * wall-adjacent rows just received from them. Must be read right after
 * iterate(): the received values sit in f and the inlet/outlet handlers do
 * not touch any direction/column combination included here.
 */
function tangentialMomentumOut(solver: LBMSolver): number {
  const { f } = solver;
  const NxNy = Nx * Ny;
  let px = 0;
  for (let x = 0; x < Nx; x++) {
    const kBot = x * Ny + 1;
    const kTop = x * Ny + (Ny - 2);
    // From the bottom wall: NE (i=5) came off (x-1,0); NW (i=6) off (x+1,0).
    if (x >= 1) px += f[5 * NxNy + kBot];
    if (x <= Nx - 2) px -= f[6 * NxNy + kBot];
    // From the top wall: SE (i=8) came off (x-1,Ny-1); SW (i=7) off (x+1,Ny-1).
    if (x >= 1) px += f[8 * NxNy + kTop];
    if (x <= Nx - 2) px -= f[7 * NxNy + kTop];
  }
  return px;
}

it(`BC-2: uniform flow is an exact fixed point of free-slip walls over ${STEPS} steps`, () => {
  const solver = buildFreeSlipChannel();

  for (let s = 0; s < STEPS; s++) solver.iterate();

  let maxDev = 0;
  let worst = '';
  const { rho, ux, uy, solid } = solver;
  for (let k = 0; k < Nx * Ny; k++) {
    if (solid[k] !== 0) continue;
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
    `max deviation from the uniform state ${maxDev.toExponential(3)} (${worst}) exceeds ${DEV_TOL} — a wall boundary layer is forming`,
  ).toBeLessThanOrEqual(DEV_TOL);
});

it(`BC-2: free-slip walls drain no tangential momentum (≤ ${FLUX_TOL}/step)`, () => {
  const solver = buildFreeSlipChannel();

  let maxDrain = 0;
  for (let s = 0; s < STEPS; s++) {
    const pxIn = tangentialMomentumIn(solver);
    solver.iterate();
    const pxOut = tangentialMomentumOut(solver);
    maxDrain = Math.max(maxDrain, Math.abs(pxIn - pxOut));
  }

  expect(
    maxDrain,
    `walls drained up to ${maxDrain.toExponential(3)} x-momentum in one step, exceeding ${FLUX_TOL}`,
  ).toBeLessThanOrEqual(FLUX_TOL);
});
