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

## Summary (2026-07-20, official setups: D = 30 free-slip cylinders)

Phase 1.2 closure. The cylinder benchmarks now run their **official** setup
per the phase 1.2d endpoint decisions: D = 30 cells, blockage β = 5%
(Ny = 600, Nx = 1080), **free-slip side walls** — the standard configuration
for comparing a confined tunnel against unconfined references. BM-1 keeps
no-slip walls (its physics requires them). The app default is unchanged
(no-slip); free-slip is a benchmark option.

| Case | Quantity | Measured | Reference | Tolerance | Status |
|---|---|---|---|---|---|
| BM-1 Poiseuille, Re_H = 20 | L2(u_x) vs analytic parabola | **0.159%**, converged 36.5k steps | exact solution | ≤ 1% | ✅ |
| BM-2 Cylinder, Re = 20 (D = 30) | Cd (windowed mean) | 2.190, converged | 2.05 (2.0–2.1)¹ | ±6% | ❌ **open finding** (+6.8%) |
| BM-3 Cylinder, Re = 100 (D = 30) | mean Cd | **1.428** (+6.6%) | 1.34 (1.33–1.35)² | ±7% | ✅ |
| BM-3 Cylinder, Re = 100 (D = 30) | St | **0.1691** (+2.5%) | 0.165 (0.164³) | ±5% | ✅ |
| Re-ceiling smoke (rev 2, informative) | finiteness at τ = 0.51008 | finite through 25k steps, D = 12, Re = 250 ≈ 21·D | — | non-gating | ✅ |

¹ Dennis & Chang (1970), Fornberg (1980), Coutanceau & Bouard (1977) — steady
regime; recirculation length L_r/D ≈ 0.92.
² Braza, Chassaing & Ha Minh (1986); established 2D simulations cluster at
1.33–1.35.
³ Williamson (1989), experimental St–Re relationship: St = 0.164 at Re = 100.

**Two of three benchmarks pass at the official setup; BM-2 is a converged,
documented open finding.** Reference values are for **unbounded** flow. The
excess over unbounded windows decomposes into two *measured* biases — wall
boundary layers (removed by free-slip walls) and staircase/resolution
(removed by the D = 20 → 30 refinement, first-order in 1/D) — see the
refinement study below. For **BM-3** both biases fully account for the excess:
at D = 30 free-slip it lands inside both windows and the 1/D extrapolation
sits on the reference (finding closed). For **BM-2** they do not: refinement
barely moves it and the 1/D extrapolation misses the reference by +4.5%; the
residual is the reflective outlet's acoustic cavity mode. Per the phase 1.2d
hard rule, BM-2 outside 2.05 ± 6% at D = 30 is a **stop-and-report** — no
window edits, no retuning — and phase close-out is deferred to the maintainer.

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

## BM-2 · Cylinder at Re = 20 (D = 30, free-slip) — converged, out of window

Official setup: 1080×600, D = 30 (β = 5%), free-slip side walls. Full
150,000-step run; the convergence gate and reported Cd use the final 50,000
steps (corrected gate below). BM-2 has no perturbation/RNG, so the run is
bit-reproducible and the reported Cd is deterministic.

```
================ BM-2 · Cylinder, Re = 20 (steady) ================
setup: 1080×600, D = 30 (β = 5%), free-slip side walls, 150000 steps,
       gate on final 50000 steps (two 25000-step window means within 0.2%:
       2.1895/2.1903), Cd = mean over that tail
FAIL  Cd (windowed mean): measured 2.190  | literature 2.05 (range 2.0–2.1)  | rel.err 6.82%
PASS  |Cl| max over tail (symmetry at scale): measured 1.09e-13  | 0 (tolerance 0.01)
INFO  Cd oscillation (outlet cavity mode): ±0.0504, period ≈ 1682 steps  | acoustic round trip 2·Nx/c_s ≈ 3741 steps
INFO  L_r/D (not gating): measured 0.995  | ≈ 0.92
```

