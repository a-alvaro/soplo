# Phase 1 Spec — Validation & Test Harness

> Status: **approved draft** · Owner: Alex · Executed by: coding agent, one sub-phase per session.
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
- **1.3** In-app Strouhal measurement (FFT) + CI

---

## 1.1 — Harness & invariant tests

**Framework:** Vitest, Node environment, no DOM. Tests import from `src/lbm/`
and `src/physics/` directly (these layers are browser-API-free by rule; if any
stray browser dependency surfaces, fixing it is in scope).

**Test tiers:** `npm run test:fast` (this sub-phase, target < 30 s total) and
`npm run test:bench` (sub-phase 1.2). CI wiring comes in 1.3.

**Invariant tests (all in the fast tier):**

| ID | Test | Acceptance |
|---|---|---|
| INV-1 | **Collision conserves mass & momentum.** Apply one collision step to randomized (valid) distributions on a small grid; compare ρ and ρ·u per node before/after. MRT conserved moments must be untouched. | Per-node relative error ≤ 1e-12 (double-precision epsilon territory) |
| INV-2 | **Equilibrium is a fixed point.** Uniform flow at u₀, no obstacles, periodic-equivalent setup (or inlet velocity equal to initialized field): run 1,000 steps. | Max deviation of ρ and u from initial values ≤ 1e-10 |
| INV-3 | **Symmetry.** Centered cylinder, symmetric domain, Re = 20, perturbation injection disabled: run to steady state. | Cl ≤ 1e-3·Cd; u_y field antisymmetric about centerline within 1e-6 |
| INV-4 | **Stability at τ limits.** Small cylinder case run 10,000 steps at τ = 0.51 and τ = 1.5. | No NaN/Inf anywhere in f, ρ, u; forces finite |
| INV-5 | **No-slip at walls.** Steady channel flow: extrapolated velocity at the half-way wall location. | |u_wall| ≤ 1e-3·u₀ |

**Notes for the implementer:**
- INV-3 requires the perturbation injector to be switchable off. If it is not
  already, adding an explicit flag to the solver config is **authorized by this
  spec** (default behavior unchanged).
- Do not "fix" failing invariants by loosening tolerances. A failing invariant
  is a finding — stop and report.

---

## 1.2 — Canonical benchmarks & VALIDATION.md

All benchmarks run headless in lattice units. **Force normalization in tests
must reuse the exact same code path as the UI** (Cd = 2Fx/(ρ₀·u₀²·D_cells),
Cl = 2Fy/(ρ₀·u₀²·D_cells)) — no test-local reimplementation, otherwise the
tests validate something the user never sees.

### BM-1: Plane Poiseuille (developed channel flow)

The only case with an exact analytic solution — it validates viscosity,
bounce-back wall placement, and the velocity BCs in one shot.

- **Setup:** straight channel, uniform velocity inlet u₀, zero-gradient outlet,
  bounce-back top/bottom. Height **Ny = 50** fluid cells; with half-way
  bounce-back the effective walls sit half a cell outside the fluid nodes, so
  the analytic channel height is **H = Ny** (in cell units, walls at y = −0.5
  and y = Ny − 0.5). Getting this half-cell bookkeeping right *is part of the
  test* — it is the classic way to get a systematically ~2–4% wrong profile.
- **Reynolds:** Re_H = u_mean·H/ν = 20 (set ν via τ accordingly). Laminar
  entrance length L_e ≈ 0.05·Re_H·H = 1·H → measure the profile at
  x ≥ 4·H from the inlet; channel length Nx = 6·H.
- **Convergence:** run until max relative change of the profile over 500 steps
  ≤ 1e-8.
- **Acceptance:** L2 relative error between measured u_x(y) profile and the
  analytic parabola (peak = 1.5·u_mean, zeros at the half-way wall positions)
  **≤ 1%**. Half-way bounce-back is second-order accurate; at Ny = 50 this
  tolerance is comfortable — failure means a real bug, not "needs more grid".

### BM-2: Circular cylinder, Re = 20 (steady)

- **Setup:** cylinder diameter **D = 20 cells**, centered vertically.
  Blockage β = D/Ny ≤ 5% → **Ny = 400**. Upstream distance 10·D, downstream
  25·D → **Nx = 720**. Uniform inlet u₀ = 0.07, zero-gradient outlet,
  free-slip or bounce-back side walls (document which; at β = 5% the
  difference is within tolerance). Perturbation injection **off**.
