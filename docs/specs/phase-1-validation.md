# Phase 1 Spec — Validation & Test Harness

> Status: **complete (2026-09-20)** · Owner: Alex · Executed by: coding agent, one sub-phase per session.
> Prereqs: Phase 0 complete (hook extraction done, repo clean).
> Rules: `AGENTS.md` applies. This spec authorizes the specific solver-adjacent
> changes listed below and nothing else.

## Goal

Give SOPLO its credential: an automated, headless test suite proving that the
solver (a) preserves the invariants LBM must preserve, and (b) reproduces
canonical benchmark values from the literature within stated tolerances —
documented in `VALIDATION.md` and enforced by CI.

## Sub-phases (one agent session each)

- **1.1** Test harness + invariant tests (fast suite)
- **1.2** Canonical benchmarks + `VALIDATION.md` (slow suite)
- **1.3** In-app Strouhal measurement (FFT) + fast CI

---

## 1.1 — Harness & invariant tests

**Framework:** Vitest, Node environment, no DOM. Tests import from `src/lbm/`
and `src/physics/` directly (these layers are browser-API-free by rule; if any
stray browser dependency surfaces, fixing it is in scope).

**Test tiers:** `npm run test:fast` (invariants, boundary contracts and the
spectral suite; target < 30 s total) and `npm run test:bench` (the canonical
benchmarks from sub-phase 1.2).

**Invariant tests (all in the fast tier):**

| ID | Test | Acceptance |
|---|---|---|
| INV-1 | **Collision conserves mass & momentum.** Apply one collision step to randomized (valid) distributions on a small grid; compare ρ and ρ·u per node before/after. MRT conserved moments must be untouched. | Per-node relative error ≤ 1e-12 (double-precision epsilon territory) |
| INV-2 | **Equilibrium is a fixed point.** Uniform flow at u₀, no obstacles, periodic-equivalent setup (or inlet velocity equal to initialized field): run 1,000 steps. | Max deviation of ρ and u from initial values ≤ 1e-10 |
| INV-3 | **Symmetry.** Centered cylinder, symmetric domain, Re = 20, perturbation injection disabled: run to steady state. | Cl ≤ 1e-3·Cd; u_y field antisymmetric about centerline within 1e-6 |
| INV-4 | **Stability at τ limits.** Small cylinder case run 10,000 steps at τ = 0.51 and τ = 1.5. | No NaN/Inf anywhere in f, ρ, u; forces finite |
| INV-5 | **No-slip at walls.** Steady channel flow: extrapolated velocity at the half-way wall location. | |u_wall| ≤ 1e-3·u₀ |
| INV-6 | **Mass stationarity in a driven channel.** Run a 120×50 Poiseuille-like channel at Re_H = 20 for 50,000 steps and sample domain-mean density over the final 40,000. This guards against the secular pressurization and flow decay found under the legacy boundary pair. | |linear-fit slope of ρ_mean| ≤ 1e-9 per step; |ρ_mean − (1 + Δρ/2)| ≤ 0.5·(Δρ/2), where Δρ = 36·ν·ū·L/H² is computed from the test setup |

The fast tier also pins the boundary schemes introduced during benchmark
closure: **BC-1** verifies the Zou–He inlet/outlet moments to ≤ 1e-12, and
**BC-2** verifies that free-slip side walls preserve uniform flow to ≤ 1e-10
and drain no tangential momentum above 1e-12 per step. Their derivations and
direction mappings remain in
[`phase-1-2b-boundary-conditions.md`](./phase-1-2b-boundary-conditions.md) and
[`phase-1-2c-benchmark-fidelity.md`](./phase-1-2c-benchmark-fidelity.md).

**Notes for the implementer:**
- INV-3 requires the perturbation injector to be switchable off. If it is not
  already, adding an explicit flag to the solver config is **authorized by this
  spec** (default behavior unchanged).
- Do not "fix" failing invariants by loosening tolerances. A failing invariant
  is a finding — stop and report.

---

## 1.2 — Canonical benchmarks & VALIDATION.md

