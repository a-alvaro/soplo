// Physical → LBM unit conversion.
//
// The user works in m/s and metres. Internally LBM needs lattice units. We
// hold the lattice velocity at a safe constant and pick the lattice viscosity
// (i.e. tau) so the lattice Reynolds matches the physical one.

export const FIXED_LBM_VELOCITY = 0.07;
export const TAU_MIN = 0.501;
export const TAU_MAX = 1.8;
export const TAU_STABLE_LO = 0.51;
export const TAU_STABLE_HI = 1.5;

/**
 * Maximum Reynolds the solver can resolve at a given grid resolution
 * without entering the unstable τ ∈ (0.5, 0.51) zone.
 *
 *   Re_safe = u₀ · D_cells / ν_min,  with ν_min = (τ_lo − ½) / 3
 *           = 0.07 · D_cells / 0.00333…
 *           ≈ 21 · D_cells
 *
 * IMPORTANT: `D_cells` is the FULL characteristic length in lattice cells,
 * never the half-length. For a cylinder that's the **diameter** (2·radius);
 * for a square the **side**; for an airfoil the **chord**. Reynolds is
 * defined with the full extent and so is the Re cap.
 */
export function reSafeLimit(D_cells: number): number {
  const nuMin = (TAU_STABLE_LO - 0.5) / 3;
  return (FIXED_LBM_VELOCITY * D_cells) / nuMin;
}

/**
 * Hard Reynolds limit at τ = TAU_MIN. Crossing this the solver diverges;
 * the band [Re_safe, Re_limit] is technically resolvable but plagued by
 * numerical oscillations.
 *
 * Same convention as reSafeLimit: `D_cells` is the FULL diameter / side /
 * chord, not the radius.
 */
export function reAbsoluteLimit(D_cells: number): number {
  const nuMin = (TAU_MIN - 0.5) / 3;
  return (FIXED_LBM_VELOCITY * D_cells) / nuMin;
}

export interface PhysicsParams {
  /** Inlet speed in m/s. */
  speedMs: number;
  /** Characteristic length of the geometry in metres (diameter, chord, side). */
  charLengthM: number;
  /** Kinematic viscosity of the fluid in m²/s. */
  nuPhysical: number;
  /**
   * Number of lattice cells the characteristic length spans (e.g. cylinder
   * diameter in cells, chord in cells). Sets the spatial resolution.
   */
  gridCells: number;
}

export interface LBMParams {
  /** Lattice inlet velocity. Always FIXED_LBM_VELOCITY — never user-facing. */
  u0: number;
  /** Relaxation time, clamped to [TAU_MIN, TAU_MAX]. */
  tau: number;
  /** Same as `tau` but unclamped — useful for warnings. */
  tauRaw: number;
  /** Physical Reynolds number U·L/ν. */
  Re: number;
  /** Time-step in seconds per LBM iteration. */
  dt: number;
  /** Cell size in metres. */
  dx: number;
}

/**
 * Convert a physical configuration to LBM parameters at the chosen lattice
 * resolution. Tau is clamped; callers should inspect `tauRaw` if they want
 * to surface a warning.
 */
export function physicsToLBM(p: PhysicsParams): LBMParams {
  const Re =
    p.nuPhysical > 0 ? (p.speedMs * p.charLengthM) / p.nuPhysical : Infinity;

  const u0 = FIXED_LBM_VELOCITY;
  // nu_lattice = u0 * D_cells / Re — matches lattice Re to physical Re.
  const nuLattice = Number.isFinite(Re) && Re > 0 ? (u0 * p.gridCells) / Re : 0;
  const tauRaw = 3 * nuLattice + 0.5;
  const tau = Math.max(TAU_MIN, Math.min(TAU_MAX, tauRaw));

  // dx [m] = charLengthM / gridCells. dt [s] = dx * u0 / speedMs.
  const dx = p.gridCells > 0 ? p.charLengthM / p.gridCells : 0;
  const dt = p.speedMs > 0 ? (dx * u0) / p.speedMs : 0;

  return { u0, tau, tauRaw, Re, dt, dx };
}

export type Severity = 'ok' | 'warn' | 'error';

export interface PhysicsWarning {
  severity: Severity;
  message: string;
}

export function physicsWarnings(
  lbm: LBMParams,
  D_cells?: number,
): PhysicsWarning[] {
  const out: PhysicsWarning[] = [];
  if (lbm.tauRaw < TAU_STABLE_LO) {
    const reCap =
      D_cells !== undefined && D_cells > 0 ? reSafeLimit(D_cells) : null;
    const tail = reCap
      ? ` This grid handles up to Re ≈ ${Math.round(reCap)} safely.`
      : '';
    out.push({
      severity: 'error',
      message:
        'Re is too high for the current grid resolution. Increase the grid size, reduce speed, or pick a more viscous fluid.' +
        tail,
    });
  } else if (lbm.tauRaw > TAU_STABLE_HI) {
    out.push({
      severity: 'warn',
      message:
        'Very low Re — the flow will be laminar with minimal features.',
    });
  }
  if (lbm.u0 > 0.15) {
    out.push({
      severity: 'warn',
      message: 'High lattice velocity — accuracy may be reduced.',
    });
  }
  return out;
}

/** Convert a lattice velocity component to m/s for display. */
export function lbmVelocityToMs(uLattice: number, lbm: LBMParams, speedMs: number): number {
  if (lbm.u0 <= 0) return 0;
  return (uLattice / lbm.u0) * speedMs;
}

/** Convert lattice vorticity (1/step) to physical 1/s. */
export function lbmVorticityToHz(omegaLattice: number, lbm: LBMParams): number {
  if (lbm.dt <= 0) return 0;
  return omegaLattice / lbm.dt;
}