Cd = 2.190 is **converged** (the two 25k tail windows agree to 0.04%) but
+6.82% above the reference and +0.9% above the window top (2.17). It is not
drifting (mean density stationary at 0.9997, |Cl| ~ 1e-13) and not shedding
(Re = 20 is far below the onset Re ≈ 47): the ±0.05 oscillation is the outlet
acoustic cavity mode (below), which the windowed mean averages out. The
residual excess is analysed in the refinement study and the open finding.

## BM-3 · Cylinder at Re = 100 (D = 30, free-slip) — PASS

The 2026-07-14 PASS (Cd = 1.403, St = 0.1604) under the old BC pair was voided
by spec 1.2b — its secular drift biased both values low (two errors
cancelling: Cd +10.2%, St +8.7% on the re-run). The official benchmark now
runs the well-posed system at the refined setup: 1080×600, D = 30 (β = 5%),
free-slip side walls, time windows scaled with D/u₀ (45,000 discarded, 31,500
measured). Perturbation is injected the first 200 steps (UI-mirrored); the
saturated limit cycle is what is measured (its statistics are reproducible,
the random transient is not).

```
================ BM-3 · Cylinder, Re = 100 (von Kármán) ================
setup: 1080×600, D = 30 (β = 5%), free-slip side walls, perturbed first 200
       steps, 45000 steps discarded, measured over 31500 steps = 12 full
       shedding periods
PASS  mean Cd: measured 1.428  | literature 1.34 (range 1.33–1.35)  | rel.err 6.55%
PASS  St (Cl zero crossings): measured 0.1691  | literature 0.165 (Williamson: 0.164)  | rel.err 2.48%
PASS  Cl amplitude (informative): measured 0.375  | ≈ 0.23–0.35 (2D simulations)
```

Both gating quantities inside their windows: mean Cd 1.428 (window
1.246–1.434) and St 0.1691 (window 0.157–0.173). This is the first
fully-passing cylinder benchmark under the well-posed BC system, and it
validates the excess decomposition — the two measured biases (wall-BL and
staircase/resolution) account for the entire Re = 100 excess.

## Refinement study — the staircase bias is first-order in 1/D (headline result)

The cylinder rasterises on the lattice; half-way bounce-back on a curved
surface carries an O(1-cell) geometric error that biases Cd high and shrinks
with resolution. Measuring both benchmarks at D = 20 and D = 30 (free-slip,
β = 5% held constant) isolates this staircase/resolution bias and, via a
two-point 1/D fit (Cd = a + b/D), extrapolates it away:

| Quantity | D = 20 free-slip | D = 30 free-slip | shift | 1/D → ∞ | reference |
|---|---|---|---|---|---|
| BM-2 Cd | 2.214 | 2.190 | −1.09% | **2.14** | 2.05 |
| BM-3 Cd | 1.4740 | 1.428 | −3.12% | **1.336** | 1.34 (1.33–1.35) |
| BM-3 St | 0.1674 | 0.1691 | +1.06% | ≈ 0.173 | 0.165 |

(D = 20 free-slip values from the phase 1.2c diagnostics; D = 30 from the
official runs. Two-point, first-order extrapolation — informative, not a
gate.)

**BM-3 is the clean case.** Cd moves materially toward the reference under
refinement (−3.12%) and the 1/D extrapolation lands at 1.336 — on the
established 2D range (1.33–1.35), −0.30% from 1.34. The staircase bias is
fully accounted: the D = 30 measured value is already inside the window and
the D → ∞ limit is the unconfined reference. St is roughly flat under
refinement and extrapolates to ≈ 0.173 (window top) — still inside.

