import { expect, it } from 'vitest';
import { BLOCKAGE, CYL, buildCylinderCase, printReport } from './helpers';

// BM-3 (docs/specs/phase-1-validation.md §1.2; official setup per
// docs/specs/phase-1-2d-benchmark-closure.md): circular cylinder at Re = 100
// — saturated von Kármán vortex street.
//
// Literature: mean Cd ≈ 1.33–1.35; St = f·D/u0 ≈ 0.164–0.166 (Williamson's
// experiments give 0.164 at Re = 100). Acceptance: mean Cd within ±7% of
// 1.34 (1.246–1.434); St within ±5% of 0.165 (0.157–0.173), measured from
// zero crossings of the mean-removed Cl signal.
//
// Time windows are scaled with D/u0 from the D = 20 setup (spec 1.2c D-3):
// 45,000 steps discarded, 31,500 measured — sized to hold ≥ 10 full periods
// between the first and last Cl zero crossings (T ≈ 2,600 steps at D = 30).
//
// Cd/Cl come from solver.computeForces() — the exact code path the UI uses.
// Sign convention per docs/specs/cl-sign-convention.md: Cd = +Fx, Cl = +Fy
// (+y is physical up). St is dimensionless and computed entirely in lattice
// units (f in 1/steps, D in cells, u0 in lu).
//
// Perturbation injection ON, mirroring the UI loop (first 200 steps): it
// only shortens the transient — the saturated limit cycle is what we
// measure. Note injectPerturbation() uses Math.random(), so the transient
// is not bit-reproducible; the saturated cycle statistics are.

const RE = 100;
const PERTURB_STEPS = 200; // same constant the UI loop uses
const DISCARD = 45_000; // D = 20 spec value (30,000) scaled by D/u0
const MEASURE = 31_500; // ≥ 10 full periods at D = 30 (11 measured in 1.2c D-3)

it('BM-3: cylinder at Re 100 — mean Cd and Strouhal vs literature', { timeout: 180 * 60_000 }, () => {
  const solver = buildCylinderCase(RE);

  for (let s = 0; s < DISCARD; s++) {
    if (solver.step < PERTURB_STEPS) solver.injectPerturbation();
    solver.iterate();
  }

  const cd: number[] = [];
  const cl: number[] = [];
  for (let s = 0; s < MEASURE; s++) {
    solver.iterate();
    const f = solver.computeForces(CYL.D);
    cd.push(f.Cd);
    cl.push(f.Cl);
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const cdMean = mean(cd);
  const clMean = mean(cl);

  // Strouhal from upward zero crossings of the mean-removed Cl signal,
  // linearly interpolated for sub-step timing.
  const crossings: number[] = [];
  for (let i = 1; i < cl.length; i++) {
    const a = cl[i - 1] - clMean;
    const b = cl[i] - clMean;
    if (a < 0 && b >= 0) crossings.push(i - 1 + -a / (b - a));
  }
  expect(
    crossings.length,
    `only ${crossings.length} upward Cl zero crossings in the measurement window — no established limit cycle`,
  ).toBeGreaterThanOrEqual(10);

  const periods = crossings.length - 1;
  const freq = periods / (crossings[crossings.length - 1] - crossings[0]); // 1/steps
  const st = (freq * CYL.D) / CYL.u0;

  const clAmp = Math.max(...cl.map((v) => Math.abs(v - clMean)));

  printReport(
    'BM-3 · Cylinder, Re = 100 (von Kármán)',
    `${CYL.Nx}×${CYL.Ny}, D = ${CYL.D} (β = ${(BLOCKAGE * 100).toFixed(0)}%), free-slip side walls, ` +
      `perturbed first ${PERTURB_STEPS} steps, ${DISCARD} steps discarded, ` +
      `measured over ${MEASURE} steps = ${periods} full shedding periods`,
    [
      {
        label: 'mean Cd',
        measured: cdMean.toFixed(3),
        literature: '1.34 (range 1.33–1.35)',
        relError: `${(((cdMean - 1.34) / 1.34) * 100).toFixed(2)}%`,
        pass: cdMean >= 1.246 && cdMean <= 1.434,
      },
      {
        label: 'St (Cl zero crossings)',
        measured: st.toFixed(4),
        literature: '0.165 (Williamson: 0.164)',
        relError: `${(((st - 0.165) / 0.165) * 100).toFixed(2)}%`,
        pass: st >= 0.157 && st <= 0.173,
      },
      {
        label: 'Cl amplitude (informative)',
        measured: clAmp.toFixed(3),
        literature: '≈ 0.23–0.35 (2D simulations)',
        relError: '—',
        pass: true,
      },
    ],
  );

  expect(cdMean, `mean Cd = ${cdMean.toFixed(3)} outside 1.246–1.434`).toBeGreaterThanOrEqual(1.246);
  expect(cdMean, `mean Cd = ${cdMean.toFixed(3)} outside 1.246–1.434`).toBeLessThanOrEqual(1.434);
  expect(st, `St = ${st.toFixed(4)} outside 0.157–0.173`).toBeGreaterThanOrEqual(0.157);
  expect(st, `St = ${st.toFixed(4)} outside 0.157–0.173`).toBeLessThanOrEqual(0.173);
});
