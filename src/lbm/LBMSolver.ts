// D2Q9 MRT (Multiple Relaxation Time) Lattice Boltzmann solver.
//
// Layout: f is laid out as f[i * Nx * Ny + x * Ny + y] so that streaming
// along x or y stays cache-friendly enough for our grid sizes.
//
// One step is: MRT collide (compute moments → relax in moment space →
// transform back to populations) → stream into fNew with bounce-back at
// solid neighbours → swap → apply boundaries.
//
// MRT vs BGK: instead of relaxing all populations with a single tau, we
// transform to a 9-dim moment basis (rho, e, eps, jx, qx, jy, qy, pxx, pxy)
// and relax each moment with its own rate s_i. Conserved moments (rho, jx,
// jy) keep s=1; non-physical "ghost" moments (e, eps, qx, qy) get s=1.2-1.4
// so they decay quickly and don't pollute the physical fields; the stress
// modes (pxx, pxy) use s = 1/tau, the only one tied to viscosity. Result:
// stable up to ~3-4× higher Re than BGK at the same grid.

import { Q, ex, ey, w, opp } from './constants';
import { applyInlet, applyOutlet } from './boundaryConditions';
import { rasterizePolygon } from '../geometry/rasterize';

// d'Humières D2Q9 transform matrix (row-major, 9×9). Row order:
//   0: rho   1: e    2: eps   3: jx   4: qx
//   5: jy    6: qy   7: pxx   8: pxy
//
// Velocity layout: 0=(0,0), 1=(1,0), 2=(0,1), 3=(-1,0), 4=(0,-1),
//                  5=(1,1), 6=(-1,1), 7=(-1,-1), 8=(1,-1)
const M_DATA: ReadonlyArray<number> = [
  1, 1, 1, 1, 1, 1, 1, 1, 1,
  -4, -1, -1, -1, -1, 2, 2, 2, 2,
  4, -2, -2, -2, -2, 1, 1, 1, 1,
  0, 1, 0, -1, 0, 1, -1, -1, 1,
  0, -2, 0, 2, 0, 1, -1, -1, 1,
  0, 0, 1, 0, -1, 1, 1, -1, -1,
  0, 0, -2, 0, 2, 1, 1, -1, -1,
  0, 1, -1, 1, -1, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1, -1, 1, -1,
];

// M⁻¹ already pre-scaled by 1/36 — saves a per-cell multiply.
const MI_RAW: ReadonlyArray<number> = [
  4, -4, 4, 0, 0, 0, 0, 0, 0,
  4, -1, -2, 6, -6, 0, 0, 9, 0,
  4, -1, -2, 0, 0, 6, -6, -9, 0,
  4, -1, -2, -6, 6, 0, 0, 9, 0,
  4, -1, -2, 0, 0, -6, 6, -9, 0,
  4, 2, 1, 6, 3, 6, 3, 0, 9,
  4, 2, 1, -6, -3, 6, 3, 0, -9,
  4, 2, 1, -6, -3, -6, -3, 0, 9,
  4, 2, 1, 6, 3, -6, -3, 0, -9,
];

export interface LBMOptions {
  Nx: number;
  Ny: number;
  tau: number;
  u0: number;
}

export class LBMSolver {
  readonly Nx: number;
  readonly Ny: number;
  readonly tau: number;
  readonly u0: number;

  f: Float32Array;
  fNew: Float32Array;
  rho: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  solid: Uint8Array;

  step = 0;

  /** Accumulated forces from the last iterate() call (lattice units). */
  private lastFx = 0;
  private lastFy = 0;

  /** Moment-space transform M (9×9, row-major). */
  private readonly M: Float32Array;
  /** Inverse transform M⁻¹ (9×9, row-major), pre-scaled by 1/36. */
  private readonly Mi: Float32Array;
  /** Per-moment relaxation rates (diagonal of S). Updated by updateRelaxation. */
  private readonly s: Float32Array;

  /** Scratch buffers for the per-cell collide. Allocated once, reused per
   *  cell, so we never allocate inside the hot loop. */
  private readonly _m: Float32Array;
  private readonly _meq: Float32Array;

  constructor(opts: LBMOptions) {
    this.Nx = opts.Nx;
    this.Ny = opts.Ny;
    this.tau = opts.tau;
    this.u0 = opts.u0;

    const N = this.Nx * this.Ny;
    this.f = new Float32Array(Q * N);
    this.fNew = new Float32Array(Q * N);
    this.rho = new Float32Array(N);
    this.ux = new Float32Array(N);
    this.uy = new Float32Array(N);
    this.solid = new Uint8Array(N);

    this.M = new Float32Array(M_DATA);
    this.Mi = Float32Array.from(MI_RAW, (v) => v / 36);
    this.s = new Float32Array(9);
    this._m = new Float32Array(9);
    this._meq = new Float32Array(9);
    this.updateRelaxation();
  }