This section incorporates the closure decisions from the 1.2b–1.2f chain.
All cases use the well-posed Zou–He pair: velocity inlet at the left (u =
(u₀, 0), density free) and pressure outlet at the right (ρ = 1). BM-1 keeps
no-slip half-way walls because wall friction is the physics being validated.
BM-2 and BM-3 use free-slip side walls, the official unconfined-comparison
configuration; the app default remains no-slip.

All benchmarks run headless in lattice units. **Force normalization in tests
must reuse the exact same code path as the UI** (Cd = 2Fx/(ρ₀·u₀²·D_cells),
Cl = 2Fy/(ρ₀·u₀²·D_cells)) — no test-local reimplementation, otherwise the
tests validate something the user never sees.

### BM-1: Plane Poiseuille (developed channel flow)

The only case with an exact analytic solution — it validates viscosity,
bounce-back wall placement, and the velocity BCs in one shot.

- **Setup:** straight channel, uniform velocity inlet u₀, Zou–He pressure
  outlet, and no-slip bounce-back top/bottom. The solver grid is
  **300×52**, with **H = 50** fluid rows between two solid wall rows. With
  half-way bounce-back the effective walls sit half a cell outside the fluid
  nodes; getting this half-cell bookkeeping right *is part of the test*.
- **Reynolds:** Re_H = u_mean·H/ν = 20 (set ν via τ accordingly). Laminar
  entrance length L_e ≈ 0.05·Re_H·H = 1·H → measure the profile at
  **x = 5H** from the inlet; channel length Nx = 6H.
- **Convergence:** run until max relative change of the profile over 500 steps
  ≤ 1e-8.
- **Acceptance:** L2 relative error between measured u_x(y) profile and the
  analytic parabola (peak = 1.5·u_mean, zeros at the half-way wall positions)
  **≤ 1%**. Half-way bounce-back is second-order accurate; at Ny = 50 this
  tolerance is comfortable — failure means a real bug, not "needs more grid".

### BM-2: Circular cylinder, Re = 20 (steady)

- **Setup:** cylinder diameter **D = 30 cells** in a **1080×600** domain,
  centered vertically. Blockage β = 5%; upstream distance 10D, downstream
  distance 25D; uniform inlet u₀ = 0.07; **free-slip side walls**.
  Perturbation injection is off.
- **Reference values (unbounded flow, experimental + numerical literature):**
  Cd ≈ 2.05 (reported range roughly 2.0–2.1); steady recirculation bubble
  length L_r/D ≈ 0.92.
- **Measurement:** always run the full 150,000-step budget. Report Cd as the
  mean over the final 50,000 steps; split that tail into two consecutive
  25,000-step windows and report whether their means agree within 0.2%.
  This windowed definition averages the bounded outlet acoustic mode and
  replaces the unsatisfiable pointwise convergence check.
- **Acceptance:** BM-2 is a **reporting benchmark**, not literature-gated.
  Assert only the loose sanity bound **1.8 ≤ Cd ≤ 2.4**, which catches gross
  regressions and NaN without pretending the measured Cd = 2.190 satisfies the
  retired 2.05 ± 6% window. Report the unconfined reference, deviation (+6.8%)
  and mechanism tag (low-Re confinement at β = 5% with a uniform inlet).
  |Cl|, L_r/D and the acoustic-mode signature are informative.

Resolution was ruled out by the D = 20 → 30 refinement, and outlet bias of the
mean by the 25D → 50D discriminator (Cd 2.190 → 2.189). A literature-tight
confined gate requires a parabolic inlet and is deferred to v2; comparing the
current uniform inlet against a parabolic-inlet reference would confound setup
with solver.

### BM-3: Circular cylinder, Re = 100 (unsteady, von Kármán)

- **Setup:** same official **1080×600, D = 30, β = 5%, free-slip** domain as
  BM-2. Perturbation injection is on for the first 200 steps (it only shortens
  the transient; the saturated limit cycle is what is measured). Discard
  45,000 steps, then measure over 31,500 steps (at least 10 full shedding
  periods).
- **Reference values:** mean Cd ≈ 1.33–1.35; **Strouhal St = f·D/u₀ ≈
  0.164–0.166** (Williamson's experiments give 0.164 at Re = 100; established
  2D simulations cluster at 0.164–0.167).
