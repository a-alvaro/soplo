import { expect, it } from 'vitest';
import { BLOCKAGE, CYL, buildCylinderCase, printReport } from './helpers';

// BM-2 (docs/specs/phase-1-validation.md §1.2; official setup per
// docs/specs/phase-1-2d-benchmark-closure.md): circular cylinder at Re = 20
// — steady flow with a closed recirculation bubble.
//
// REPORTING BENCHMARK (not literature-gated) — maintainer decision, spec
// 1.2f. Literature (unbounded flow): Cd ≈ 2.05 (reported range ~2.0–2.1),
// L_r/D ≈ 0.92. The official run measures Cd = 2.190 (+6.8% vs 2.05), a
// converged, *documented known-limitation*: low-Re confinement at β = 5%
// with a uniform inlet. The two competing mechanisms were ruled out by
// registered-prediction discriminators — resolution by the D = 20 → 30 1/D
// refinement study, and the reflective outlet by the phase-1.2e D-4
// outlet-distance test (doubling the outlet to 50D left the mean unchanged,
// 2.190 → 2.189). A literature-tight *confined* gate needs a parabolic inlet
// (Schäfer–Turek) — the canonical confined refs use one, and the confinement
// bias depends on the inlet profile — so that gate is a coupled v2 item, not
// faked now. See VALIDATION.md.
//
// This test therefore RUNS and prints its scoreboard (measured Cd, unconfined
// reference, deviation, mechanism tag) but asserts ONLY a loose sanity bound
// (1.8 ≤ Cd ≤ 2.4) to catch gross regressions/NaN — intentionally not the
// literature ±6% window. BM-1 and BM-3 remain fully literature-gated.
//
// Convergence gate (corrected in spec 1.2d — a measurement-definition fix,
// not a tolerance relaxation): the reflective Zou–He inlet/outlet planes
// sustain a bounded acoustic cavity mode (period on the order of 2·Nx/c_s)
// that makes the old pointwise gate (|ΔCd|/Cd ≤ 1e-5 per 1,000 steps)
// unsatisfiable. The run is converged when the mean Cd of the two
// consecutive 25,000-step windows that make up the final 50,000 steps
// differ by ≤ 0.2% (relative); the reported Cd is the mean over that final
// 50,000 steps (≥ 20 acoustic periods — the mode averages out). The
// oscillation amplitude and period are reported as the documented signature
// of the outlet cavity mode (informative).
//
// The gate is applied ONLY to the tail of a completed fixed-budget run — the
// full 150,000 steps are always iterated, then the final 50,000 are split
// into two windows. This is deliberate: the transient does not settle until
// ~50,000 steps (Cd spikes to ~2.42 at 10k, dips to ~2.00 at 20k), and a
// sliding early-stop check evaluated during that transient can certify a
// chance agreement of two 25k window means that straddle it — a false
// "converged" at a value that is not the stationary state. Only windows that
// both lie past the transient are trustworthy; the final 50k of the budget
// are, by construction, well past it. BM-2 has no perturbation/RNG so the
// run is bit-reproducible and the reported Cd is deterministic.
//
// Cd/Cl come from solver.computeForces() — the exact code path the UI uses
// (spec §1.2 forbids test-local normalization). Sign convention per
// docs/specs/cl-sign-convention.md: lattice +x downstream, +y physical up,
// Cd = +Fx, Cl = +Fy.
//
// Perturbation injection off: injectPerturbation() is UI-driven and never
// called here.

const RE = 20;
const WINDOW = 25_000; // spec 1.2d: two consecutive windows make up the tail
const CONV_REL = 0.002; // window means must agree to 0.2% (relative), informative
const MAX_STEPS = 150_000; // spec 1.2d budget, always run in full
// Loose sanity bound (spec 1.2f) — the ONLY hard assertion. Catches gross
// regressions/NaN; deliberately far wider than the literature ±6% window,
// which BM-2 is not held to (reporting benchmark, see header).
const SANITY_LO = 1.8;
const SANITY_HI = 2.4;