  /**
   * (Re)compute the relaxation rates. Conserved moments use s=1 (value
   * irrelevant because m == meq for them; 1 is convention). Non-physical
   * ghost moments are damped aggressively (s≈1.7–1.8) so numerical noise
   * decays before it can pollute the physical fields. Stress modes use
   * s=1/tau — they're the only ones tied to viscosity.
   *
   * Empirical: ghost rates of 1.4 / 1.2 (Lallemand–Luo defaults) are fine
   * at Re ≲ 1500 on a 40-cell cylinder, but at higher Re (τ → 0.5) the
   * ghosts amplify slowly and crash the solver after a few thousand steps.
   * Tightening to 1.8 / 1.7 buys ≈3× more stable Re without measurable
   * impact on the resolved physics.
   */
  private updateRelaxation(): void {
    const inv = 1 / this.tau;
    const s = this.s;
    s[0] = 1.0; // rho   (conserved)
    s[1] = 1.8; // e     (ghost — energy mode)
    s[2] = 1.8; // eps   (ghost)
    s[3] = 1.0; // jx    (conserved)
    s[4] = 1.7; // qx    (ghost — energy flux)
    s[5] = 1.0; // jy    (conserved)
    s[6] = 1.7; // qy    (ghost)
    s[7] = inv; // pxx   (physical — controls viscosity)
    s[8] = inv; // pxy   (physical)
  }

  /** Linear index for a scalar field at (x, y). */
  idx(x: number, y: number): number {
    return x * this.Ny + y;
  }

  /** Linear index for distribution component i at (x, y). */
  fIdx(i: number, x: number, y: number): number {
    return i * this.Nx * this.Ny + x * this.Ny + y;
  }

  /** Equilibrium distribution. */
  static feq(i: number, rho: number, ux: number, uy: number): number {
    const eu = ex[i] * ux + ey[i] * uy;
    const u2 = ux * ux + uy * uy;
    return w[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u2);
  }

  /**
   * Mark the top and bottom rows as domain walls (solid=1).
   * Wall cells are excluded from force computations — they don't belong to
   * any aerodynamic body.
   */
  addWalls(): void {
    const { Nx, Ny } = this;
    for (let x = 0; x < Nx; x++) {
      this.solid[this.idx(x, 0)] = 1;
      this.solid[this.idx(x, Ny - 1)] = 1;
    }
  }