- **Acceptance:** mean Cd within **±7%** of 1.34; St within **±5%** of 0.165
  (i.e. 0.157–0.173). St here is measured from Cl zero-crossings of the
  (mean-removed) Cl signal — simple and exact enough for a clean limit cycle;
  the shared FFT estimator must agree with this within 1% on the same trace.
- St is dimensionless: compute it entirely in lattice units (f in 1/steps,
  D in cells, u₀ in lu). No unit conversion involved.

### Runtime budget & tiering

BM-2/BM-3 are 648,000-cell domains and the official runs take hours, not
seconds. They live in `test:bench`, excluded from `test:fast`. D = 30,
1080×600, free-slip walls and the stated measurement windows are part of the
validated setup and are not runtime-tuning parameters.

### VALIDATION.md

Table per benchmark: case, setup summary (D, β, domain, steps), measured value,
literature value with the references, relative error, pass/fail against
tolerance. Plus a short honest paragraph on known limitations (2D, staircase
boundaries, blockage, Re ceiling). This file is user-facing credibility — write
it like a lab report, not marketing.

### Discrepancy protocol

If a benchmark misses tolerance: do **not** tune tolerances, do **not** touch
solver constants. Report the measured value, the setup, and a hypothesis
(setup/normalization/genuine bug). Diagnosis is a decision for the maintainer,
possibly a spec revision.

---

## 1.3 — In-app Strouhal + fast CI

Implemented through the spectral child spec and the Phase 1 closure spec; this
section is an index only.

- **1.3a — In-app Strouhal (FFT) & the spectral module:**
  [`phase-1-3a-strouhal-fft.md`](./phase-1-3a-strouhal-fft.md). `src/physics/spectral.ts`
  (`StrouhalEstimator`, in-module radix-2 FFT), the `tests/spectral/` SP-1…SP-9
  tier, the committed BM-3 Cl fixture, and the Results-panel display with the
  Williamson correlation as the built-in-circle reference. It supersedes the
  ring-buffer sizing given here (4,096, not 2,048 — 2,048 holds only 15.8
  periods at the D = 30 official setup) and corrects the Phase 1 Definition of
  Done (see its §Erratum, applied below).
- **Phase 1 closure — repository reconciliation & fast CI:**
  [`phase-1-closure.md`](./phase-1-closure.md). GitHub Actions runs
  `test:fast` and the production build on Node 20/24 for pushes and pull
  requests. The former 1.3b benchmark-golden, guardian and seeded-RNG ideas are
  explicitly deferred until external contributors or the next solver change;
  official benchmarks remain the mandatory local ritual for physics changes.

---

## Out of scope for Phase 1

Parabolic-inlet BCs (would enable the Schäfer–Turek confined benchmark — noted
as a possible v2 validation upgrade), NACA lift-curve validation (needs
angle-of-attack sweeps; Phase 3 material), skin-friction decomposition,
3D anything.

## Definition of done (whole phase)

Fast invariants, boundary contracts and spectral tests green in CI on Node
20/24 · production build green in CI · official benchmarks validated locally
and recorded in `VALIDATION.md` · `VALIDATION.md` linked from README · Strouhal
gated in two deliberately separate parts. The original single requirement that
the in-app value match BM-3 within 1% is void: BM-3 runs free-slip walls at
D = 30, while the app runs no-slip at the user's D; the wall change alone
shifted St by −4.0% in diagnostic 1.2c D-2.

1. **Estimator gate** — the FFT estimator and the zero-crossing estimator,
   applied to *the same recorded Cl trace*, agree within **1%** (SP-9).
2. **App gate** — *plumbing, not physics* (spec 1.3a Rev 2(f)). No in-app
   cylinder can reach β ≤ 5% (`resolveDomainSize` fixes Ny = 100, tunnel mode
   is hidden), so every buildable case legitimately sits above the unconfined
   literature window — measured 0.1812 at β = 10%. The gate is therefore: St
   displayed for an in-app cylinder at Re ≈ 100 appears, is finite, and matches
   a headless run of the identical setup within **1%**. The physical
   comparison against literature lives in BM-3, not in the app.

· no solver-core changes beyond those explicitly authorized here
(perturbation on/off flag, Cl spectral buffer).
