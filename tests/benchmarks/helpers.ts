// Shared setup and reporting helpers for the canonical benchmarks
// (docs/specs/phase-1-validation.md §1.2, official setups per
// docs/specs/phase-1-2d-benchmark-closure.md).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  // Single source of truth for the wall mode: buildCylinderCase and any fixture
  // metadata derive it from here, so a setup change cannot leave the metadata
  // silently lying (F7).
  sideWalls: 'free-slip',
} as const;

export function buildCylinderCase(Re: number): LBMSolver {
  const nu = (CYL.u0 * CYL.D) / Re;
  const tau = 3 * nu + 0.5;
  const solver = new LBMSolver({
    Nx: CYL.Nx,
    Ny: CYL.Ny,
    tau,
    u0: CYL.u0,
    sideWalls: CYL.sideWalls,
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

// ─── Fixture emission ─────────────────────────────────────────────────────────

/** Metadata a Cl-trace fixture carries alongside its samples. */
export interface ClTraceMeta {
  /** Solver steps between decimated samples — the app's forceHistory tick. */
  cadence: number;
  /** Cylinder diameter in cells. */
  D: number;
  /** Lattice inlet velocity. */
  u0: number;
  Nx: number;
  Ny: number;
  sideWalls: string;
  discardSteps: number;
  measureSteps: number;
  /**
   * Strouhal from Cl zero crossings at FULL rate, measured in the same run
   * that produced these samples. The fixture must carry its own reference:
   * BM-3's transient uses Math.random(), so a different run lands on slightly
   * different statistics and the published 0.1691 belongs to another run.
   */
  stFullRate: number;
}

export interface ClTraceFixture extends ClTraceMeta {
  /** Commit the emitting run was built from. */
  commit: string;
  /** Decimated Cl samples, chronological, 6 significant digits. */
  samples: number[];
}

function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Write a decimated Cl trace as a committed test fixture.
 *
 * **Emission is opt-in — the guard lives here, not at the call site.** A bench
 * run must never silently rewrite a fixture that gates the fast tier; that
 * would be a self-certifying loop where the estimator validates itself against
 * output it just produced. Regenerating is a deliberate act with its own
 * commit (`test: regenerate BM-3 Cl fixture — reason`).
 *
 * Set `SOPLO_WRITE_FIXTURES=1` to enable. See
 * docs/specs/phase-1-3a-strouhal-fft.md §2.
 *
 * @param relPath fixture path relative to the repo root.
 * @param meta run parameters, including the full-rate reference St.
 * @param clFullRate the per-step Cl signal over the measurement window.
 */
export function writeTrace(
  relPath: string,
  meta: ClTraceMeta,
  clFullRate: readonly number[],
): void {
  if (process.env.SOPLO_WRITE_FIXTURES !== '1') return;

  const samples: number[] = [];
  for (let i = 0; i < clFullRate.length; i += meta.cadence) {
    samples.push(Number(clFullRate[i].toPrecision(6)));
  }

  const fixture: ClTraceFixture = { ...meta, commit: currentCommit(), samples };
  const out = resolve(process.cwd(), relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');

  process.stdout.write(
    `wrote ${relPath}: ${samples.length} samples at cadence ${meta.cadence}, ` +
      `full-rate St = ${meta.stFullRate.toFixed(4)}, commit ${fixture.commit.slice(0, 7)}\n`,
  );
}
