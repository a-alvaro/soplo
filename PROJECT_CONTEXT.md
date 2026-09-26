# SOPLO — Project Context

> This document is the single source of truth for **what SOPLO is, why it exists,
> and where it is going**. It is written for any collaborator — human or AI agent —
> joining the project. Operative rules for AI agents live in [`AGENTS.md`](./AGENTS.md).
>
> *Soplo* is Spanish for "puff" or "blow" — the breath of air that starts everything.

---

## 1. What SOPLO is

SOPLO is an **open-source, browser-based 2D fluid dynamics playground** built to help
people *understand* fluid mechanics — not just watch pretty colors.

You describe a problem in real physical units (meters, m/s, air or water), place a
cylinder, a square, a NACA airfoil, or your own SVG/DXF geometry in the flow, and SOPLO
runs a Lattice-Boltzmann simulation live in your browser while it:

- shows you the flow (velocity fields, vorticity, smoke-line streamlines),
- measures aerodynamic forces (Cd, Cl, L/D) and their convergence,
- **tells you when to trust the numbers and when not to** (Reynolds/τ/Mach safety
  indicator, blockage warnings),
- and — this is the goal — **explains what you are looking at** in plain language.

### What SOPLO is NOT

- Not a replacement for OpenFOAM, ANSYS, or any engineering-grade CFD tool.
- Not a 3D solver, not compressible, not turbulent-model-based. It is 2D
  incompressible LBM with an honest Reynolds ceiling (≈ 3,500 with the current
  MRT scheme at typical grid sizes).
- Not a toy either: results on canonical cases are validated against literature
  (see `VALIDATION.md` once Phase 1 lands), and the tool actively refuses to
  present garbage as physics.

**The positioning in one line:** *the wind tunnel you wish you had before (and
during) your first fluid mechanics course.*

## 2. Why it deserves to exist

There are dozens of LBM demos on the web. Almost all of them share the same three gaps,
and those gaps are exactly SOPLO's identity:

| Typical web LBM demo | SOPLO |
|---|---|
| Sliders in lattice units that mean nothing physically | Real units (m, m/s, ν); lattice conversion is invisible (`u₀ = 0.07 lu` fixed, τ derived) |
| Lets you simulate garbage without warning | Safety indicator (Re/τ/Mach traffic light), blockage ratio warnings, stability limits surfaced as `Re_safe ≈ 21·D_cells` |
| Shows colors, explains nothing | Regime detection (steady / vortex shedding / unstable), force convergence analysis, and a growing interpretation layer that narrates the physics |

The differentiators to protect and deepen, in priority order:

1. **Interpretation** — the tool teaches. Every visual phenomenon should be one
   click away from a plain-language explanation.
2. **Physical honesty** — the tool never silently degrades. If the setup exceeds
   what 2D LBM can resolve, the user is told, with the actual limit.
3. **Engineering rigor made visible** — validated benchmarks, invariant tests,
   documented decisions. The repo itself is a portfolio piece.

## 3. Who it is for

- **The curious person** who never took a fluids course but wants to see why a
  streamlined body has less drag than a flat plate.
- **The student** who took the course and still doesn't *feel* what boundary-layer
  separation or vortex shedding means.
- **The teacher** who wants a zero-install experiment to hand to a class
  ("run this, sweep the Reynolds number, tell me what changes").
- **The maker/engineer** doing a quick qualitative sanity check before firing up
  real CFD.

## 4. Current state (September 2026)

**Stack:** React 19 + TypeScript + Vite + Tailwind 4, recharts for plots.
Custom D2Q9 **MRT** LBM solver in plain TypeScript, Canvas2D rendering.

