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

## Summary (2026-07-16, Zou–He BC pair + Lallemand–Luo ghost rates)

| Case | Quantity | Measured | Reference | Tolerance | Status |
|---|---|---|---|---|---|
| BM-1 Poiseuille, Re_H = 20 | L2(u_x) vs analytic parabola | **0.159%**, converged 36.5k steps | exact solution | ≤ 1% | ✅ |
| BM-2 Cylinder, Re = 20 | Cd | no convergence in 80k steps; last Cd = 2.490 | 2.05 (2.0–2.1)¹ | ±6% | ❌ **open finding** |
| BM-3 Cylinder, Re = 100 | mean Cd | 1.546 (+15.4%) | 1.34 (1.33–1.35)² | ±7% | ❌ **open finding** |
| BM-3 Cylinder, Re = 100 | St | 0.1743 (+5.6%) | 0.165 (0.164³) | ±5% | ❌ **open finding** |
| Re-ceiling smoke (rev 2, informative) | finiteness at τ = 0.51008 | finite through 25k steps, D = 12, Re = 250 ≈ 21·D | — | non-gating | ✅ |

¹ Dennis & Chang (1970), Fornberg (1980), Coutanceau & Bouard (1977) — steady
regime; recirculation length L_r/D ≈ 0.92.
² Braza, Chassaing & Ha Minh (1986); established 2D simulations cluster at
1.33–1.35.
³ Williamson (1989), experimental St–Re relationship: St = 0.164 at Re = 100.

Reference values are for **unbounded** flow; the cylinder cases run confined
(β = 5%, bounce-back side walls). See the open finding below: with the
well-posed BCs the confinement/discretization biases are no longer masked by
the old secular drift, and the windows may need recalibrating against
confined references — a maintainer/spec decision, not the implementer's.

## BM-1 · Plane Poiseuille, Re_H = 20 — PASS

Channel 300×52 (H = 50 fluid rows, half-way walls at ŷ = 0 and ŷ = H),
τ = 1.025, Zou–He velocity inlet / Zou–He pressure outlet. Profile measured
at x = 5H against the flux-matched analytic parabola.

```
================ BM-1 · Plane Poiseuille, Re_H = 20 ================
setup: channel 300×52 (H = 50 fluid rows, walls at ŷ = 0 and ŷ = H), τ = 1.025,
       profile at x = 250 = 5H, converged after 36500 steps
PASS  L2(u_x profile vs analytic parabola): measured 0.159%  | literature exact solution (tolerance 1%)  | rel.err 0.159%
PASS  peak/mean ratio (analytic: 1.500): measured 1.4964  | literature 1.500  | rel.err -0.24%
```

The case the old BCs killed outright (exponential choking, no convergence
ever) now converges in 36,500 steps to L2 = 0.159% — five times inside the
gate, with the peak/mean ratio at −0.24% of analytic. This is the only case
with an exact solution, and it validates viscosity, wall placement and the
new BC pair in one shot.

## BM-3 · Cylinder at Re = 100 — previous PASS ANNULLED; re-run out of window

The 2026-07-14 PASS (Cd = 1.403, St = 0.1604) was measured under the old BC
pair whose secular drift biased both values low; spec 1.2b voids it. Re-run
under the well-posed system (same domain, discard and windows; 12 full
shedding periods):

```
================ BM-3 · Cylinder, Re = 100 (von Kármán) ================
setup: 720×400, D = 20 (β = 5%), bounce-back side walls, perturbed first 200
       steps, 30000 steps discarded, measured over 21000 steps = 12 full
       shedding periods
FAIL  mean Cd: measured 1.546  | literature 1.34 (range 1.33–1.35)  | rel.err 15.39%
FAIL  St (Cl zero crossings): measured 0.1743  | literature 0.165 (Williamson: 0.164)  | rel.err 5.61%
PASS  Cl amplitude (informative): measured 0.407  | ≈ 0.23–0.35 (2D simulations)
```

**Drift-bias shift (old → new, the quantity spec 1.2b asked to record):**
Cd 1.403 → 1.546 (+10.2%), St 0.1604 → 0.1743 (+8.7%). This shift *is* the
bias the old choking drift introduced: the decaying effective velocity read
as lower forces and lower shedding frequency, and happened to land both
values inside windows written for unbounded flow. The old PASS was two
errors cancelling. See the open finding below.

## Resolved finding: velocity inlet over-constrains density (was blocking BM-1, BM-2)

**Status:** RESOLVED (2026-07-16) by the Phase 1.2b system change — Zou–He
velocity inlet (free density) + Zou–He pressure outlet (ρ = 1) + Lallemand–Luo
ghost rates. Evidence of closure: BM-1 now converges in 36.5k steps to
L2 = 0.159% (it previously choked exponentially and never converged); INV-6
holds the driven channel stationary to a fitted slope of −5.4·10⁻¹²/step with
the domain mean sitting exactly on the analytic Poiseuille ramp. The
cylinder-benchmark windows opened a *different*, successor finding — see
"BM-2/BM-3 out of window" below. Original record kept for reference.

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

