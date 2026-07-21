// Shared setup and reporting helpers for the canonical benchmarks
// (docs/specs/phase-1-validation.md §1.2, official setups per
// docs/specs/phase-1-2d-benchmark-closure.md).

import { LBMSolver } from '../../src/lbm/LBMSolver';

/**
 * Cylinder benchmark domain — official setup per the phase 1.2d endpoint
 * decisions: D = 30 cells, blockage β = D/Ny = 5% (Ny = 600), 10·D upstream
 * (Nx = 1080), **free-slip side walls** (specular reflection) — the standard
 * configuration for comparing a confined tunnel against unconfined
 * references. The 1.2c refinement study (VALIDATION.md) showed the D = 20
 * staircase bias is first-order in 1/D and the D = 20 → 30 extrapolation
 * lands on the unconfined reference; the superseded D = 20 no-slip variants
 * remain reproducible from the parameters documented in VALIDATION.md.
 *
 * The cylinder center sits on the geometric centerline y = 299.5 (between
 * rows 299 and 300), which keeps the rasterised mask exactly mirror-
 * symmetric — Cl symmetry checks depend on it.
 */
export const CYL = {
  Nx: 1080,
  Ny: 600,
  D: 30,
  cx: 300,
  cy: 299.5,
  u0: 0.07,
} as const;

export function buildCylinderCase(Re: number): LBMSolver {
  const nu = (CYL.u0 * CYL.D) / Re;
  const tau = 3 * nu + 0.5;
  const solver = new LBMSolver({
    Nx: CYL.Nx,
    Ny: CYL.Ny,
    tau,
    u0: CYL.u0,
    sideWalls: 'free-slip',
  });
  solver.addWalls();
  solver.addCircle(CYL.cx, CYL.cy, CYL.D / 2);
  solver.initialise();
  return solver;
}

/** Blockage ratio of the cylinder case, for report blocks. */
export const BLOCKAGE = CYL.D / CYL.Ny;

export interface ReportRow {
  label: string;
  measured: string;
  literature: string;
  relError: string;
  pass: boolean;
}

/**
 * Print the human-readable summary block every benchmark emits — the raw
 * material for VALIDATION.md.
 */
export function printReport(title: string, setup: string, rows: ReportRow[]): void {
  const lines = [
    `\n================ ${title} ================`,
    `setup: ${setup}`,
    ...rows.map(
      (r) =>
        `${r.pass ? 'PASS' : 'FAIL'}  ${r.label}: measured ${r.measured}` +
        `  | literature ${r.literature}  | rel.err ${r.relError}`,
    ),
    '='.repeat(50 + title.length),
  ];
  // process.stdout.write, not console.log: vitest 4 swallows console output
  // from passing tests in run mode, and these blocks are the raw material
  // for VALIDATION.md.
  process.stdout.write(lines.join('\n') + '\n');
}
