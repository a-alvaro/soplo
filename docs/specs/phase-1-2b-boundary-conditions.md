# Phase 1.2b Spec — Well-posed inlet/outlet boundary conditions

> Status: **approved rev 2** · Owner: Alex · Executed by: coding agent.
> Rev 2 adds: outlet formula erratum fix, authorization of the MRT ghost-rate
> change (coupled-system finding), Re-ceiling smoke check.
> Prereq: Phase 1.2 merged (VALIDATION.md documents the open BC finding).
> This spec **authorizes a change to `src/lbm/boundaryConditions.ts`** under rule 1
> of `AGENTS.md`, with the justification, scope and revalidation defined below.

## Problem (from Phase 1.2, see VALIDATION.md)

The current BC pair over-constrains the flow:

- `applyInlet` imposes full equilibrium with **fixed ρ = 1** and u = (u₀, 0).
  Since p = c_s²ρ, this nails the inlet *pressure*.
- `applyOutlet` copies populations (zero gradient) — it anchors nothing.

A channel with friction requires a streamwise pressure drop. With inlet pressure
pinned and no pressure anchor at the outlet, mass accumulates, the interior
pressurizes above the inlet, the gradient turns adverse, and the flow decays
exponentially (BM-1: velocity dies, ρ saturates ≈ 1.2247; BM-2: Cd drifts as the
effective velocity decays; BM-3 passed only because its measurement window is
short relative to the drift timescale at low ν). The defect also affects the app
itself on long-running simulations.

## Rev 2 — MRT ghost rates (authorized change)

Session findings (bisection on the branch): Zou–He is a *wet-node* scheme — it
reconstructs boundary populations every step, injecting uncontrolled
non-equilibrium content into the ghost moments. With the tuned over-relaxation
s_e = s_ε = 1.8 (collision multiplier −0.8), the boundary
reconstruction→collision loop is linearly unstable (NaN in ≤ 5k steps even in
creeping flow; threshold located between s_e = 1.6 and 1.8). The legacy
equilibrium inlet masked this by wiping non-equilibrium content at the boundary
each step — i.e., **the 1.8/1.7 ghost rates were never an invariant of the
solver alone, but of the solver+BC pair.**

Therefore this spec now ALSO authorizes, as part of the same system change:

- **MRT ghost relaxation rates: s_e = s_ε = 1.4, s_qx = s_qy = 1.2**
  (the Lallemand–Luo 2000 reference values). Evidence on the branch: stable in
  all bisection cases, INV-2 at 2.2e-14, INV-4 survives τ = 0.51, and the
  driven channel converges to a stationary state with the expected pressure
  jump (ρ_mean ≈ 1.021, no secular drift).
- Corresponding updates to the invariants table in `AGENTS.md`: new rate values,
  plus an explicit note that **boundary scheme and ghost rates form a coupled
  system** — neither may be changed without revalidating the pair.
- Backlog entry in `PROJECT_CONTEXT.md`: *regularized boundary conditions*
  (Latt et al., PRE 77, 056703, 2008), which filter ghost content by
  construction and would allow re-exploring higher ghost rates — the
  principled v2 alternative if more stability margin is ever needed.

## Fix

Adopt the textbook well-posed pair for incompressible flow (Zou & He 1997):

1. **Inlet (west boundary): Zou–He velocity BC.** Prescribe u = (u₀, 0); the
   local density is **computed from the known populations**, not imposed:
   ρ_in = [f_C + f_N + f_S + 2(f_W + f_NW + f_SW)] / (1 − u₀), where the labels
   denote the rest, north, south, west-pointing, northwest- and southwest-pointing
   populations at the inlet node. The three unknown (east-pointing) populations are
   reconstructed with the standard Zou–He formulas (bounce-back of the
   non-equilibrium part):
   - f_E  = f_W + (2/3)·ρ_in·u₀
   - f_NE = f_SW − ½(f_N − f_S) + (1/6)·ρ_in·u₀
   - f_SE = f_NW + ½(f_N − f_S) + (1/6)·ρ_in·u₀