## Resolved finding (Phase 1.2b): Zou–He inlet is unstable with the tuned MRT ghost rates

**Status:** RESOLVED by spec rev 2 (2026-07-15) — the ghost rates are retuned
to the Lallemand–Luo reference values s_e = s_ε = 1.4, s_qx = s_qy = 1.2 as
part of the same system change (boundary scheme and ghost rates are a coupled
system; see AGENTS.md invariants table). With the new rates the full fast
tier (BC-1, INV-1…5) is green on this branch. The evidence below is kept as
the record behind the rev 2 decision.

**Symptom.** With the Zou–He pair implemented per spec — and its direction
mapping verified exactly by the new BC-1 test (moments to ≤ 1e-12) — the
walled channel (100×50, u₀ = 0.07) reaches NaN within 2,000–5,000 steps at
*every* τ tested (0.51, 0.8, 1.5). INV-2 fails: the uniform equilibrium,
still an exact fixed point of the new BCs, becomes linearly *unstable* —
round-off grows ~×50 per 250 steps at τ = 0.8 until blow-up. INV-4 fails at
both τ band edges (NaN before 10,000 steps). τ = 1.5 is creeping flow
(Re_H ≈ 10); this is a numerical instability, not a physical one.

**Bisection (walled channel, τ = 1.5, 12k steps).**

| Configuration | Result |
|---|---|
| Zou–He inlet + old zero-gradient outlet | secular mass growth, unbounded |
| Old equilibrium inlet + Zou–He outlet | **stable**, converges (mean ρ = 1.083, stationary) |
| Zou–He inlet + Zou–He outlet | NaN ≤ 2,000 steps |
| Same, parabolic inlet profile (diagnostic) | NaN — rules out the plug-profile/no-slip corner singularity |
| Same, ghost rates e/eps = 1.8, q = 1.2 | NaN — energy mode is the culprit, not q |
| Same, ghost rates e/eps ≤ 1.6 | stable |
| Same, Lallemand–Luo rates (1.4 / 1.2) | **stable everywhere tested**: channel converges to a stationary pressure-drop state (mean ρ ≈ 1.021) at all three τ; INV-2 setup passes at 2.2e-14; INV-4 cylinder survives 10k steps at both τ = 0.51 and τ = 1.5 |

**Hypothesis.** Zou–He is a wet-node scheme: boundary nodes are reconstructed
every step and then collided. The reconstruction fixes the hydrodynamic
moments exactly but injects uncontrolled non-equilibrium content into the
ghost (energy) moments; with the project's aggressive over-relaxation
s_e = s_eps = 1.8 (multiplier −0.8 per collision) the boundary
reconstruction–collision–streaming loop acquires an eigenvalue above 1. The
instability is a property of the (Zou–He × s_e = 1.8) combination — not of
the mapping (BC-1 exact), the profile (parabolic also blows up), or the
outlet (stable in isolation).

**Resolution (spec rev 2).** The old rates were never an invariant of the
solver alone but of the solver+BC pair: the legacy equilibrium inlet silently
wiped ghost content at the boundary each step. Rev 2 retunes to
Lallemand–Luo values as part of the BC system change, documents scheme+rates
as a coupled system, and adds an informative Re-ceiling smoke check (the
high-Re margin was tuned against the old inlet). Regularized BCs (Latt 2008)
are recorded in the backlog as the principled path to higher rates.

**Spec erratum (fixed in rev 2, verified by BC-1):** the first version of the
spec had the ½(f_N − f_S) corner terms of the outlet f_NW/f_SW transposed; as
written they violated the ρ·u_y = 0 constraint (they give
u_y = 2(f_N − f_S)/ρ). The implementation always used the
constraint-consistent signs, pinned by BC-1: f_NW = f_SE − ½(f_N − f_S) −
(1/6)ρu, f_SW = f_NE + ½(f_N − f_S) − (1/6)ρu.

## Resolved finding (Phase 1.2b rev 2): INV-6 mean-density gate was below the analytic Poiseuille offset

**Status:** RESOLVED by spec rev 3 (2026-07-16) — the mean gate is now
referenced to the physics the test itself imposes:
|ρ_mean − (1 + Δρ/2)| ≤ 0.5·(Δρ/2) with Δρ = 36·ν·ū·L/H² computed inside the
test. INV-6 passes (measured 1.012749 vs predicted 1.011025, deviation 31% of
the allowed margin); the slope gate is unchanged. Evidence kept below.

**Setup (exactly as spec'd).** Driven channel 120×50 (walls on rows 0/49,
H = 48), u₀ = 0.07, Re_H = 20 → ν = 0.168, τ = 1.004. 50,000 steps; domain-mean
density sampled every 50 steps over the last 40,000.

**Measured.**

- Slope gate (the actual regression guard): **PASS** — linear-fit slope
  −5.4·10⁻¹² per step vs gate ≤ 1·10⁻⁹; first and last window samples differ
  by 4·10⁻⁶. The state is genuinely stationary: no trace of the 1.2 failure
  mode (which drifted to ρ ≈ 1.22).
