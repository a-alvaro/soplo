// Shared setup and reporting helpers for the canonical benchmarks
// (docs/specs/phase-1-validation.md §1.2).

import { LBMSolver } from '../../src/lbm/LBMSolver';

/**
 * Cylinder benchmark domain per spec §BM-2/§BM-3: D = 20 cells, blockage
 * β = D/Ny = 5% (Ny = 400), 10·D upstream and 25·D downstream (Nx = 720).
 * Side walls are half-way bounce-back (the only wall type the solver has);
 * the spec allows either bounce-back or free-slip at β = 5% and asks us to
 * document the choice — see VALIDATION.md.
 *
 * The cylinder center sits on the geometric centerline y = 199.5 (between
 * rows 199 and 200), which keeps the rasterised mask exactly mirror-
 * symmetric — Cl symmetry checks depend on it.
 */
export const CYL = {
  Nx: 720,
  Ny: 400,
  D: 20,
  cx: 200,
  cy: 199.5,
  u0: 0.07,
} as const;

export function buildCylinderCase(Re: number): LBMSolver {
  const nu = (CYL.u0 * CYL.D) / Re;
  const tau = 3 * nu + 0.5;
  const solver = new LBMSolver({ Nx: CYL.Nx, Ny: CYL.Ny, tau, u0: CYL.u0 });
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
