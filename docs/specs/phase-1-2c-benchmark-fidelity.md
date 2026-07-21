# Phase 1.2c Spec — Benchmark fidelity: free-slip side walls & discriminating diagnostics

> Status: **approved draft** · Owner: Alex · Executed by: coding agent.
> Prereq: 1.2b branch state (BM-1 PASS, BM-2/BM-3 open finding, VALIDATION.md
> scoreboard of 2026-07-16). Continues on branch `phase-1-2b-boundary-conditions`
> or a child branch — implementer's choice, documented.
> This spec authorizes one solver addition and defines the diagnostic sequence
> and decision tree for closing the BM-2/BM-3 finding. **No acceptance window
> changes are authorized here** — windows may only be revisited at the explicit
> endpoint of the decision tree, by the maintainer, against cited literature.

## Problem

BM-2/BM-3 compare a confined tunnel (β = 5%, **no-slip** side walls, staircase
cylinder) against unconfined smooth-cylinder references. Quantified setup biases
(session of 2026-07-16, VALIDATION.md): side-wall boundary layers displace core
flow (+~2.3% incident velocity at Re = 20, +~1% at Re = 100 — measured),
rasterized diameter (hydrodynamic width ≈ D+1), and confinement proper. These
compose to most, not all, of the observed excess (+15.4% Cd, +5.6% St at BM-3;
BM-2 non-converged at 2.49, plausibly chasing the slow diffusive settling of the
wall boundary layers).

*Spec erratum (third of this phase, same pattern):* rev ≤ 3 permitted bounce-back
side walls claiming the difference vs. free-slip was "within tolerance" at
β = 5%. Not derived, and false at Re = 20 (δ ≈ √(νx/u₀) ≈ 14 cells at the
cylinder station → ≈ +5% Cd from displacement alone). Rule reaffirmed: numeric
claims in specs carry their derivation.

## Authorized change: free-slip side walls (benchmark option)

Add a **free-slip (specular reflection)** wall mode for the straight top/bottom
domain walls: populations hitting the wall reflect with the normal (y) velocity
component sign-flipped and the tangential (x) component preserved
(f_NW↔f_SW, f_NE↔f_SE, f_N↔f_S at the wall rows). Scope guard-rails:

- Exposed as a solver/domain option (e.g. `sideWalls: 'no-slip' | 'free-slip'`),
  **default `'no-slip'`** — the app's behavior is unchanged in this phase.
- Applies to straight horizontal domain walls only (solid = 1 rows). Obstacle
  surfaces (solid = 2) remain half-way bounce-back always.
- BM-1 (Poiseuille) keeps no-slip walls — its physics requires them.

**New unit test BC-2 (fast tier):** with free-slip walls and no obstacle,
(i) uniform flow u = (u₀, 0) is an exact fixed point (no boundary layer forms;
max deviation ≤ 1e-10 over 1,000 steps), and (ii) global x-momentum is not
drained by the walls (net tangential momentum flux at wall rows ≤ 1e-12 per
step). This pins the reflection mapping the same way BC-1 pinned Zou–He.

## Diagnostic sequence (in order; each produces a written result)

1. **D-1 — BM-2 diagnostic re-run, free-slip walls, extended budget:** same
   domain, cap raised to 200k steps, recording the full Cd(t) trace and an
   incident-velocity probe u(t) at 5D upstream, both dumped to the report.
   Classifies the old non-convergence: (a) still-relaxing toward window,
   (b) converged high, (c) oscillating under the gate. If Cd converges,
   assert against the ORIGINAL window (±6% of 2.05).
2. **D-2 — BM-3 re-run, free-slip walls:** unchanged otherwise. Assert against
   original windows. Record the no-slip→free-slip shift of Cd and St (it
   measures the wall-BL bias directly).

## Decision tree (follow mechanically; stop where indicated)

- **Both in window** → finding closed. Benchmarks adopt free-slip side walls
  permanently (documented in VALIDATION.md as the unconfined-comparison
  configuration, standard practice). Proceed to phase close-out (app smoke
  check, decision log).
- **Improved but out of window** → run the resolution discriminator:
  **D-3 — BM-3 at D = 30** (β = 5% kept → Ny = 600, Nx = 1080; one-off,
  ~1 h runtime acceptable). If Cd/St move materially toward the windows,
  the residual is staircase/resolution bias: **stop and report** — the
  maintainer decides between raising benchmark resolution (D = 30 becomes
  the spec'd setup, runtime cost accepted) or deriving a documented D = 20
  tolerance from the measured refinement trend.
- **Unchanged or worse** → the wall-BL hypothesis is dead for the residual;
  remaining suspects are outlet reflectivity and the force path.
  **Stop and report** — next discriminators (outlet at 40D; force-path audit)
  need their own spec.
- In all branches: **no window edits, no solver retuning** inside this session.

## Out of scope

Window/tolerance changes (endpoint-only, maintainer-only, literature-cited),
outlet modifications, D_eff renormalization (deliberately deferred: it improves
Cd but worsens St — free-slip results must arrive first to de-confound),
regularized BCs, anything in the app/UI.

## Close-out (only if the tree ends in "finding closed")

VALIDATION.md scoreboard refreshed · app smoke check per 1.2b spec ·
AGENTS.md: free-slip mode noted in the BC row (coupled-system note extends to
it) · decision log entries: free-slip benchmark walls + the erratum lesson.
