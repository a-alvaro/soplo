import { expect, it } from 'vitest';
import { LBMSolver } from '../../src/lbm/LBMSolver';

// INV-5 (docs/specs/phase-1-validation.md §1.1): in steady channel flow the
// velocity extrapolated to the wall must vanish: |u_wall| ≤ 1e-3·u0.
//
// With half-way bounce-back the physical wall sits half a cell beyond the
// last fluid node (between the solid row and the first fluid row). We
// extrapolate to that location with a quadratic (3-point) fit through the
// first three fluid nodes: for wall-normal distances 0.5, 1.5, 2.5 cells,
//   u(0) = (15·u₁ − 10·u₂ + 3·u₃) / 8.
// Quadratic order matters: the near-wall profile is parabolic-ish, and a
// linear extrapolation would alias the profile curvature into a false slip
// of order u_max/H² — comparable to the tolerance itself.
const STEPS = 4000;

it('INV-5: extrapolated wall velocity vanishes in steady channel flow', () => {
  const Nx = 100;
  const Ny = 42; // rows 0 and 41 are walls; 40 fluid rows
  const u0 = 0.07;
  const solver = new LBMSolver({ Nx, Ny, tau: 0.8, u0 });
  solver.addWalls();
  solver.initialise();

  for (let s = 0; s < STEPS; s++) solver.iterate();

  const { ux, uy } = solver;
  const quad = (u1: number, u2: number, u3: number) =>
    (15 * u1 - 10 * u2 + 3 * u3) / 8;

  // Sample the middle half of the channel, away from inlet/outlet effects.
  let maxWall = 0;
  let worst = '';
  for (let x = Math.floor(Nx / 4); x <= Math.floor((3 * Nx) / 4); x++) {
    const k = (y: number) => x * Ny + y;
    const walls: [string, number, number, number][] = [
      // [label, y1, y2, y3] — first three fluid rows off each wall
      ['bottom', 1, 2, 3],
      ['top', Ny - 2, Ny - 3, Ny - 4],
    ];
    for (const [label, y1, y2, y3] of walls) {
      const uxw = quad(ux[k(y1)], ux[k(y2)], ux[k(y3)]);
      const uyw = quad(uy[k(y1)], uy[k(y2)], uy[k(y3)]);
      const speed = Math.hypot(uxw, uyw);
      if (speed > maxWall) {
        maxWall = speed;
        worst = `${label} wall at x=${x}`;
      }
    }
  }

  expect(
    maxWall,
    `max extrapolated wall speed ${maxWall.toExponential(3)} (${worst}) exceeds 1e-3·u0 = ${(1e-3 * u0).toExponential(3)}`,
  ).toBeLessThanOrEqual(1e-3 * u0);
});
