import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';
import { physicsToLBM, FIXED_LBM_VELOCITY } from '../../src/physics/physicsToLBM';

// Harness smoke test: src/lbm and src/physics must be importable and runnable
// in plain Node (no DOM, no browser APIs) — the layering rule in AGENTS.md
// that the whole invariant/benchmark suite depends on.

it('solver constructs, iterates and stays finite headlessly', () => {
  const solver = new LBMSolver({ Nx: 40, Ny: 20, tau: 0.8, u0: 0.07 });
  solver.addWalls();
  solver.initialise();
  for (let s = 0; s < 10; s++) solver.iterate();

  expect(solver.step).toBe(10);
  expect(Number.isFinite(solver.rho[solver.idx(20, 10)])).toBe(true);
  expect(Number.isFinite(solver.ux[solver.idx(20, 10)])).toBe(true);
});

it('physics conversion layer works headlessly', () => {
  // Air at 1 m/s around a 10 cm cylinder, 20 cells across.
  const lbm = physicsToLBM({
    speedMs: 1,
    charLengthM: 0.1,
    nuPhysical: 1.5e-5,
    gridCells: 20,
  });

  expect(lbm.u0).toBe(FIXED_LBM_VELOCITY);
  expect(Number.isFinite(lbm.tau)).toBe(true);
  expect(lbm.tau).toBeGreaterThan(0.5);
  expect(lbm.Re).toBeCloseTo(6667, -1);
});
