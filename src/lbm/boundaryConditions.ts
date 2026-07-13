// Boundary condition helpers for the D2Q9 LBM solver.
//
// These operate directly on the flat distribution buffer using the same
// indexing convention as LBMSolver: f[i * Nx*Ny + x*Ny + y].
//
// The no-slip walls (top/bottom) are not handled here — they are implemented
// by marking the boundary rows as solid, so half-way bounce-back inside the
// streaming step takes care of them.

import { Q, ex, ey, w } from './constants';

function feq(i: number, rho: number, ux: number, uy: number): number {
  const eu = ex[i] * ux + ey[i] * uy;
  const u2 = ux * ux + uy * uy;
  return w[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u2);
}

/**
 * Velocity inlet: prescribe equilibrium with rho=1, u=(u0, 0) at x=0.
 * Skips wall rows (y=0 and y=Ny-1) and any other solid cells in the inlet
 * column — overwriting them creates a physical contradiction that the
 * solver dissipates, suppressing asymmetry.
 */
export function applyInlet(
  f: Float32Array,
  Nx: number,
  Ny: number,
  u0: number,
  solid: Uint8Array,
): void {
  const NxNy = Nx * Ny;
  for (let y = 1; y < Ny - 1; y++) {
    const k = y;
    if (solid[k] === 1) continue;
    for (let i = 0; i < Q; i++) {
      f[i * NxNy + k] = feq(i, 1.0, u0, 0);
    }
  }
}

/** Outflow: copy populations from x=Nx-2 to x=Nx-1 (zero gradient). */
export function applyOutlet(f: Float32Array, Nx: number, Ny: number): void {
  const NxNy = Nx * Ny;
  for (let y = 0; y < Ny; y++) {
    const k = (Nx - 1) * Ny + y;
    const kPrev = (Nx - 2) * Ny + y;
    for (let i = 0; i < Q; i++) {
      f[i * NxNy + k] = f[i * NxNy + kPrev];
    }
  }
}