- Mean gate: **FAIL** — |ρ_mean − 1| = 1.275·10⁻² vs gate ≤ 5·10⁻³.

**Why the measured value is the physically correct one.** A driven channel
holds a streamwise pressure ramp — that is the very physics Phase 1.2b
restores. With the outlet pinned at ρ = 1, the analytic plane-Poiseuille drop
is Δρ = 36·ν·u₀·L/H² = 2.21·10⁻² across the channel, so the domain-mean
offset is ≈ Δρ/2 = 1.10·10⁻², plus a small entrance-region overpressure
(the uniform-profile inlet). Measured ρ(x) confirms it: a clean linear ramp
from 1.0212 (x = 20, developed region) to exactly 1.0000 at the outlet,
slope within 4% of analytic, entrance bump decaying within ~10 cells.
Substituting Re_H = 20 the offset is 0.9·u₀²·(L/H) — for the spec's grid
(L/H = 2.5) that is 1.1·10⁻² ≥ 2× the gate. **No correct implementation can
pass the 5·10⁻³ gate on the spec's own grid**; shrinking L/H below ~1.1 would
technically pass but makes the channel all entrance region (L_e ≈ H at
Re_H = 20), defeating the test's meaning.

**Hypothesis.** Threshold misestimate in the spec: 5·10⁻³ was chosen as
"settles near 1" without computing the Poiseuille ramp mean for the chosen
grid. Options for the maintainer: gate the mean against the analytic
prediction (e.g. |ρ_mean − (1 + Δρ_analytic/2)| ≤ 2·10⁻³), or raise the
absolute gate to ~2·10⁻² (still 10× below the 1.2 failure signature), or gate
on the outlet-column density instead. Not for the implementer to pick.

## Open finding: BM-2/BM-3 out of window under the well-posed system

**Status:** open · discovered 2026-07-16 on re-running the benchmarks under
the Zou–He + Lallemand–Luo system · discrepancy protocol: documented, nothing
recalibrated, revalidation halted at this point (app smoke check and phase
closure pending). Maintainer decision needed.

**Measured.**

- **BM-2 (Re = 20, 720×400, τ = 0.71):** Cd does not meet the convergence
  gate (ΔCd/Cd ≤ 10⁻⁵ per 1,000 steps) within the 80,000-step safety cap;
  last Cd = 2.490, above the 1.93–2.17 window. Note the *behavior* changed
  qualitatively vs the old BCs: then, Cd decayed secularly through the whole
  literature range (2.32 → 1.49 over 150k steps, mass piling up); now it
  sits high. Whether it is still slowly relaxing downward, oscillating below
  the gate's resolution, or genuinely converged-but-high cannot be
  distinguished from the test output — the cheap discriminator is a
  diagnostic re-run logging Cd(t), ~2.2 min per 1,000 steps on this domain.
- **BM-3 (Re = 100):** mean Cd = 1.546 (+15.4% vs unbounded 1.34; window
  ±7%), St = 0.1743 (+5.6% vs 0.165; window ±5%, missed by 0.0013).
  Cl amplitude 0.407 (informative; high side of 2D range, as before).

**Quantified biases (diagnostics on the BM domain).**

- **Rasterized diameter:** the D = 20 disk rasterizes to 312 cells
  (area-equivalent D_eff = 19.93) but its cross-flow solid extent is 20 rows
  → hydrodynamic width ≈ 21 with half-way bounce-back. Cd normalizes by
  D = 20 while the flow sees ~21: ≈ +5% on Cd.
- **Incident velocity:** measured on the centerline 5–8 D upstream of the
  cylinder (BM-2 setup, 8k steps): +1.0–1.2% over u₀ (inlet flux itself
  +0.54%, wall boundary layers thin at these x). ≈ +2% on Cd, ≈ +1% on St.
- **Confinement:** β = 5% with no-slip walls raises Cd a few % and St ~2–4%
  relative to unbounded references (the windows are written against
  unbounded values).

**Hypothesis.** The old drift biased both quantities *down* and happened to
park them inside unbounded-flow windows — the 2026-07-14 BM-3 PASS was two
errors cancelling (recorded shift: Cd +10.2%, St +8.7%). The identified
biases above compose to roughly +8–11% on Cd and +3–5% on St, accounting for
most but not all of the excess (residual ~3–6% on Cd, ~1–2% on St). Candidate
explanations for the residual, in decreasing plausibility: (a) the acceptance
windows simply need recalibrating against *confined* (β = 5%, no-slip)
references and/or an effective-diameter-aware normalization — a spec
revision; (b) the Zou–He pressure outlet is acoustically reflective and the
anchored ρ = 1 plane 25 D downstream stiffens the wake dynamics relative to
the convective outflow implied by unbounded references — testable by moving
the outlet or comparing against a longer domain; (c) a genuine post-change
force-path bias not caught by INV-1…6 — considered unlikely given BM-1's
0.159% and the exact BC-1 moments, but not excluded. Per the discrepancy
protocol, choosing among these (or revising the spec) is the maintainer's
call.

## Known limitations (independent of the findings above)

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