2. **Outlet (east boundary): Zou–He pressure BC.** Prescribe **ρ_out = 1**
   (the domain's pressure reference), u_y = 0; the outflow velocity is computed:
   u_out = −1 + [f_C + f_N + f_S + 2(f_E + f_NE + f_SE)] / ρ_out,
   and the three unknown (west-pointing) populations reconstructed:
   - f_W  = f_E − (2/3)·ρ_out·u_out
   - f_NW = f_SE − ½(f_N − f_S) − (1/6)·ρ_out·u_out
   - f_SW = f_NE + ½(f_N − f_S) − (1/6)·ρ_out·u_out

   *(Rev 2 erratum: the first version of this spec had the transverse
   ½(f_N − f_S) signs of f_NW/f_SW swapped, violating ρ·u_y = 0. Caught by
   BC-1 exactly as designed. The formulas above are the corrected ones,
   matching the implementation on the branch.)*

**Direction-index mapping is the implementer's responsibility and the #1 bug
risk.** The formulas above are written in compass labels; map them onto the
project's `ex/ey` ordering in `constants.ts`. A dedicated unit test (below)
verifies the mapping by checking moments, not by re-deriving formulas.

**Wall/solid handling:** as today, skip solid cells in the boundary columns
(walls remain half-way bounce-back). Corner nodes (boundary column adjacent to a
wall row) follow the same skip rule; do not implement special corner treatments
in this phase.

**Signature note:** function signatures may stay as-is except that `applyInlet`
no longer needs a density argument and `applyOutlet` gains none — keep the API
minimal. Arrays are `Float64Array` (post-1.1).

## Out of scope

Non-reflecting/characteristic outlets, sponge zones, parabolic inlet profiles
(Schäfer–Turek remains a v2 validation upgrade), any change outside
`boundaryConditions.ts` and its call sites, retuning of MRT rates or τ limits.

## Revalidation (all mandatory, in this order)

1. **New unit test BC-1 (fast tier):** on a small grid, after applying the inlet
   to a column with randomized valid populations, the recomputed moments at each
   inlet node must satisfy u = (u₀, 0) exactly (≤ 1e-12) and ρ equal to the
   Zou–He formula value; mirror check for the outlet (ρ = 1 exactly, u_y = 0).
   This test pins the direction mapping.
2. **New invariant INV-6 (fast tier): mass stationarity in a driven channel.**
   Poiseuille-like channel (small grid, e.g. 120×50, Re_H = 20): run 50,000
   steps; over the last 40,000, the domain-mean density must show no secular
   trend: |linear-fit slope| ≤ 1e-9 per step and |ρ_mean − 1| ≤ 5e-3.
   This is the regression guard for the exact failure mode found in 1.2.
3. **Full invariant suite** INV-1…INV-5 unchanged and green (tolerances as spec'd).
4. **BM-1 and BM-2 re-run**: must now converge and pass their original
   acceptance windows (spec §1.2, unchanged).
5. **BM-3 re-run**: the previous PASS is void (the drift biased its window).
   Same acceptance window as before. Record old vs. new Cd/St in VALIDATION.md —
   the shift itself is informative.
6. **VALIDATION.md updated**: finding closed, scoreboard refreshed, and a short
   paragraph documenting the BC change and its physical rationale.
7. **App smoke check**: run the UI briefly (dev server) with a cylinder config
   and confirm qualitatively normal behavior (no visual artifacts at inlet/outlet,
   forces finite). The perturbation/vortex behavior at Re = 100 must still develop.
8. **Re-ceiling smoke (rev 2, informative not gating):** small cylinder case
   (D = 10–12 cells) run at Re just below its nominal ceiling
   (Re ≈ 21·D_cells): must stay finite for ≥ 20k steps under the new BC+rates
   system. Report the outcome in VALIDATION.md. This checks that the product
   rule Re_safe ≈ 21·D — which depends only on τ = 0.51 stability — survives
   the system change. A failure here is a finding for the maintainer, not a
   license to retune.

## Stability caveat (report, don't improvise)

Zou–He is exact but can be less forgiving than an equilibrium inlet near the
stability edge (τ → 0.51). If INV-4 or any benchmark shows new instability,
**stop and report** per the discrepancy protocol — do not blend schemes or add
ad-hoc damping.

## Decision log entries (add to PROJECT_CONTEXT.md on completion)

- BC pair replaced: equilibrium inlet (fixed ρ) + zero-gradient outlet →
  Zou–He velocity inlet (free ρ) + Zou–He pressure outlet (ρ = 1), after
  benchmarks BM-1/BM-2 exposed secular pressurization and flow decay.
- MRT ghost rates retuned 1.8/1.7 → 1.4/1.2 (Lallemand–Luo reference values):
  bisection showed the legacy equilibrium inlet was silently filtering ghost
  modes at the boundary; the aggressive rates were a property of the old
  solver+BC pair, unstable under wet-node (Zou–He) boundaries. Boundary scheme
  and ghost rates are now documented as a coupled system.
- INV-6 (mass stationarity) added as permanent regression guard.
- Backlog: regularized boundary conditions (Latt 2008) as the principled path
  to higher ghost rates if more Re margin is ever needed.
