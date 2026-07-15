import { expect, it } from 'vitest';
import { Q, w } from '../../src/lbm/constants';
import { applyInlet, applyOutlet } from '../../src/lbm/boundaryConditions';
import { mulberry32, nodeMoments } from './helpers';

// BC-1 (docs/specs/phase-1-2b-boundary-conditions.md): the Zou–He boundary
// pair must reproduce its prescribed moments exactly on arbitrary valid
// populations — this pins the direction-index mapping, the #1 bug risk of
// the change. After applying the inlet to a column of randomized positive
// populations, every fluid inlet node must have u = (u0, 0) to ≤ 1e-12 and
// ρ equal to the Zou–He density formula; the outlet must have ρ = 1 and
// uy = 0 to the same tolerance. Solid cells in both columns stay untouched.
const TOL = 1e-12;

const Nx = 8;
const Ny = 12;
const NxNy = Nx * Ny;
const u0 = 0.07;

/** Randomized positive populations: equilibrium-magnitude with ±20% noise. */
function randomPopulations(seed: number): Float64Array {
  const rand = mulberry32(seed);
  const f = new Float64Array(Q * NxNy);
  for (let i = 0; i < Q; i++) {
    for (let k = 0; k < NxNy; k++) {
      f[i * NxNy + k] = w[i] * (0.8 + 0.4 * rand());
    }
  }
  return f;
}

/** Walls on rows y=0 and y=Ny-1, as the solver lays them out. */
function wallSolid(): Uint8Array {
  const solid = new Uint8Array(NxNy);
  for (let x = 0; x < Nx; x++) {
    solid[x * Ny + 0] = 1;
    solid[x * Ny + (Ny - 1)] = 1;
  }
  return solid;
}

it('BC-1: Zou–He inlet reproduces u=(u0,0) and the free-density formula exactly', () => {
  const f = randomPopulations(20260715);
  const solid = wallSolid();
  const before = f.slice();

  applyInlet(f, Nx, Ny, u0, solid);

  for (let y = 1; y < Ny - 1; y++) {
    const k = y; // x = 0
    // Free density from the knowns (i = C,N,S,W,NW,SW — untouched by the BC).
    const known =
      f[0 * NxNy + k] +
      f[2 * NxNy + k] +
      f[4 * NxNy + k] +
      2 * (f[3 * NxNy + k] + f[6 * NxNy + k] + f[7 * NxNy + k]);
    const rhoFormula = known / (1 - u0);

    const { rho, jx, jy } = nodeMoments(f, NxNy, k);
    expect(Math.abs(rho - rhoFormula), `inlet rho at y=${y}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(jx / rho - u0), `inlet ux at y=${y}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(jy / rho), `inlet uy at y=${y}`).toBeLessThanOrEqual(TOL);
  }

  // Wall rows of the inlet column must be untouched.
  for (const y of [0, Ny - 1]) {
    for (let i = 0; i < Q; i++) {
      expect(f[i * NxNy + y], `inlet wall population i=${i}, y=${y}`).toBe(
        before[i * NxNy + y],
      );
    }
  }
});

it('BC-1: Zou–He outlet reproduces rho=1 and uy=0 exactly', () => {
  const f = randomPopulations(715202606);
  const solid = wallSolid();
  const before = f.slice();

  applyOutlet(f, Nx, Ny, solid);

  for (let y = 1; y < Ny - 1; y++) {
    const k = (Nx - 1) * Ny + y;
    const { rho, jy } = nodeMoments(f, NxNy, k);
    expect(Math.abs(rho - 1), `outlet rho at y=${y}`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(jy / rho), `outlet uy at y=${y}`).toBeLessThanOrEqual(TOL);
  }

  // Wall rows of the outlet column must be untouched.
  for (const y of [0, Ny - 1]) {
    const k = (Nx - 1) * Ny + y;
    for (let i = 0; i < Q; i++) {
      expect(f[i * NxNy + k], `outlet wall population i=${i}, y=${y}`).toBe(
        before[i * NxNy + k],
      );
    }
  }
});