it('BM-2: cylinder at Re 20 — steady Cd vs literature', { timeout: 180 * 60_000 }, () => {
  const solver = buildCylinderCase(RE);

  const cdTrace: number[] = [];
  const clTrace: number[] = [];
  const windowMean = (xs: number[], from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += xs[i];
    return s / (to - from);
  };

  let steps = 0;
  while (steps < MAX_STEPS) {
    solver.iterate();
    steps++;
    const f = solver.computeForces(CYL.D);
    cdTrace.push(f.Cd);
    clTrace.push(f.Cl);
  }

  // Convergence signature (informative — spec 1.2f no longer gates on it):
  // the final 50,000 steps split into two consecutive 25k windows whose means
  // agree to ≤ 0.2% (2.1895/2.1903 at the official run). Reported in the
  // scoreboard, not asserted — BM-2 is a reporting benchmark.
  const tailFrom = steps - 2 * WINDOW;
  const m1 = windowMean(cdTrace, tailFrom, tailFrom + WINDOW);
  const m2 = windowMean(cdTrace, tailFrom + WINDOW, steps);
  const windowsAgree = Math.abs(m2 - m1) / Math.abs(m2) <= CONV_REL;

  // Reported Cd: mean over the final 50,000 steps (≥ 20 acoustic periods).
  const Cd = windowMean(cdTrace, tailFrom, steps);
  const clAbsMax = Math.max(...clTrace.slice(tailFrom).map(Math.abs));

  // Acoustic cavity-mode signature over the tail (informative): band and
  // dominant period from upward zero crossings of the mean-removed Cd.
  let cdMin = Infinity;
  let cdMax = -Infinity;
  for (let i = tailFrom; i < steps; i++) {
    if (cdTrace[i] < cdMin) cdMin = cdTrace[i];
    if (cdTrace[i] > cdMax) cdMax = cdTrace[i];
  }
  const crossings: number[] = [];
  for (let i = tailFrom + 1; i < steps; i++) {
    const a = cdTrace[i - 1] - Cd;
    const b = cdTrace[i] - Cd;
    if (a < 0 && b >= 0) crossings.push(i - 1 + -a / (b - a));
  }
  const period =
    crossings.length >= 2
      ? (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1)
      : NaN;

  // Recirculation bubble length (informative): u_x = 0 crossing on the
  // centerline behind the cylinder. Centerline y = 299.5 → average rows
  // 299/300; walk downstream from the rear stagnation point.
  const rear = CYL.cx + CYL.D / 2;
  let lrOverD = NaN;
  for (let x = Math.ceil(rear); x < CYL.Nx - 2; x++) {
    const uxCl = (solver.ux[x * CYL.Ny + 299] + solver.ux[x * CYL.Ny + 300]) / 2;
    if (uxCl > 0) {
      const uxPrev =
        (solver.ux[(x - 1) * CYL.Ny + 299] + solver.ux[(x - 1) * CYL.Ny + 300]) / 2;
      // linear interpolation of the zero crossing between x-1 and x
      const frac = uxPrev < 0 ? -uxPrev / (uxCl - uxPrev) : 0;
      lrOverD = (x - 1 + frac - rear) / CYL.D;
      break;
    }
  }

  printReport(
    'BM-2 · Cylinder, Re = 20 (steady) — REPORTED (known limitation)',
    `${CYL.Nx}×${CYL.Ny}, D = ${CYL.D} (β = ${(BLOCKAGE * 100).toFixed(0)}%), free-slip side walls, ` +
      `${steps} steps, reported Cd = mean over final ${2 * WINDOW} steps ` +
      `(two ${WINDOW}-step window means within ${CONV_REL * 100}%: ${m1.toFixed(4)}/${m2.toFixed(4)}, ` +
      `${windowsAgree ? 'converged' : 'NOT converged'}); reporting benchmark, not literature-gated`,
    [
      {
        label: 'Cd (windowed mean) — reported vs UNCONFINED ref',
        measured: Cd.toFixed(3),
        literature: '2.05 unconfined (2.0–2.1); not a gate — sanity 1.8–2.4',
        relError: `${(((Cd - 2.05) / 2.05) * 100).toFixed(2)}%`,
        pass: Cd >= SANITY_LO && Cd <= SANITY_HI,
      },
      {
        label: 'mechanism (known limitation, spec 1.2f)',
        measured: 'low-Re confinement · β = 5% · uniform inlet',
        literature: 'outlet ruled out (D-4); resolution ruled out (1/D)',
        relError: '—',
        pass: true,
      },
      {
        label: '|Cl| max over tail (symmetry at scale, informative)',
        measured: clAbsMax.toExponential(2),
        literature: '0 (≈ machine zero)',
        relError: '—',
        pass: clAbsMax <= 0.01,
      },
      {
        label: 'Cd oscillation (outlet cavity mode, informative)',
        measured: `±${((cdMax - cdMin) / 2).toFixed(4)}, period ≈ ${Math.round(period)} steps`,
        literature: `acoustic round trip 2·Nx/c_s ≈ ${Math.round((2 * CYL.Nx) / (1 / Math.sqrt(3)))} steps`,
        relError: '—',
        pass: true,
      },
      {
        label: 'L_r/D (informative, not gating)',
        measured: lrOverD.toFixed(3),
        literature: '≈ 0.92',
        relError: `${(((lrOverD - 0.92) / 0.92) * 100).toFixed(1)}%`,
        pass: true,
      },
    ],
  );

  // The ONLY hard assertion (spec 1.2f): a loose sanity bound catching gross
  // regressions/NaN. BM-2 is intentionally NOT gated to the literature ±6%
  // window (1.93–2.17): its +6.8% excess over the unconfined 2.05 reference is
  // a documented known-limitation (low-Re confinement, β = 5%, uniform inlet —
  // outlet ruled out by D-4, resolution by 1/D; a confined gate needs a
  // parabolic inlet and is a v2 item). See the header and VALIDATION.md.
  expect(
    Cd,
    `Cd = ${Cd.toFixed(3)} outside the loose sanity bound ${SANITY_LO}–${SANITY_HI} ` +
      `(gross regression or NaN — this is NOT the literature ±6% gate, which BM-2 is not held to)`,
  ).toBeGreaterThanOrEqual(SANITY_LO);
  expect(
    Cd,
    `Cd = ${Cd.toFixed(3)} outside the loose sanity bound ${SANITY_LO}–${SANITY_HI}`,
  ).toBeLessThanOrEqual(SANITY_HI);
});
