import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';

// INV-3 (docs/specs/phase-1-validation.md §1.1): a centered cylinder in a
// mirror-symmetric domain at Re = 20 (steady regime) must produce a
// symmetric flow: Cl ≤ 1e-3·Cd and u_y antisymmetric about the centerline
// within 1e-6.
//
// Perturbation injection stays off simply by never calling
// injectPerturbation() — it is a public method invoked by the UI loop, not
// by the solver itself, so headless runs are unperturbed by construction.
//
// Geometry is chosen for exact mirror symmetry of the discrete setup:
// odd Ny so the centerline y_c = (Ny-1)/2 is a lattice row, integer cylinder
// center on that row. Any residual asymmetry then comes from the solver
// itself, not from the mask.

const STEPS = 6000; // ≈ 3.5 domain flow-throughs at u0 = 0.07 — steady at Re 20

it('INV-3: centered cylinder at Re 20 keeps the flow symmetric', () => {
  const Nx = 120;
  const Ny = 41; // odd → centerline at y = 20
  const yc = (Ny - 1) / 2;
  const D = 10; // diameter in cells
  const u0 = 0.07;
  // Re = u0·D/ν = 20 → ν = 0.042 → τ = 3ν + 0.5
  const nu = (u0 * D) / 20;
  const tau = 3 * nu + 0.5;

  const solver = new LBMSolver({ Nx, Ny, tau, u0 });
  solver.addWalls();
  solver.addCircle(Math.floor(Nx / 4), yc, D / 2);
  solver.initialise();

  for (let s = 0; s < STEPS; s++) solver.iterate();

  // --- Force symmetry: |Cl| ≤ 1e-3 · Cd ---
  const { Cd, Cl } = solver.computeForces(D);
  expect(Cd, `Cd = ${Cd} — expected positive drag on the cylinder`).toBeGreaterThan(0);
  expect(
    Math.abs(Cl),
    `|Cl| = ${Math.abs(Cl).toExponential(3)} exceeds 1e-3·Cd = ${(1e-3 * Cd).toExponential(3)}`,
  ).toBeLessThanOrEqual(1e-3 * Cd);

  // --- Field antisymmetry: u_y(x, yc+d) = −u_y(x, yc−d) within 1e-6 ---
  const { uy, solid } = solver;
  let maxAsym = 0;
  let worst = '';
  for (let x = 0; x < Nx; x++) {
    for (let d = 1; d <= yc; d++) {
      const kUp = x * Ny + (yc + d);
      const kDn = x * Ny + (yc - d);
      if (solid[kUp] !== 0 || solid[kDn] !== 0) continue;
      const asym = Math.abs(uy[kUp] + uy[kDn]);
      if (asym > maxAsym) {
        maxAsym = asym;
        worst = `x=${x}, d=${d}`;
      }
    }
  }

  expect(
    maxAsym,
    `max u_y antisymmetry violation ${maxAsym.toExponential(3)} (${worst}) exceeds 1e-6`,
  ).toBeLessThanOrEqual(1e-6);
});
