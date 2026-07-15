# Validation

This document records how SOPLO's solver performs against canonical benchmarks
with exact or well-established reference values. It is a lab report, not
marketing: failures and open findings are documented alongside passes. Setups,
tolerances and the discrepancy protocol are specified in
[`docs/specs/phase-1-validation.md`](./docs/specs/phase-1-validation.md);
the tests live in [`tests/benchmarks/`](./tests/benchmarks/) and run with
`npm run test:bench`.

All benchmarks run headless in lattice units (u₀ = 0.07, ρ₀ = 1). Force
coefficients come from `LBMSolver.computeForces()` — the exact code path the
UI uses, no test-local normalization. Sign conventions:
[`docs/specs/cl-sign-convention.md`](./docs/specs/cl-sign-convention.md).

## Summary (2026-07-14)

| Case | Quantity | Measured | Reference | Tolerance | Status |
|---|---|---|---|---|---|
| BM-1 Poiseuille, Re_H = 20 | L2(u_x) vs analytic parabola | 0.80% at best (see finding) | exact solution | ≤ 1% | ❌ **open finding** |
| BM-2 Cylinder, Re = 20 | Cd | no convergence (see finding) | 2.05 (2.0–2.1)¹ | ±6% | ❌ **open finding** |
| BM-2 Cylinder, Re = 20 | Cl | ~10⁻¹⁴ during run | 0 | ≤ 0.01 | ✅ (informative) |
| BM-3 Cylinder, Re = 100 | mean Cd | 1.403 (+4.70%) | 1.34 (1.33–1.35)² | ±7% | ✅ |
| BM-3 Cylinder, Re = 100 | St | 0.1604 (−2.77%) | 0.165 (0.164³) | ±5% | ✅ |

¹ Dennis & Chang (1970), Fornberg (1980), Coutanceau & Bouard (1977) — steady
regime; recirculation length L_r/D ≈ 0.92.
² Braza, Chassaing & Ha Minh (1986); established 2D simulations cluster at
1.33–1.35.
³ Williamson (1989), experimental St–Re relationship: St = 0.164 at Re = 100.

## BM-3 · Cylinder at Re = 100 (von Kármán street) — PASS

Domain 720×400 (D = 20 cells, blockage β = 5%), bounce-back side walls,
velocity inlet / zero-gradient outlet. Transverse perturbation injected the
first 200 steps (as in the UI); the first 30,000 steps (~100 convective times)
discarded; statistics over 18,000 steps (≥ 10 shedding periods). Strouhal is
measured from upward zero crossings of the mean-removed Cl signal.

```
================ BM-3 · Cylinder, Re = 100 (von Kármán) ================
setup: 720×400, D = 20 (β = 5%), bounce-back side walls, perturbed first
       200 steps, 30000 steps discarded, measured over 21000 steps = 11
       full shedding periods
PASS  mean Cd: measured 1.403 | literature 1.34 (range 1.33–1.35) | rel.err 4.70%
PASS  St (Cl zero crossings): measured 0.1604 | literature 0.165 | rel.err -2.77%
PASS  Cl amplitude (informative): measured 0.412 | ≈ 0.23–0.35 (2D simulations)
```

Mean Cd sits +4.7% above the 2D-literature center — consistent in sign and
magnitude with the 5% blockage and bounce-back side walls (confined cylinders
read higher Cd). The Cl amplitude (0.412) is likewise on the high side of the
2D range, same expected confinement bias; it is reported as informative only.
Runtime: ~18 min on an Apple M5 (single process).

## Open finding: velocity inlet over-constrains density (affects BM-1, BM-2)

**Status:** blocking BM-1 and BM-2 · discovered 2026-07-14 during this phase ·
solver untouched pending maintainer decision (discrepancy protocol).

**Symptom (BM-1, channel 300×52, Re_H = 20, τ = 1.025).** The velocity profile
develops the correct parabolic *shape* (peak/mean = 1.513 vs analytic 1.5; L2
vs the flux-matched parabola = 0.80%, within the 1% gate) but its *magnitude*
decays exponentially — the channel chokes. Measured at x = 5H: mean u_x drops
from 0.024 (step 5k) to 1.2·10⁻⁴ (step 40k) while the global mean density
climbs from 1.0 to a saturated 1.2247 with the inlet column pinned at ρ = 1.
The spec's convergence criterion (profile change ≤ 10⁻⁸ per 500 steps) is
unreachable: the observed 7.2·10⁻² plateau *is* the constant relative change
of an exponential decay. Past ~130k steps the near-stagnant, strongly
stratified state destabilizes (L2 vs parabola peaks at 82%).

**Symptom (BM-2, cylinder Re = 20, 720×400, τ = 0.71).** Same mechanism,
slower (larger domain, lower ν), traced to 150k steps: mean density climbs
secularly with no sign of saturation (1.0056 at step 5k → 1.0626 at 150k)
while Cd decays quasi-linearly through the entire literature range without
converging — 2.32 (5k) → 2.05 (≈45k, crossing the reference value purely in
transit) → 1.83 (80k) → 1.49 (150k). The spec gate (ΔCd/Cd ≤ 10⁻⁵ per 1,000
steps) is never met. Flow symmetry is meanwhile excellent throughout
(|Cl| ~ 10⁻¹⁴).

**Root-cause hypothesis.** `applyInlet` imposes full equilibrium with **fixed
ρ = 1 in addition to the velocity** — an over-constrained inlet. A channel
with wall friction needs a streamwise pressure gradient; with inlet pressure
pinned low and a zero-gradient outlet, the interior pressurizes until the
adverse gradient chokes the inflow. The choking timescale shrinks with
viscosity and confinement, which is why the narrow, viscous BM-1 dies in ~10⁴
steps, BM-2 drifts over ~10⁵, and BM-3 (measured over 48k steps, low ν) still
passes. The standard fix is a velocity inlet that lets density float (e.g.
Zou–He / non-equilibrium bounce-back) and/or a genuinely non-reflecting
outlet — both are `src/lbm/boundaryConditions.ts` changes requiring a spec
per AGENTS.md rule 1.

**Why BM-3 passes anyway:** its gates are statistics of a saturated limit
cycle measured over a window (48k steps) much shorter than the choking
timescale at ν = 0.014 in a 400-cell-tall domain.

## Known limitations (independent of the finding above)

- **2D.** Vortex dynamics at Re ≳ 190 are three-dimensional in reality; 2D
  values (e.g. mean Cd at Re = 100) systematically differ from 3D experiments
  by a few percent.
- **Staircase boundaries.** Solids are rasterised on the lattice; curved
  surfaces carry O(1-cell) geometric error. Half-way bounce-back is
  second-order accurate on straight walls only.
- **Blockage.** The cylinder cases run at β = 5% with bounce-back side walls;
  unbounded-flow references carry a small systematic offset at this blockage.
- **Reynolds ceiling.** The MRT scheme with the current grid presets is
  honest up to Re ≈ 21·D_cells; beyond that the safety indicator warns and
  results must not be trusted.
