// Boundary condition helpers for the D2Q9 LBM solver.
//
// These operate directly on the flat distribution buffer using the same
// indexing convention as LBMSolver: f[i * Nx*Ny + x*Ny + y].
//
// Inlet/outlet are the well-posed Zou–He pair (Zou & He 1997, non-equilibrium
// bounce-back): the inlet prescribes velocity and lets density float, the
// outlet prescribes density (the domain's pressure reference) and lets the
// outflow velocity float. Prescribing both at either end over-constrains the
// flow — see docs/specs/phase-1-2b-boundary-conditions.md.
//
// Direction-index mapping used below (from constants.ts):
//   i:       0  1  2  3  4   5   6   7   8
//   compass: C  E  N  W  S   NE  NW  SW  SE
//   ex:      0  1  0 -1  0   1  -1  -1   1
//   ey:      0  0  1  0 -1   1   1  -1  -1
//
// The no-slip walls (top/bottom) are not handled here — they are implemented
// by marking the boundary rows as solid, so half-way bounce-back inside the
// streaming step takes care of them.

/**
 * Zou–He velocity inlet at x=0: prescribe u=(u0, 0); density is computed
 * from the known (non-east-pointing) populations, never imposed.
 *
 * With inflow normal +x, the unknowns after streaming are the east-pointing
 * populations f_E, f_NE, f_SE (i = 1, 5, 8). The local density follows from
 * the ρ and ρ·ux moment constraints, and the unknowns from bounce-back of
 * the non-equilibrium part plus the ρ·uy = 0 constraint.
 *
 * Skips wall rows (y=0 and y=Ny-1) and any other solid cells in the inlet
 * column — overwriting them creates a physical contradiction that the
 * solver dissipates, suppressing asymmetry.
 */
export function applyInlet(
  f: Float64Array,
  Nx: number,
  Ny: number,
  u0: number,
  solid: Uint8Array,
): void {
  const NxNy = Nx * Ny;
  for (let y = 1; y < Ny - 1; y++) {
    const k = y;
    if (solid[k] === 1) continue;

    const fC = f[0 * NxNy + k];
    const fN = f[2 * NxNy + k];
    const fW = f[3 * NxNy + k];
    const fS = f[4 * NxNy + k];
    const fNW = f[6 * NxNy + k];
    const fSW = f[7 * NxNy + k];

    const rho = (fC + fN + fS + 2 * (fW + fNW + fSW)) / (1 - u0);
    const ru = rho * u0;

    f[1 * NxNy + k] = fW + (2 / 3) * ru; // f_E
    f[5 * NxNy + k] = fSW - 0.5 * (fN - fS) + (1 / 6) * ru; // f_NE
    f[8 * NxNy + k] = fNW + 0.5 * (fN - fS) + (1 / 6) * ru; // f_SE
  }
}

/**
 * Zou–He pressure outlet at x=Nx-1: prescribe rho=1 (the domain's pressure
 * reference) and uy=0; the outflow velocity ux is computed from the known
 * populations.
 *
 * With outflow normal +x, the unknowns after streaming are the west-pointing
 * populations f_W, f_NW, f_SW (i = 3, 6, 7). The corner terms carry the
 * opposite sign of the spec's compass formulas: with the spec's signs the
 * ρ·uy = 0 moment constraint is violated (uy would equal 2(f_N − f_S)/ρ);
 * the signs below are forced by the constraint and verified by BC-1.
 *
 * Covers every non-solid row of the outlet column (like the zero-gradient
 * outlet it replaces): in wall-less domains the extreme rows are fluid, and
 * leaving their west-pointing populations to the streaming fallback creates
 * a self-referential feedback that grows exponentially.
 */
export function applyOutlet(
  f: Float64Array,
  Nx: number,
  Ny: number,
  solid: Uint8Array,
): void {
  const NxNy = Nx * Ny;
  const rho = 1.0;
  for (let y = 0; y < Ny; y++) {
    const k = (Nx - 1) * Ny + y;
    if (solid[k] === 1) continue;

    const fC = f[0 * NxNy + k];
    const fE = f[1 * NxNy + k];
    const fN = f[2 * NxNy + k];
    const fS = f[4 * NxNy + k];
    const fNE = f[5 * NxNy + k];
    const fSE = f[8 * NxNy + k];

    const ux = -1 + (fC + fN + fS + 2 * (fE + fNE + fSE)) / rho;
    const ru = rho * ux;

    f[3 * NxNy + k] = fE - (2 / 3) * ru; // f_W
    f[6 * NxNy + k] = fSE - 0.5 * (fN - fS) - (1 / 6) * ru; // f_NW
    f[7 * NxNy + k] = fNE + 0.5 * (fN - fS) - (1 / 6) * ru; // f_SW
  }
}