- **Reference values (unbounded flow, experimental + numerical literature):**
  Cd ≈ 2.05 (reported range roughly 2.0–2.1); steady recirculation bubble
  length L_r/D ≈ 0.92.
- **Acceptance:** converged Cd within **±6%** of 2.05 (i.e. 1.93–2.17);
  Cl ≤ 0.01 (symmetry re-check at scale); optionally report L_r/D (measure
  the u_x = 0 crossing on the centerline behind the cylinder) — informative,
  not gating, in v1.
- **Convergence:** Cd relative change ≤ 1e-5 over 1,000 steps.

### BM-3: Circular cylinder, Re = 100 (unsteady, von Kármán)

- **Setup:** same domain as BM-2 (D = 20, β = 5%). Perturbation injection ON
  (it only shortens the transient; the saturated limit cycle is what we
  measure). Run past the initial transient (discard at least the first
  ~30,000 steps ≈ 100 convective times D/u₀), then measure over ≥ 10 full
  shedding periods (expect a period of ≈ 1,730 steps: T = D/(St·u₀)).
- **Reference values:** mean Cd ≈ 1.33–1.35; **Strouhal St = f·D/u₀ ≈
  0.164–0.166** (Williamson's experiments give 0.164 at Re = 100; established
  2D simulations cluster at 0.164–0.167).
- **Acceptance:** mean Cd within **±7%** of 1.34; St within **±5%** of 0.165
  (i.e. 0.157–0.173). St here is measured from Cl zero-crossings of the
  (mean-removed) Cl signal — simple and exact enough for a clean limit cycle;
  the FFT machinery arrives in 1.3 and must agree with this within 1%.
- St is dimensionless: compute it entirely in lattice units (f in 1/steps,
  D in cells, u₀ in lu). No unit conversion involved.

### Runtime budget & tiering

BM-2/BM-3 are ~300k-cell domains run for tens of thousands of steps — expect
**minutes, not seconds** (estimate 3–10 min each in optimized typed-array JS).
They live in `test:bench`, excluded from `test:fast`. If runtimes exceed ~15 min
per case, reducing D to 16 cells (Ny = 320) is authorized, keeping β ≤ 5% and
the same tolerances.

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

## 1.3 — In-app Strouhal + CI

### Strouhal in the Results panel

- **Signal:** dedicated ring buffer of Cl samples for spectral analysis:
  **2,048 samples at the existing 20-step sampling cadence** (the current
  500-sample force history stays as-is for the convergence chart). 2,048
  samples ≈ 24 shedding periods at Re = 100 — enough for a sharp peak.
- **Method:** remove mean → Hann window → FFT magnitude → take the dominant
  peak → **parabolic interpolation** of the peak on log-magnitude (raw FFT bin
  resolution is only ~4% here; interpolation brings frequency error well under
  1% for a near-monochromatic signal).
- **Effective sample rate:** f_s = 1/(20 steps). Getting this factor of 20
  right is the most likely silent bug — add a unit test with a synthetic
  sine of known frequency injected into the buffer.
- **Display:** show St only when the flow is classified as *oscillating* and
  the buffer holds ≥ 6 estimated periods; otherwise show "—". Next to the
  measured value, when the geometry is a cylinder, show the literature value
  for the current Re range as context (data for this exists in the
  interpretation layer's future tables; a minimal hardcoded cylinder table is
  fine for now).
- Unit-test the full pipeline against synthetic signals (pure sine, sine +
  noise, sine + slow drift) with known frequencies; acceptance: recovered
  frequency within 1%.

### CI (GitHub Actions)

- On every push/PR: typecheck (`tsc --noEmit`), lint if configured,
  `test:fast`.
- `test:bench`: on pushes to `main` and manually via `workflow_dispatch`
  (benchmarks are minutes-long; they gate merges to main, not every WIP push).
- Badge in README once green.

---

## Out of scope for Phase 1

Parabolic-inlet BCs (would enable the Schäfer–Turek confined benchmark — noted
as a possible v2 validation upgrade), NACA lift-curve validation (needs
angle-of-attack sweeps; Phase 3 material), skin-friction decomposition,
3D anything.

## Definition of done (whole phase)

All invariants and benchmarks green in CI · `VALIDATION.md` committed and
linked from README · Strouhal visible in-app on a Re = 100 cylinder and
matching the benchmark measurement within 1% · no solver-core changes beyond
those explicitly authorized here (perturbation on/off flag, Cl spectral buffer).
