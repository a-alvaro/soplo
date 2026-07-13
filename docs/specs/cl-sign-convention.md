# Spec: Cl sign convention in computeForces

**Status:** resolved · 2026-07-13
**Scope:** documentation only — no solver behavior change.

## Problem

`LBMSolver.computeForces()` carried two consecutive docblocks. The stale one
claimed `Cl = −Fy` "because lattice y grows downward while physical y grows
upward", contradicting the code, which returns `Cl = +Fy`. Before Phase 1
freezes the convention into benchmark tests, we had to establish which one is
physically correct.

## Findings

1. **The renderer flips y at draw time** (`Canvas2D.tsx`: `py = Ny − 1 − cy`),
   so lattice **+y is physical "up"** on screen. The stale comment described a
   y-down convention that does not exist in the current code.
2. **Angle of attack is consistent with y-up:** the composition root rotates
   the airfoil by `−aoa` (`rotatePoints`, standard CCW-positive rotation),
   which pitches the nose up for positive AoA in a y-up frame.
3. **Empirical verification** (headless solver, Nx×Ny = 300×150, τ = 0.55,
   u0 = 0.07, chord D = 40 cells, Re ≈ 170, forces averaged over the last
   1,000 of 6,000 steps):

   | Case | Cd | Cl (= +Fy) | Expected |
   |---|---|---|---|
   | NACA 0012 @ 0° | 0.349 | −0.012 ≈ 0 | ≈ 0 (symmetric) |
   | NACA 0012 @ +10° | 0.408 | +0.562 | > 0 (nose up → lift up) |
   | NACA 0012 @ −10° | 0.408 | −0.583 | < 0 (antisymmetric) |
   | NACA 2412 @ 0° | 0.352 | +0.018 | > 0 (camber up) |

   The ±10° antisymmetry with equal drag is the decisive signal.

## Decision

The convention, now recorded in `AGENTS.md`:

- Lattice **+x = downstream**, lattice **+y = physical up** (renderer flips y
  when drawing; the solver itself is orientation-agnostic).
- **Cd = +Fx / (q·A)**, **Cl = +Fy / (q·A)** with q = 0.5·ρ·u0², A = charCells.
- Positive AoA = nose up, applied as a `−aoa` rotation of the geometry.

`computeForces` keeps returning `Cl = +Fy` — the code was right; the stale
docblock is deleted and replaced by one documenting this convention.

## Phase 1 regression tests (to be implemented)

- NACA 0012 at +10° → Cl > 0; at −10° → Cl < 0; |Cl(+10°) + Cl(−10°)| small.
- Cylinder (symmetric) → time-averaged Cl ≈ 0, Cd > 0.
