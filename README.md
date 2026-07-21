# SOPLO

**An open-source, browser-based 2D fluid dynamics playground built to help you
*understand* fluid mechanics — not just watch pretty colors.**

*Soplo* is Spanish for "puff" or "blow" — the breath of air that starts everything.

> The wind tunnel you wish you had before (and during) your first fluid
> mechanics course.

![SOPLO cylinder wake at Re ≈ 100](docs/demo.gif)

## What it does

You describe a problem in **real physical units** (meters, m/s, air or water),
place a cylinder, a square, a NACA airfoil, or your own SVG/DXF geometry in the
flow, and SOPLO runs a Lattice-Boltzmann simulation live in your browser while it:

- shows you the flow — velocity fields, vorticity, smoke-line streamlines;
- measures aerodynamic forces (Cd, Cl, L/D) and classifies their convergence
  (converging / oscillating / unstable);
- **tells you when to trust the numbers and when not to** — a Reynolds/τ/Mach
  safety indicator and blockage warnings, with the actual limits surfaced;
- and (this is where it's headed) **explains what you are looking at** in plain
  language.

Most web LBM demos give you sliders in lattice units that mean nothing
physically, let you simulate garbage without warning, and show colors without
explanation. SOPLO's whole identity is closing those three gaps: real units,
physical honesty, and interpretation.

## What it is NOT

- **Not** a replacement for OpenFOAM, ANSYS, or any engineering-grade CFD tool.
- **Not** 3D, not compressible, not turbulence-model-based. It is 2D
  incompressible LBM with an honest Reynolds ceiling (≈ 3,500 with the current
  MRT scheme at typical grid sizes) — and it tells you when you exceed it.
- **Not** fully validated yet: solver invariants (mass conservation, symmetry,
  stability, no-slip) are tested and green, and the Re = 100 vortex-shedding
  benchmark matches literature (Cd, Strouhal). Two canonical cases are
  currently blocked by an open boundary-condition finding — see
  [`VALIDATION.md`](./VALIDATION.md) for the honest scoreboard.

## Running locally

Requirements: [Node.js](https://nodejs.org/) ≥ 18 and npm.

```bash
git clone https://github.com/a-alvaro/soplo.git
cd soplo
npm install
npm run dev     # Vite dev server, prints a local URL
```

`npm run build` type-checks and produces a production build in `dist/`.

## Tech stack

- **React 19 + TypeScript + Vite + Tailwind CSS 4**, recharts for plots.
- Custom **D2Q9 MRT** Lattice-Boltzmann solver in plain TypeScript (no WebGL/GPU
  yet — a WebGPU solver is on the v2 horizon), rendered with Canvas2D.
- The solver (`src/lbm/`) is pure and headless: no React, no DOM, runnable in
  Node.

## Current state

**Implemented and working:**

- MRT collision (d'Humières basis) with tuned ghost-mode relaxation, stable to
  roughly 3–4× the Reynolds number of plain BGK.
- Half-way bounce-back on arbitrary solids; velocity inlet, zero-gradient outlet.
- Physical → lattice unit conversion with τ clamping and a warning system.
- Momentum-exchange (Ladd) force measurement; live Cd/Cl/L/D with convergence
  classification.
- Geometries: cylinder, square, parametric NACA 4-digit airfoils, SVG import,
  DXF import.
- Domain modes: free flow (auto-sized) and wind tunnel (manual dimensions or an
  SVG cross-section), with blockage warnings.
- Smoke-line streamline renderer; field rendering (|u|, ux, uy, vorticity).
- Safety indicator (Re/τ/Ma), educational popovers, perturbation injection to
  seed vortex streets.

**Not there yet (the roadmap):**

- **Validation** — headless test harness, invariant tests (mass conservation,
  symmetry, stability), canonical benchmarks vs. literature, in-app Strouhal
  measurement, CI.
- **Interpretation layer** — contextual "what am I seeing?" explanations,
  canvas annotations (stagnation point, wake, separation), glossary; solver
  moved to a Web Worker.
- **Guided experiments** — JSON-preset lessons (vortex shedding vs. Re, angle
  of attack on an airfoil, blunt vs. streamlined bodies).

See [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for the full vision, roadmap
and decision log, and [`AGENTS.md`](./AGENTS.md) for the rules AI coding agents
follow in this repo.

## License

[MIT](./LICENSE) © 2026 Alex Álvaro
