# Phase 1.2d Spec — Benchmark closure: official setups & BM-2 resolution discriminator

> Status: **complete (2026-07-17)** · Owner: Alex · Executed by: coding agent.
> Prereq: 1.2c complete (branch `phase-1-2c-benchmark-fidelity`): free-slip mode
> + BC-2 green, D-1/D-2/D-3 diagnostics documented, decision-tree endpoint
> reached. This spec records the maintainer's endpoint decisions and authorizes
> the final discriminator. Continue on the same branch or a child.

## Endpoint decisions (maintainer, 2026-07-17)

1. **BM-3 official setup becomes: free-slip side walls, D = 30** (Ny = 600,
   Nx = 1080, β = 5%), same acceptance windows. Rationale: passes both windows;
   the D = 20 → 30 refinement extrapolates Cd(D→∞) ≈ 1.334, landing on the
   unconfined reference (1.33–1.35) — the staircase bias is first-order in 1/D
   (bounce-back on curved boundaries) and fully accounted. The refinement study
   is a headline result: VALIDATION.md gets a dedicated subsection with the
   D = 20 / D = 30 / extrapolated values.
2. **Free-slip side walls become the official configuration for cylinder
   benchmarks** (BM-2, BM-3), documented as the standard unconfined-comparison
   practice. BM-1 keeps no-slip (its physics requires it). The app default
   remains no-slip (unchanged).
3. **Non-reflecting outlet / extended (40D) outlet: backlog**, not action.
   The Zou–He pressure plane is acoustically reflective; the resulting cavity
   mode is identified (period ≈ 2·Nx/c_s), bounded (±0.4% on Cd at BM-2), and
   handled by measurement (below). Revisit only if it ever gates a result.

## BM-2 convergence gate — corrected (derivation included)

The 1.2 gate (|ΔCd| ≤ 1e-5 over 1,000 steps) is unsatisfiable in the presence
of the identified acoustic mode: amplitude ±0.0094 with period ≈ 2.2k steps
produces in-window excursions up to ~2·0.0094·sin(π·1000/2200) ≈ 0.019 —
three orders of magnitude above the gate. This is a measurement-definition fix,
not a tolerance relaxation:

- **New gate:** split the tail of the run into two consecutive 25,000-step
  windows; each window's mean Cd is computed; the run is converged when the two
  means differ by ≤ 0.2% (relative). The **reported Cd is the mean over the
  final 50,000 steps** (≥ 20 acoustic periods — the mode averages out).
- The acceptance window on that mean is **unchanged**: 2.05 ± 6%.
- Record the oscillation amplitude and period alongside (informative), as the
  documented signature of the outlet cavity mode.

## Authorized work

1. **BM-2 at D = 30** (Ny = 600, Nx = 1080, β = 5%, free-slip), with the
   corrected gate above. Budget: run up to 150k steps (~1.5–2 h; one-off in
   this session, then it is the official BM-2). Record the D = 20 → D = 30
   shift and the 1/D extrapolation next to BM-3's (prediction on record:
   Cd(30) ≈ 2.16–2.17, extrapolated ≈ 2.06).
2. **Update the official suite** to the endpoint decisions: BM-2 and BM-3 at
   D = 30 free-slip with the corrected BM-2 gate; remove the now-superseded
   D = 20 no-slip variants from `test:bench` (they remain reproducible from
   VALIDATION.md's documented parameters).
3. **VALIDATION.md final scoreboard** for Phase 1.2: BM-1 / BM-2 / BM-3 with
   official setups, the refinement-study subsection, the acoustic-mode note,
   and closure of the BM-2/BM-3 finding (whatever the BM-2 outcome — if it
   lands out of window, that is a stop-and-report, not a closure).
4. **Close-out (only if all three benchmarks are green):** app smoke check per
   the 1.2b spec (§7) · AGENTS.md: free-slip mode noted in the BC row; official
   benchmark setups referenced · decision log entries in PROJECT_CONTEXT.md:
   the four from 1.2b rev 2, plus free-slip benchmark walls, D = 30 official
   setups with the refinement rationale, the corrected BM-2 gate with its
   derivation, and the outlet-reflectivity backlog item (with the erratum
   lesson: gates and claims carry derivations).

## Rules

Discrepancy protocol as always: if BM-2 at D = 30 falls outside 2.05 ± 6%,
document (value, trend vs. D = 20, extrapolation) and stop — no window edits,
no retuning. No solver changes of any kind in this session (free-slip already
exists; everything else is test/docs). Granular commits; no merge to main —
after your report, the maintainer merges the full 1.2b+c+d chain.
