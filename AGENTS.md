# AGENTS.md — Operating rules for AI coding agents on SOPLO

> Read [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) first for vision, positioning and
> roadmap. This file contains only what an agent needs to **work on the code without
> breaking it**. It is tool-agnostic: Claude Code, Codex, Cursor or any other agent
> should follow the same rules. (`CLAUDE.md` is a pointer to this file.)

## Golden rules

1. **Do not modify the solver core without an explicit spec.** `src/lbm/LBMSolver.ts`,
   `src/lbm/constants.ts` and `src/lbm/boundaryConditions.ts` are validated physics.
   Changes there require a written spec, a stated physical justification, and must
   keep all invariant/benchmark tests green.
2. **Never break physical honesty.** Any feature that lets the user run a setup
   outside validity limits must surface a warning, never hide one. Removing or
   weakening a warning is a physics change (rule 1 applies).
3. **One phase per session.** Work on exactly the phase you were asked to. Do not
   opportunistically refactor unrelated code.
4. **Leave the repo publishable.** No debug `console.log`, no commented-out blocks,
   no TODO without an issue reference, no editor artifacts.
5. **English everywhere** — code, comments, UI strings, docs, commit messages.

## Physics invariants (do not change without spec)

| Invariant | Value | Why |
|---|---|---|
| Lattice inlet velocity | `u₀ = 0.07 lu`, fixed, never user-facing | Keeps Ma ≪ 1; the physical-units UX depends on it |
| τ clamp | `[0.501, 1.8]`; stable band `[0.51, 1.5]` | Below 0.51 the MRT scheme oscillates; the safety indicator encodes these exact bounds |
| Safe Reynolds | `Re_safe ≈ 21 · D_cells` (D = full diameter/side/chord in cells, never the half-length) | Derived from τ_lo; used by UI warnings and must match `physicsToLBM.ts` |
| MRT relaxation rates | conserved = 1.0; ghosts e/eps = 1.8, qx/qy = 1.7; stress pxx/pxy = 1/τ | Empirically tuned: ~3× more stable Re than Lallemand–Luo defaults, no measurable physics impact |
| Force timing | Momentum exchange accumulates **post-collision, pre-stream** | Required by the Ladd MEM formula; moving the call produces wrong forces |
| Solid encoding | `solid=1` domain walls (excluded from forces), `solid=2` aerodynamic bodies (included) | Force measurement correctness |
| Axis / force signs | Lattice +x = downstream, +y = physical up (renderer flips y at draw time); `Cd = +Fx`, `Cl = +Fy`; positive AoA = nose up via `−aoa` rotation | Verified empirically (NACA ±10° antisymmetry); see `docs/specs/cl-sign-convention.md` |
| Boundary layout | Inlet = left (velocity equilibrium, skips solid cells), outlet = right (zero-gradient), walls via bounce-back | Validation logic in `App.tsx` enforces left/right for now |
| f-array layout | `f[i * Nx*Ny + x*Ny + y]` | All hot loops assume it |
| Solver storage precision | `Float64Array` for all population/field arrays | INV-1/INV-2 tolerances (1e-12/1e-10) assume double precision; changing storage precision invalidates them and requires a spec |

## Architecture map

```
src/
  lbm/         Pure solver. No React, no DOM, no imports from other layers. ← protected
  physics/     Physical ↔ lattice unit conversion, limits, warnings.        ← protected
  geometry/    NACA generation, SVG/DXF import, polygon rasterization.
  rendering/   Canvas2D field renderer, colormaps, streamline (smoke) renderer.
  components/  React UI. Sections (Domain/Geometry/Boundary/Fluid), panels, overlays.
  types/       SimConfig — the single config object, always in physical units.
  App.tsx      Composition root + simulation loop (loop extraction to a hook is planned Phase 0 work).
```

Dependency direction is strictly downward: `components → rendering/physics/geometry → lbm`.
The solver must remain runnable headless (Node/Vitest) — never import browser APIs into
`lbm/`, `physics/` or `geometry/`.

## Testing (from Phase 1 onward)

- Framework: **Vitest**, headless, no DOM required for solver tests.
- Before any commit touching `lbm/` or `physics/`: run the full invariant + benchmark
  suite. Benchmarks are slow; there is no situation where skipping them is acceptable
  for solver changes.
- New physics-adjacent features require at least one invariant test.

## Workflow conventions

- **SDD:** non-trivial work starts from a written spec (issue or markdown in `docs/`).
  If you are asked to implement something with no spec and non-obvious scope, ask for
  or draft the spec first.
- **Commits:** conventional style — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`. One logical change per commit.
- **Branches:** `phase-N-short-topic` for roadmap phases; merge with `--no-ff`.
- **Definition of done for a phase:** code + tests green + docs updated
  (`PROJECT_CONTEXT.md` decision log if a decision was made) + repo publishable.

## Known pitfalls

- The `resolveDomainSize` / `dxMeters` logic in `App.tsx` couples grid size to the
  resolution preset; changing presets in `SimConfig.ts` silently changes domain sizes.
- SVG/DXF masks are rasterized against a specific `Nx × Ny`; rebuilding the solver with
  a different domain size invalidates stored masks (`addMask` throws on size mismatch).
- `forceHistory` is sampled every 20 steps and capped at 500 points — Strouhal/FFT
  work (Phase 1) must account for the effective sampling rate `20 · dt`.
- React 19 StrictMode double-invokes effects in dev; the animation loop and any future
  Worker lifecycle must stay idempotent.