**Implemented and working:**
- MRT collision (d'Humières basis) with tuned ghost-mode relaxation (stable to ~3–4× the Re of BGK).
- Half-way bounce-back on arbitrary solids; Zou–He velocity inlet (free
  density) and pressure outlet (ρ = 1); no-slip side walls by default and a
  benchmark-only free-slip mode.
- Physical→lattice unit conversion layer with τ clamping and warning system.
- Momentum-exchange (Ladd) force measurement, correctly timed post-collision/pre-stream; live Cd/Cl/L/D with convergence classification (converging / oscillating / unstable).
- Geometries: cylinder, square, NACA 4-digit (parametric), SVG import, DXF
  import. NACA is currently experimental: Phase 2.3 found a chord-reference
  mismatch and invalid masks, so its quantitative outputs are not trusted until
  the dedicated correction phase closes.
- Auto-sized free-flow domain with blockage warnings. Manual/SVG wind-tunnel
  logic exists but its mode toggle is currently hidden.
- Smoke-line streamline renderer; viridis-style field rendering (|u|, ux, uy, vorticity).
- Safety indicator (Re/τ/Ma), InfoTip educational popovers, perturbation injection to seed vortex streets.
- Headless Vitest coverage for solver invariants, boundary contracts, the
  spectral estimator, Worker runtime and contextual interpretation;
  `test:fast` currently runs 62 tests across 22 files.
- Canonical validation recorded in `VALIDATION.md`: BM-1 and BM-3 pass their
  literature gates; BM-2 is a converged reporting benchmark with a documented
  low-Re confinement limitation.
- In-app Strouhal measurement from Cl, sharing the validated spectral path and
  annotating the unconfined literature reference when the app setup is confined.
- Dedicated Web Worker simulation runtime: solver stepping, force sampling,
  Strouhal estimation and field maxima stay off the browser main thread;
  transferred snapshots feed Canvas2D with bounded backpressure.
- Public HTTPS preview deployed reproducibly from `main` at
  [`soplo.alx.engineering`](https://soplo.alx.engineering/).
- Contextual Results explanations that separate drag settling, lift periodicity,
  evidence sufficiency, numerical safety and known model limitations.
- Fast GitHub Actions CI on Node 20 and 24 (`test:fast` + production build).
- Repository identity and hygiene: README, MIT license, agent rules, clean
  tracked tree and simulation loop extracted to `useSimulation`.

**Missing (the reason for the roadmap):**
- NACA placement uses 10/20/40 chord cells while its physical mapping, safety,
  force normalization and spectral normalization use 20/40/80; 25/147 audited
  masks are D2Q9-disconnected and two contain no body cells. This confirmed
  physical/geometry debt must close before visual smoothing.
- Geometry presentation still exposes the staircase field representation
  without a reviewed visual-truth model; aerodynamic `solid=2` cells are not
  rendered as an explicit body and are not rejected by the streamline mask.
- The broader UI does not yet organize setup, evidence and conclusions around
  the user's central question: how much can I trust this result?
- Field-backed annotations, a reviewed glossary, guided experiments and
  teacher-mode lesson flows do not exist yet.

## 5. Roadmap

Each phase must leave the repository **more publishable than the previous one**.
No phase is "done" with loose ends dangling into the next.

### Phase 0 — Hygiene & identity — COMPLETE
Clean repo (remove debug `console.log` in `computeForces`, `.DS_Store`,
`tsconfig.tsbuildinfo`, stray `.claude/` worktrees; proper `.gitignore`).
Add MIT `LICENSE`, honest `README.md` with a GIF, this document, `AGENTS.md`.
Decide final public repo strategy (keep history vs. fresh public repo with the
current code as a curated initial commit). Extract simulation loop from
`App.tsx` into a hook as the first, small structural refactor.

### Phase 1 — Validation (the credential) — COMPLETE
Headless test harness (Vitest) exercising the solver without the UI:
- **Invariant tests:** mass conservation, symmetric-flow symmetry, equilibrium stability, no-NaN under long runs at τ limits.
- **Canonical benchmarks:** Poiseuille profile vs. analytic solution; cylinder at Re = 20 (steady, Cd ≈ 2.0) and Re = 100 (Cd ≈ 1.35, Strouhal ≈ 0.165).
- `VALIDATION.md` with a results-vs-literature table.
- **In-app Strouhal measurement** (FFT over the Cl history) surfaced in the Results panel next to the literature value — instant credibility, and didactic in itself.
- CI (GitHub Actions): typecheck/build + fast tests on every push and pull
  request. The multi-hour canonical benchmarks remain a mandatory local ritual
  for solver/physics changes rather than an automatic per-push job.

### Phase 2 — Interpretation layer (the differentiator) — IN PROGRESS
Build on the existing regime detection:
- **Web Worker foundation — COMPLETE.** The validated solver now runs off the
  main thread with deterministic lifecycle and pacing coverage.
- **Contextual "what am I seeing?" explanations — COMPLETE.** A pure, tested
  model combines built-run safety, Cd
  convergence, Cl periodicity, geometry, Re and blockage without inventing
  unsupported field phenomena. The Results panel separates observation,
  interpretation and caveat. CI, Pages and the custom-domain smoke passed on
  2026-09-26.
- **Geometry-fidelity and validation-UX audit — COMPLETE.** The exact trailing-
  edge point is a separate D2Q9 component, 25/147 masks are 8-disconnected, two
  are empty, and NACA placement disagrees by a factor of two with the physical
  reference length used by τ, safety, forces and Strouhal.
- **NACA geometry/physical-mapping correction — NEXT.** Decide and validate one
  authoritative chord convention, reject invalid masks and reconcile every
  derived quantity before presenting NACA outputs as quantitative.
- **Visual truth and trust-centred UX — AFTER NACA CORRECTION.** Add a smooth
  source contour without hiding the lattice mask, correct aerodynamic-solid
  rendering/streamline semantics, and separate numerical safety, evidence
  sufficiency and physical support.
- **Canvas annotations — AFTER THE UX FOUNDATION:** stagnation point, wake
  region and separation zone, backed by field-derived evidence rather than
  force-history inference.
- **Plain-language glossary — PENDING:** expand and translate InfoTips after the
  annotation vocabulary is reviewed.

### Phase 3 — Guided experiments (the teacher mode)
Experiments defined as JSON presets + guided steps + observation prompts. Launch set:
1. *Vortex shedding vs. Reynolds* (cylinder sweep — the boundary-layer separation lesson).
2. *Angle of attack on a NACA airfoil* (live Cl–α behaviour, stall qualitatively).
3. *Blunt vs. streamlined body* (why fairings work).
Shareable experiment/config URLs if cheap.

### Backlog — small, unscheduled (candidates to slot into any phase if cheap)
- **Convective / non-reflecting outlet (CBC).** *(carried from phase 1.2e.)*
  The Zou–He pressure outlet is acoustically reflective; with the reflective
  velocity inlet it sustains a bounded, **mean-neutral** acoustic cavity mode in
  the cylinder domains (phase 1.2e D-4: doubling the outlet distance doubled the
  mode's period but left BM-2's mean unchanged, 2.190 → 2.189). A convective BC
  (∂ₜφ + U·∂ₙφ = 0 at the outlet) would let vortices leave without reflection —
  cleaning up app-side vortex exit and shortening the cylinder-benchmark domains.
  A `src/lbm/boundaryConditions.ts` change; needs its own spec (AGENTS.md rule 1).
  See `VALIDATION.md` (outlet cavity mode / closed BM-2 finding).
- **Pressure field view.** We render |u|, ux, uy and vorticity; pressure is missing
  and is nearly free in LBM (`p = ρ·c_s²`, with `c_s² = 1/3` in lattice units —
  the density field already exists). Didactically strong: suction over a wing's
  upper surface is *the* lift explanation. *(Inspired by Kutta, see §7.)*
- **Single-step control while paused.** Advance the simulation one step at a time.
  Trivial to implement, and a powerful teaching device for watching an instability
  grow or a vortex detach frame by frame. *(Inspired by Kutta, see §7.)*
- **NACA 5-digit airfoils.** We generate 4-digit profiles from the closed-form
  equations; the 5-digit family is the same approach with a different camber-line
  definition. Cheap extension of `src/geometry/naca.ts`. *(Inspired by Kutta, see §7.)*

### v2 horizon (not in scope for v1)
- **Parabolic inlet BC → confined-cylinder benchmark → tight BM-2 closure.**
  A *coupled* item. SOPLO's inlet is uniform (plug flow); the canonical
  *confined*-cylinder references (Chakraborty et al. 2004; Schäfer–Turek 1996)
  use a **parabolic (Poiseuille) inlet**, and the confinement correction to Cd
  depends on the inlet profile — so a confined comparison against SOPLO's
  uniform inlet would confound setup with solver. Adding a parabolic inlet BC
  (a `src/lbm/boundaryConditions.ts` change, needs its own spec) unlocks the
  Schäfer–Turek confined benchmark and a literature-tight **confined** gate for
  BM-2 — closing the known-limitation documented in `VALIDATION.md` (BM-2 is a
  *reporting* benchmark in v1: Cd = 2.190, +6.8% vs the unconfined 2.05
  reference, from low-Re confinement at β = 5%). A blockage sweep (β 5% → 2.5%)
  is the direct confirmation of the confinement offset and belongs with this
  work.
- **WebGPU compute solver** — raises the Re ceiling and grid sizes substantially. Flagship of v2.
- **AI interpreter (BYO API key):** a text field where the user pastes their own Anthropic/OpenAI key; the model receives the sim config, regime, force history and Strouhal, and narrates/answers questions in context. Sits naturally *on top of* Phase 2's structured interpretation data. Privacy stance: key stays client-side, calls go direct from the browser.
- Side-by-side comparison mode (two configs, one screen — very didactic).
- More geometries; parameter sweep automation.

## 6. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07 | Reposition from "personal experiment" to **serious didactic open-source tool** | The differentiators (units, honesty, interpretation) are worth building for a public audience |
| 2026-07 | **English** for UI, code and docs | Open-source reach |
| 2026-07 | **MIT license** | Didactic tool: maximize adoption; nothing to protect |
| 2026-07 | **Keep the existing codebase** — no rewrite | Solver and architecture audited and sound; what's missing is around the code, not inside it |
| 2026-07 | Web Worker in v1; **WebGPU deferred to v2** | Didactic grids run fine on CPU; WebGPU is high effort and becomes v2's flagship |
| 2026-07 | AI interpreter in backlog (v2), designed as BYO-key, provider-agnostic | Depends on Phase 2's structured interpretation data existing first |
| 2026-05 | MRT over BGK collision | ~3–4× higher stable Re at the same grid |
| 2026-05 | Fixed `u₀ = 0.07 lu`; user never sees lattice units | Keeps Ma low and the physics honest; physical units are the UX |
| 2026-05 | Momentum-exchange (Ladd) for forces, not pressure integral | Standard, accurate on staircase boundaries, and captures both pressure and viscous contributions |
| 2026-07 | **Kutta** adopted as conceptual reference only — no code reuse | Different language/stack; SOPLO's value is in the ground Kutta explicitly cedes (see §7) |
| 2026-07 | Solver storage migrated Float32Array → Float64Array | Invariant tests INV-1/2 exposed f32 rounding floor (~1e-7); f64 passes with 70–2800× margin, is +12% faster in JS (arithmetic is always double; f32 pays conversion per access), at 2× memory (negligible on desktop). The f64 CPU solver becomes the reference for validating the future f32 WebGPU solver in v2 |
| 2026-07-15 | **Zou–He BC pair** — velocity inlet (free density) + pressure outlet (ρ = 1); spec 1.2b | The legacy equilibrium inlet pinned ρ = 1 and over-constrained the flow (BM-1 choked and never converged, BM-2/BM-3 drifted). The well-posed pair unblocked BM-1 (converges to L2 = 0.159%) |
| 2026-07-15 | **Ghost-rate retune to Lallemand–Luo** (s_e = s_ε = 1.4, s_q = 1.2); spec 1.2b rev 2 | The old aggressive ghosts (1.8/1.7) were stable only under the legacy inlet; with wet-node Zou–He BCs they are linearly unstable at every τ. BC scheme and ghost rates are a **coupled system** — retuned as one change |
| 2026-07-16 | **INV-6 mean-density gate referenced to the analytic Poiseuille offset**; spec 1.2b rev 3 | A driven channel holds a pressure ramp, so the domain-mean offset is ≈ Δρ/2 = 36·ν·ū·L/(2H²) — which the original flat 5e-3 gate could not pass on the spec's own grid. Gate the mean against the physics the test imposes |
| 2026-07-17 | **Free-slip side walls = official cylinder-benchmark setup** (BM-2/BM-3); spec 1.2c/1.2d | Standard unconfined-comparison practice: removes the no-slip wall-BL bias (measured −4.7% on BM-3 Cd). BM-1 keeps no-slip; app default stays no-slip |
| 2026-07-17 | **D = 30 official cylinder setup** (β = 5%) with the 1/D refinement rationale; spec 1.2d | The staircase (curved bounce-back) bias is first-order in 1/D; the D = 20 → 30 fit extrapolates BM-3 Cd to 1.336, on the unconfined reference. Headline validation result |
| 2026-07-17 | **Corrected BM-2 convergence gate** — two 25k-window means agree ≤ 0.2%, reported Cd = final-50k mean; spec 1.2d | The old pointwise gate (\|ΔCd\| ≤ 1e-5 / 1000 steps) is unsatisfiable under the acoustic cavity mode. A measurement-definition fix, not a tolerance relaxation; the acceptance window (2.05 ± 6%) is unchanged |
| 2026-07-19 | **Outlet reflectivity ruled out for BM-2's mean** (D-4 discriminator); spec 1.2e | Doubling the outlet distance (25D → 50D) left mean Cd unchanged (2.190 → 2.189) while the acoustic fingerprint doubled as predicted. The outlet cavity mode is a bounded oscillation the windowed mean removes — not the mean bias; residual reattributed to low-Re confinement |
| 2026-07-21 | **BM-2 closed as a documented known-limitation** — reporting benchmark, not gated; spec 1.2f | +6.8% vs the unconfined 2.05 reference is low-Re confinement (β = 5%, uniform inlet); resolution and outlet both ruled out. A tight *confined* gate needs a parabolic inlet (v2). BM-2 asserts only a loose sanity bound (1.8–2.4); BM-1/BM-3 stay literature-gated |
| 2026-07 (1.2 lesson) | **Numeric gates and claims must carry their derivation** | Four phase-1.2 spec errata shared one root: a threshold or claim stated without deriving it (INV-6 gate; the unsatisfiable BM-2 convergence gate; the outlet-clamp mean claim overturned by D-4; the outlet corner-term sign erratum). Every gate/claim now records *why* its number is what it is |
| 2026-07-28 | **App-gate for in-app Strouhal is plumbing, not physics**; spec 1.3a rev 2(f) | The original gate (in-app St inside the literature window 0.157–0.173) is unsatisfiable: `resolveDomainSize` fixes Ny = 100 and tunnel mode is hidden, so no buildable cylinder reaches β ≤ 5% — every case legitimately sits above the window (0.1812 at β = 10%). Same argument as BM-2's confined gate (1.2f). New gate: St appears, is finite, matches a headless run of the same setup ≤ 1%; physical validation lives in BM-3 |
| 2026-07-28 | **Strouhal search band capped in St space (ST_MAX = 0.35), prominence threshold 10 → 100**; spec 1.3a rev 2 | The impulsive-start acoustic box mode is a genuine spectral peak at St ≈ 1.2, so no prominence gate rejects it; a physical St cap does (bluff-body shedding never exceeds ~0.35). Below β ≈ 8.5% the acoustic fundamental enters the band and prominence discriminates instead — hence the raised threshold, measured ~45× above the noise floor; accept-side margin is a thinner 2.8× (a recorded finding) |
| 2026-07-28 | **Literature reference annotated with blockage β when confined**; spec 1.3a rev 3 | Showing Williamson's unconfined value beside a confined in-app measurement reads as solver error when the gap is the user's β (honesty, AGENTS.md rule 2). The reference is annotated, never hidden. F8 dev-crash confirmed a React dev-instrumentation artifact — production build ran past a full buffer (107k steps), not a merge blocker |
| 2026-09-20 | **Phase 1 closed; fast CI added; official benchmarks remain local** | `test:fast` and the production build run on Node 20/24 for pushes and pull requests. BM-1/BM-2/BM-3 remain the validated local ritual for solver/physics changes because automatic multi-hour reruns add cost without new information. Regression goldens, a benchmark guardian and optional seeded perturbation are deferred until external contributors or the next legitimate solver change |
| 2026-09-20 | **Web Worker is the next implementation phase; bundle size re-measured there** | The validated solver remains unchanged and moves off the main thread before interpretation UI expands. The current production build is valid but warns about a ~608 kB minified JS chunk; Worker extraction changes chunk topology, so size is measured again before separate code-splitting work is considered |
| 2026-09-22 | **Web Worker foundation closed; Node 20 fast budget derived at <32 s** | Solver/physics stayed unchanged; WK-1…WK-9 cover ownership, transfer isolation, lifecycle, stale events and pacing. Four workers measured best; five comparable Node 20 runs ranged 29.80–30.89 s, so the old 30 s bound sat inside normal variance. The 32 s test-orchestration budget adds 1.11 s above the observed maximum without changing coverage or physics gates. Build emits a 17.20 kB Worker and a 602.77 kB main chunk; code splitting remains separate work |
| 2026-09-22 | **Public preview lives at `soplo.alx.engineering`** | GitHub Pages deploys a tested relative-base Vite artifact from `main`; Namecheap provides only the `soplo` CNAME and GitHub enforces HTTPS. The validated CPU Worker remains the production backend. WebGPU is documented as an optional, separately validated v2 backend rather than a prerequisite for web distribution |
| 2026-09-26 | **Contextual interpretation uses signal-specific evidence precedence** | The Results panel now treats the Cd heuristic as drag settling/variation and the Cl spectrum as periodicity evidence. A production-preview Re = 100 cylinder measured settled Cd alongside St = 0.1806 from 19.7 periods, proving those signals are compatible rather than contradictory. Safety errors still suppress all regime claims; low-Re periodicity remains a conflict; non-cylinder geometries receive generic wording only. No solver, spectral threshold or physics gate changed |
| 2026-09-26 | **Geometry truth and validation UX precede canvas annotations** | QA showed that a validated solver core is not enough when the raw staircase mask looks defective and users still cannot judge whether a result is trustworthy. The next phase first classifies the apparent detached NACA cell, then keeps the discrete mask visible as numerical truth while designing separate numerical-safety, evidence-sufficiency and physical-support states. Krüger et al., Tritton and Oberkampf & Roy provide the method, physics and V&V source hierarchy; Kutta remains UX inspiration only |
| 2026-09-26 | **NACA physical coherence precedes its visual polish** | The 147-case Phase 2.3 audit found a factor-two disagreement between placed chord (10/20/40) and physical/reference metadata (20/40/80), 25 D2Q9-disconnected masks and two empty masks. The reported point is the trailing-edge cell but is physically separate in the solver mask. Current NACA Cd/Cl/St are therefore non-quantitative; choose and revalidate one chord convention before adding a smooth overlay or broader UX work |

## 7. Reference projects

### Kutta — `github.com/crgimenes/kutta` (formerly `crgimenes/airfoil`)

A 2D LBM wind tunnel in Go + Ebitengine (D2Q9 **BGK**, desktop binaries,
MIT-licensed; analyzed at v0.1.5, July 2026). Excellent, polished project —
studied as a conceptual reference. **Policy: ideas only, zero code translation.**
Algorithms and approaches are not copyrightable; verbatim code reuse would
require carrying their MIT copyright notice, and we simply don't do it (different
language, different solver decisions).

**What it teaches us about positioning.** Kutta's README states openly that it
is qualitative, not validated CFD: it runs in lattice units, aims to get the
*shape* of the flow right and accepts getting the numbers wrong, and its forces
come from a pressure integral that ignores skin friction (understating drag —
documented by them as a known limit). That is precisely the ground SOPLO claims:
**physical units, momentum-exchange forces (pressure + viscous), and documented
quantitative validation**. The two tools are complementary, not competitors —
and SOPLO's README may state this advantage factually, without arrogance.

**What we adopt conceptually:**
- *Headless-testable core, enforced by package layout* — their `lbm`/`foil`/
  `scene`/`viz` packages carry no rendering dependency and are unit-tested
  headlessly, with a snapshot tool that renders fields to PNG without a GPU
  for physics sanity checks (lift rising with angle of attack, force signs).
  This mirrors and validates the layering rule already in `AGENTS.md`. Note
  their tests are *qualitative sanity checks*; SOPLO's Phase 1 goes further
  with quantitative benchmarks against literature — consistent with the
  positioning gap above.
- *Pressure field view*, *single-step while paused*, *NACA 5-digit* — see Backlog (§5).

**What we deliberately do not chase:** their shape editor (Bézier handles,
wing/flap cutting, keyframed control surfaces) is impressive but is *their*
identity. SOPLO's energy goes to interpretation and validation instead.

## 8. Working method

The project follows **Spec Driven Development (SDD)**: specs and decisions are
written down *before* implementation, live in the repo, and are versioned with the
code. This file and `AGENTS.md` are the primary SDD artifacts. High-level
architecture is decided in conversation with a high-capability model; implementation
is delegated to coding agents in scoped, single-phase sessions.