**BM-2 is the discriminator.** Refinement moves it only −1.09% (a third of
BM-3's shift), and the 1/D extrapolation lands at 2.14 — inside the window
but **+4.5% off the reference** (2.05), not on it as BM-3's is. Refinement
neither reaches the reference nor brings the measured D = 30 value into
window. The maintainer's on-record prediction (Cd(30) ≈ 2.16–2.17,
extrapolated ≈ 2.06) is **not borne out**: measured 2.190 and extrapolated
2.14 are both high. This is the resolution discriminator doing its job — it
rules resolution *out* as the dominant residual for BM-2 and points at the
D-independent mechanism below.

## Outlet acoustic cavity mode (BM-2) — the dominant BM-2 residual

The Zou–He pressure outlet anchors ρ = 1 on a plane and is acoustically
reflective; so is the Zou–He velocity inlet. Between them the domain is a
resonant cavity. At Re = 20 there is no vortex shedding (onset Re ≈ 47), so
the Cd oscillation is purely this acoustic mode:

| | D = 20 (Nx = 720) | D = 30 (Nx = 1080) |
|---|---|---|
| dominant period | ≈ 2200 steps | ≈ 1682 steps |
| acoustic round trip 2·Nx/c_s | ≈ 2494 steps | ≈ 3741 steps |
| half-amplitude | ±0.0094 | ±0.0504 |
| as fraction of Cd | ±0.42% | ±2.30% |

The period is of order the inlet–outlet acoustic transit (Nx/c_s), which
identifies the source. The mode is **bounded and mean-stationary** — it does
not drift, and the windowed mean over ≥ 20 periods averages it out — which is
why the corrected gate (below) is a measurement fix, not a tolerance
relaxation. But its amplitude **grows with domain size** (±0.42% → ±2.30% of
Cd from D = 20 to D = 30). That growth is a second, independent line of
evidence that the outlet mode — not resolution — is the dominant BM-2
residual: a resolution bias would shrink under refinement; this one
strengthens.

## Corrected BM-2 convergence gate (measurement-definition fix)

The phase 1.2 gate (|ΔCd|/Cd ≤ 1e-5 over 1,000 steps) is **unsatisfiable** in
the presence of the acoustic mode: at D = 20, amplitude ±0.0094 with period
≈ 2200 steps produces in-window excursions of order
2·0.0094·sin(π·1000/2200) ≈ 0.019 per 1,000 steps — three orders of magnitude
above the gate. No stationary state can pass it; the "non-convergence" it
reported was the mode, not drift.

Corrected gate (spec 1.2d): run the full budget, split the final 50,000 steps
into two consecutive 25,000-step windows, and require their mean Cd to agree
to ≤ 0.2% (relative). The **reported Cd is the mean over that final 50,000
steps** (≥ 20 acoustic periods). The acceptance window is **unchanged**
(2.05 ± 6%); only the definition of "converged" changed. The gate is applied
to the tail of a *completed* fixed-budget run, never as a sliding early-stop:
the transient does not settle until ~50,000 steps (Cd spikes to ~2.42 at 10k,
dips to ~2.00 at 20k), and two windows evaluated across it can agree by chance
at a non-stationary value — a false positive observed and discarded during
this session. This is the fourth spec erratum of the phase in the same
family: numeric gates and claims must carry their derivation.

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

## Open finding: BM-2 residual is outlet reflectivity (stop-and-report)

**Status:** open · BM-2 only (BM-3 closed at D = 30, see above) ·
phase 1.2d stop-and-report per the hard rule: BM-2 outside 2.05 ± 6% at
D = 30 → document the value, the D = 20 → 30 trend and the 1/D extrapolation,
then stop — no window edits, no retuning, no closure.

**History.** Discovered 2026-07-16 on re-running the benchmarks under the
well-posed Zou–He + Lallemand–Luo system: both cylinder cases read high
(BM-2 non-converged at 2.490 and drifting; BM-3 Cd 1.546 +15.4%, St 0.1743
+5.6%) against windows written for unbounded flow. The old BC drift had
biased both *down* and parked them inside those windows — the 2026-07-14
BM-3 PASS was two errors cancelling (shift on re-run: Cd +10.2%, St +8.7%).
Phase 1.2c added free-slip side walls and ran the diagnostic sequence that
decomposed the excess; phase 1.2d took both cylinders to the D = 30 free-slip
official setup with the corrected gate.

