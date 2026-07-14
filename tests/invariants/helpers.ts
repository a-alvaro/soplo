import { Q, ex, ey } from '../../src/lbm/constants';

/**
 * Deterministic 32-bit PRNG (mulberry32). Invariant tests must be
 * reproducible run-to-run, so no Math.random() in test setup.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-node hydrodynamic moments (ρ, jx, jy) computed from the distribution
 * buffer in double precision. `k` is the scalar index x·Ny + y.
 */
export function nodeMoments(
  f: Float64Array,
  NxNy: number,
  k: number,
): { rho: number; jx: number; jy: number } {
  let rho = 0;
  let jx = 0;
  let jy = 0;
  for (let i = 0; i < Q; i++) {
    const fi = f[i * NxNy + k];
    rho += fi;
    jx += ex[i] * fi;
    jy += ey[i] * fi;
  }
  return { rho, jx, jy };
}

/** Index of the first non-finite entry in a typed array, or -1 if none. */
export function firstNonFinite(arr: Float64Array): number {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return i;
  }
  return -1;
}