  /**
   * Mark an axis-aligned square region as an aerodynamic object (solid=2).
   * solid=2 cells participate in computeForces(); solid=1 walls do not.
   */
  addSquare(cx: number, cy: number, side: number): void {
    const half = side / 2;
    const x0 = Math.max(0, Math.floor(cx - half));
    const x1 = Math.min(this.Nx - 1, Math.ceil(cx + half));
    const y0 = Math.max(0, Math.floor(cy - half));
    const y1 = Math.min(this.Ny - 1, Math.ceil(cy + half));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        this.solid[this.idx(x, y)] = 2;
      }
    }
  }

  /** Rasterise a closed polygon (lattice coords) into the solid mask as solid=2. */
  addPolygon(points: readonly [number, number][]): void {
    rasterizePolygon(this.solid, this.Nx, this.Ny, points, 2);
  }

  /**
   * OR-merge an externally rasterised mask into the solid array.
   * `solidValue` controls the flag written:
   *   1 = domain wall (excluded from force computation)
   *   2 = aerodynamic object (included in force computation)
   */
  addMask(mask: Uint8Array, solidValue: 1 | 2 = 2): void {
    if (mask.length !== this.solid.length) {
      throw new Error('addMask: mask size mismatch');
    }
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) this.solid[i] = solidValue;
    }
  }

  /** Mark a circular region as an aerodynamic object (solid=2). */
  addCircle(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    for (let x = 0; x < this.Nx; x++) {
      for (let y = 0; y < this.Ny; y++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.solid[this.idx(x, y)] = 2;
      }
    }
  }

  /** Initialise rho=1, u=(u0,0) on fluid nodes; equilibrium populations. */
  initialise(): void {
    const { Nx, Ny, u0 } = this;
    for (let x = 0; x < Nx; x++) {
      for (let y = 0; y < Ny; y++) {
        const k = this.idx(x, y);
        const isSolid = this.solid[k] !== 0;
        const r = 1.0;
        const vx = isSolid ? 0 : u0;
        const vy = 0;
        this.rho[k] = r;
        this.ux[k] = vx;
        this.uy[k] = vy;
        for (let i = 0; i < Q; i++) {
          this.f[this.fIdx(i, x, y)] = LBMSolver.feq(i, r, vx, vy);
        }
      }
    }
    this.step = 0;
  }

  /** Advance one time step. */
  iterate(): void {
    this.collide();
    this.accumulateForces(); // ← post-collision, pre-stream: correct timing for MEM
    this.stream();
    this.applyBoundaries();
    this.step++;
  }

  /**
   * Accumulate momentum-exchange forces into lastFx/lastFy.
   * Must run AFTER collide() and BEFORE stream() so that f[] holds the
   * post-collision populations heading toward the solid boundary — exactly
   * what the Ladd MEM formula requires: F = Σ 2·e_i·f_i(post-collision).
   */
  private accumulateForces(): void {
    const { Nx, Ny, f, solid } = this;
    const NxNy = Nx * Ny;
    let Fx = 0;
    let Fy = 0;

    for (let x = 1; x < Nx - 1; x++) {
      for (let y = 1; y < Ny - 1; y++) {
        const k = x * Ny + y;
        if (solid[k] !== 0) continue; // fluid cells only

        for (let i = 1; i < Q; i++) {
          const xn = x + ex[i];
          const yn = y + ey[i];
          if (xn < 0 || xn >= Nx || yn < 0 || yn >= Ny) continue;
          const kn = xn * Ny + yn;
          if (solid[kn] !== 2) continue; // object only, not walls

          // f[i] here is post-collision, pre-stream → heading toward solid.
          // Half-way bounce-back: momentum transferred = 2·e_i·f_i.
          const fi = f[i * NxNy + k];
          Fx += 2 * fi * ex[i];
          Fy += 2 * fi * ey[i];
        }
      }
    }

    this.lastFx = Fx;
    this.lastFy = Fy;
  }

  /**
   * MRT collision step. For each fluid cell:
   *   1. m   = M · f          (transform populations to 9 moments)
   *   2. meq = equilibrium moments from rho, jx, jy
   *   3. m  -= S · (m − meq)  (per-moment relaxation)
   *   4. f   = M⁻¹ · m        (back to populations, in place)
   *
   * Macroscopic fields (rho, ux, uy) are also written here so the renderer
   * has fresh values without an extra pass. They come for free out of the
   * 0th, 3rd and 5th moments.
   */
  private collide(): void {
    const Nx = this.Nx;
    const Ny = this.Ny;
    const f = this.f;
    const M = this.M;
    const Mi = this.Mi;
    const s = this.s;
    const rho = this.rho;
    const ux = this.ux;
    const uy = this.uy;
    const solid = this.solid;
    const m = this._m;
    const meq = this._meq;
    const NxNy = Nx * Ny;

    for (let x = 0; x < Nx; x++) {
      for (let y = 0; y < Ny; y++) {
        const k = x * Ny + y;
        if (solid[k] !== 0) continue;

        // --- 1. Moments: m = M · f ---
        // Pull each population once into a local for the dot products below.
        const f0 = f[0 * NxNy + k];
        const f1 = f[1 * NxNy + k];
        const f2 = f[2 * NxNy + k];
        const f3 = f[3 * NxNy + k];
        const f4 = f[4 * NxNy + k];
        const f5 = f[5 * NxNy + k];
        const f6 = f[6 * NxNy + k];
        const f7 = f[7 * NxNy + k];
        const f8 = f[8 * NxNy + k];

        for (let a = 0; a < 9; a++) {
          const r0 = a * 9;
          m[a] =
            M[r0] * f0 +
            M[r0 + 1] * f1 +
            M[r0 + 2] * f2 +
            M[r0 + 3] * f3 +
            M[r0 + 4] * f4 +
            M[r0 + 5] * f5 +
            M[r0 + 6] * f6 +
            M[r0 + 7] * f7 +
            M[r0 + 8] * f8;
        }

        // --- 2. Macroscopic fields and equilibrium moments ---
        const r = m[0];
        const jx = m[3];
        const jy = m[5];
        const vx = jx / r;
        const vy = jy / r;
        rho[k] = r;
        ux[k] = vx;
        uy[k] = vy;
        const u2 = vx * vx + vy * vy;

        meq[0] = r;
        meq[1] = r * (-2 + 3 * u2);
        meq[2] = r * (1 - 3 * u2);
        meq[3] = jx;
        meq[4] = -jx;
        meq[5] = jy;
        meq[6] = -jy;
        meq[7] = r * (vx * vx - vy * vy);
        meq[8] = r * vx * vy;

        // --- 3. Relax in moment space: m_post = m − S·(m − meq) ---
        for (let a = 0; a < 9; a++) {
          m[a] -= s[a] * (m[a] - meq[a]);
        }

        // --- 4. Back to populations: f = M⁻¹ · m ---
        for (let i = 0; i < 9; i++) {
          const r0 = i * 9;
          f[i * NxNy + k] =
            Mi[r0] * m[0] +
            Mi[r0 + 1] * m[1] +
            Mi[r0 + 2] * m[2] +
            Mi[r0 + 3] * m[3] +
            Mi[r0 + 4] * m[4] +
            Mi[r0 + 5] * m[5] +
            Mi[r0 + 6] * m[6] +
            Mi[r0 + 7] * m[7] +
            Mi[r0 + 8] * m[8];
        }
      }
    }
  }

  /**
   * Streaming with mid-grid bounce-back at solid neighbours.
   *
   * For each fluid node (x,y) and each direction i, we look at the upstream
   * neighbour at (x-ex[i], y-ey[i]). If that neighbour is fluid, we pull its
   * f_i. If it's solid (or off the domain wall handled below), we apply
   * bounce-back: fNew_i(x,y) = f_opp(x,y) — i.e. the population travelling
   * the opposite way at the same node, after collision.
   *
   * This is the standard half-way bounce-back used to enforce no-slip on
   * arbitrary solids.
   */
  private stream(): void {
    const { Nx, Ny, f, fNew, solid } = this;
    const NxNy = Nx * Ny;

    for (let x = 0; x < Nx; x++) {
      for (let y = 0; y < Ny; y++) {
        const k = x * Ny + y;
        if (solid[k] !== 0) continue;

        for (let i = 0; i < Q; i++) {
          const xs = x - ex[i];
          const ys = y - ey[i];
          if (xs >= 0 && xs < Nx && ys >= 0 && ys < Ny) {
            const ks = xs * Ny + ys;
            if (solid[ks] !== 0) {
              // Bounce-back: take post-collision f_opp from this very node.
              fNew[i * NxNy + k] = f[opp[i] * NxNy + k];
            } else {
              fNew[i * NxNy + k] = f[i * NxNy + ks];
            }
          } else {
            // Out-of-domain neighbour — boundary handler will overwrite.
            // Default to current value to keep things finite.
            fNew[i * NxNy + k] = f[i * NxNy + k];
          }
        }
      }
    }

    // Swap buffers.
    const tmp = this.f;
    this.f = this.fNew;
    this.fNew = tmp;
  }

  /**
   * Domain boundary conditions.
   *  - Inlet (x=0): equilibrium populations with rho=1, u=(u0,0).
   *  - Outlet (x=Nx-1): zero-gradient copy from x=Nx-2.
   *  - Top/bottom walls: handled by marking those rows as solid; bounce-back
   *    in stream() takes care of no-slip.
   */
  private applyBoundaries(): void {
    applyInlet(this.f, this.Nx, this.Ny, this.u0, this.solid);
    applyOutlet(this.f, this.Nx, this.Ny);
  }

  /**
   * Inject a small transverse-velocity perturbation in a strip just downstream
   * of the inlet. Called during the first ~200 steps to seed asymmetry that
   * the physical instability can amplify into the von Karman vortex street.
   *
   * Implementation: rebuild equilibrium populations at x in [2, 6) with a
   * small random uy on top of the prescribed (u0, 0).
   */
  /**
   * Read the aerodynamic forces accumulated during the last iterate() call
   * and return normalised Cd / Cl coefficients.
   *
   * The raw forces (lastFx, lastFy) are computed inside accumulateForces(),
   * which runs post-collision pre-stream — the correct moment for the Ladd
   * momentum-exchange method. They are normalised by the dynamic pressure
   * q = 0.5·ρ·u0² and the reference area (charCells × 1 in 2D).
   *
   * Sign convention (see docs/specs/cl-sign-convention.md): lattice +x is
   * downstream and lattice +y is physical "up" (the renderer flips y at draw
   * time), so Cd = +Fx (drag) and Cl = +Fy (lift, positive upward).
   */
  computeForces(charCells: number): { Fx: number; Fy: number; Cd: number; Cl: number } {
    const Fx = this.lastFx;
    const Fy = this.lastFy;

    const A_ref = Math.max(charCells, 1); // diameter, side, or chord in cells
    const q_ref = 0.5 * this.u0 * this.u0; // rho=1 in lattice units

    const Cd = q_ref > 0 ? Fx / (q_ref * A_ref) : 0;
    const Cl = q_ref > 0 ? Fy / (q_ref * A_ref) : 0;

    return { Fx, Fy, Cd, Cl };
  }

  injectPerturbation(amplitude = 0.005): void {
    const { Nx, Ny, f, u0, solid } = this;
    const NxNy = Nx * Ny;
    const xLo = 2;
    const xHi = Math.min(6, Nx);
    for (let x = xLo; x < xHi; x++) {
      for (let y = 1; y < Ny - 1; y++) {
        const k = x * Ny + y;
        if (solid[k] !== 0) continue;
        const vy = amplitude * (Math.random() - 0.5);
        for (let i = 0; i < Q; i++) {
          f[i * NxNy + k] = LBMSolver.feq(i, 1.0, u0, vy);
        }
      }
    }
  }
}