**The excess decomposes into two measured biases.**

- **Wall boundary layers** — removed by free-slip side walls. Directly
  measured (1.2c D-2): no-slip → free-slip shifts BM-3 Cd −4.7% and St −4.0%,
  and turns BM-2 from 2.490-and-drifting (no-slip, 80k cap) into 2.214
  converged-in-the-mean. The free-slip incident-velocity probe reads
  u₀ − 2.4% (the no-slip wall-BL overshoot of +1.0–1.2% is gone).
- **Staircase/resolution** — removed by the D = 20 → 30 refinement,
  first-order in 1/D (refinement study above).

For **BM-3** the two biases fully account for the excess: at D = 30 free-slip
it is inside both windows (Cd 1.428, St 0.1691) and the 1/D extrapolation
sits on the reference (Cd(D→∞) ≈ 1.336). **Finding closed for BM-3.**

**What remains (BM-2).** After both biases are removed, BM-2 still reads 2.190
at D = 30 (+6.8%), and refinement neither reaches the reference
(1/D → 2.14, +4.5%) nor brings the measured value into window. The residual
is the **outlet acoustic cavity mode**, confirmed by two independent
signatures (see the acoustic-mode section): (i) refinement barely moves BM-2
and does not extrapolate onto the reference — it is not resolution; (ii) the
mode's amplitude grows with domain size (±0.42% → ±2.30% of Cd). This is the
phase-1.2c residual suspect (b) — outlet reflectivity — now de-confounded
from the wall-BL and resolution biases and promoted from hypothesis to the
leading explanation. The remaining suspect (c), a post-change force-path
bias, stays unlikely: BM-1's 0.159%, the exact BC-1 moments, and BM-3's clean
pass at D = 30 all exercise the same force path.

**Why it is a stop, not a fix.** Removing the mode requires a genuinely
non-reflecting outlet or an extended (≈ 40D) outlet buffer — a
`src/lbm/boundaryConditions.ts` change that needs its own spec (AGENTS.md
rule 1). Per the phase 1.2d endpoint decision that work is on the
**backlog**, revisited only if it ever gates a result. The maintainer's
options, none of which the implementer may take unilaterally: (a) spec the
non-reflecting/extended outlet and re-measure BM-2; (b) adopt a documented
BM-2 tolerance against *confined, reflective-outlet* references rather than
unbounded ones; (c) accept BM-2 as a documented known-limitation benchmark.
Phase close-out (app smoke, AGENTS.md BC-row note, decision log) is deferred
until this is resolved.

## Known limitations (independent of the findings above)

- **2D.** Vortex dynamics at Re ≳ 190 are three-dimensional in reality; 2D
  values (e.g. mean Cd at Re = 100) systematically differ from 3D experiments
  by a few percent.
- **Staircase boundaries.** Solids are rasterised on the lattice; curved
  surfaces carry O(1-cell) geometric error. Half-way bounce-back is
  second-order accurate on straight walls only.
- **Blockage.** The cylinder benchmarks run at β = 5% with free-slip side
  walls (the unconfined-comparison configuration); unbounded-flow references
  carry a small systematic offset at this blockage. The app default is
  no-slip walls.
- **Reflective outlet.** The Zou–He pressure outlet is acoustically
  reflective and, with the reflective velocity inlet, sustains a bounded
  acoustic cavity mode in the cylinder domains (period ~ Nx/c_s). It is
  mean-stationary and averaged out by the windowed-mean gate, but it is the
  dominant residual keeping BM-2 above its window — see the open finding. A
  non-reflecting / extended outlet is on the backlog.
- **Reynolds ceiling.** The MRT scheme with the current grid presets is
  honest up to Re ≈ 21·D_cells; beyond that the safety indicator warns and
  results must not be trusted.
