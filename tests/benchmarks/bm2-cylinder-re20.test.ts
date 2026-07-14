import { expect, it } from 'vitest';
import { BLOCKAGE, CYL, buildCylinderCase, printReport } from './helpers';

// BM-2 (docs/specs/phase-1-validation.md §1.2): circular cylinder at Re = 20
// — steady flow with a closed recirculation bubble.
//
// Literature (unbounded flow): Cd ≈ 2.05 (reported range ~2.0–2.1),
// recirculation length L_r/D ≈ 0.92. Acceptance: Cd within ±6% of 2.05
// (1.93–2.17), |Cl| ≤ 0.01; L_r/D is informative, not gating.
//
// Cd/Cl come from solver.computeForces() — the exact code path the UI uses
// (spec §1.2 forbids test-local normalization). Sign convention per
// docs/specs/cl-sign-convention.md: lattice +x downstream, +y physical up,
// Cd = +Fx, Cl = +Fy.
//
// Perturbation injection off: injectPerturbation() is UI-driven and never
// called here.

const RE = 20;
const CONV_INTERVAL = 1000; // spec: Cd relative change ≤ 1e-5 over 1,000 steps
const CONV_TOL = 1e-5;
const MAX_STEPS = 80_000; // safety cap; non-convergence is a finding

it('BM-2: cylinder at Re 20 — steady Cd vs literature', { timeout: 40 * 60_000 }, () => {
  const solver = buildCylinderCase(RE);

  let prevCd = Infinity;
  let converged = false;
  let steps = 0;
  let Cd = NaN;
  let Cl = NaN;
  while (steps < MAX_STEPS) {
    for (let s = 0; s < CONV_INTERVAL; s++) solver.iterate();
    steps += CONV_INTERVAL;
    ({ Cd, Cl } = solver.computeForces(CYL.D));
    if (Math.abs(Cd - prevCd) / Math.abs(Cd) <= CONV_TOL) {
      converged = true;
      break;
    }
    prevCd = Cd;
  }
  expect(
    converged,
    `Cd did not converge to ${CONV_TOL} over ${CONV_INTERVAL} steps within ${MAX_STEPS} steps (last Cd = ${Cd})`,
  ).toBe(true);

  // Recirculation bubble length (informative): u_x = 0 crossing on the
  // centerline behind the cylinder. Centerline y = 199.5 → average rows
  // 199/200; walk downstream from the rear stagnation point.
  const rear = CYL.cx + CYL.D / 2;
  let lrOverD = NaN;
  for (let x = Math.ceil(rear); x < CYL.Nx - 2; x++) {
    const uxCl = (solver.ux[x * CYL.Ny + 199] + solver.ux[x * CYL.Ny + 200]) / 2;
    if (uxCl > 0) {
      const uxPrev =
        (solver.ux[(x - 1) * CYL.Ny + 199] + solver.ux[(x - 1) * CYL.Ny + 200]) / 2;
      // linear interpolation of the zero crossing between x-1 and x
      const frac = uxPrev < 0 ? -uxPrev / (uxCl - uxPrev) : 0;
      lrOverD = (x - 1 + frac - rear) / CYL.D;
      break;
    }
  }

  printReport(
    'BM-2 · Cylinder, Re = 20 (steady)',
    `${CYL.Nx}×${CYL.Ny}, D = ${CYL.D} (β = ${(BLOCKAGE * 100).toFixed(0)}%), bounce-back side walls, ` +
      `converged after ${steps} steps (ΔCd/Cd ≤ ${CONV_TOL} per ${CONV_INTERVAL} steps)`,
    [
      {
        label: 'Cd',
        measured: Cd.toFixed(3),
        literature: '2.05 (range 2.0–2.1)',
        relError: `${(((Cd - 2.05) / 2.05) * 100).toFixed(2)}%`,
        pass: Cd >= 1.93 && Cd <= 2.17,
      },
      {
        label: '|Cl| (symmetry at scale)',
        measured: Math.abs(Cl).toExponential(2),
        literature: '0 (tolerance 0.01)',
        relError: '—',
        pass: Math.abs(Cl) <= 0.01,
      },
      {
        label: 'L_r/D (informative, not gating)',
        measured: lrOverD.toFixed(3),
        literature: '≈ 0.92',
        relError: `${(((lrOverD - 0.92) / 0.92) * 100).toFixed(1)}%`,
        pass: true,
      },
    ],
  );

  expect(Cd, `Cd = ${Cd.toFixed(3)} outside 1.93–2.17`).toBeGreaterThanOrEqual(1.93);
  expect(Cd, `Cd = ${Cd.toFixed(3)} outside 1.93–2.17`).toBeLessThanOrEqual(2.17);
  expect(Math.abs(Cl), `|Cl| = ${Math.abs(Cl).toExponential(2)} exceeds 0.01`).toBeLessThanOrEqual(0.01);
});
