# Phase 1.2f Spec — BM-2 closure & Phase 1.2 wrap-up

> Status: **approved draft** · Owner: Alex · Executed by: coding agent.
> Prereq: 1.2e stop-and-report (BM-2 residual attributed to low-Re confinement;
> outlet and resolution ruled out by D-4 and the 1/D study). This spec closes
> Phase 1.2. **Zero solver changes.**

## Decision (maintainer, 2026-07-19)

BM-2 is closed as a **documented known-limitation**, not gated. Rationale:

- The residual (+6.8% vs. the unconfined reference 2.05) is physical: low-Re
  confinement at β = 5% with a **uniform inlet**. Mechanism established by
  elimination across 1.2c–1.2e (walls, resolution, outlet all ruled out with
  registered-prediction discriminators).
- A gated comparison against *confined* literature (option b) was investigated
  and **rejected**: the canonical confined-cylinder references (Chakraborty et
  al. 2004 and successors) use a **parabolic inlet profile**, whereas SOPLO
  uses a uniform inlet. The confinement bias depends on the inlet profile, so
  such a comparison would confound setup with solver. Parabolic inlet is a v2
  item (it also unlocks the Schäfer–Turek confined benchmark), so a clean
  confined gate is deferred with it — not faked now.
- Literature supports the *direction and cause* of the bias (Cd decreases with
  Re at fixed blockage; wall proximity raises Cd at low blockage / low Re),
  which is what we cite — not a target number.

## Authorized work (docs + test annotation only)

1. **BM-2 test:** convert from a gating assertion to a **reporting benchmark** —
   it runs, prints its scoreboard block (measured Cd, unconfined reference,
   deviation, mechanism tag), and asserts only a loose sanity bound (e.g.
   1.8 ≤ Cd ≤ 2.4, catching gross regressions/NaN) with a comment explaining
   it is intentionally not a literature-tight gate. BM-1 and BM-3 remain
   fully gated.
2. **VALIDATION.md:** finalize the Phase 1.2 scoreboard — BM-1 ✅, BM-3 ✅
   (Cd/St), BM-2 reported with the known-limitation framing, the D-4 outlet
   evidence, the 1/D refinement study (headline), and a short cited paragraph
   on confined-cylinder literature (uniform vs. parabolic inlet, why the
   confined gate is a v2 item). References: Chakraborty et al., *Int. J.
   Thermal Sciences* (2004) for the confined trend; the unconfined refs already
   in the doc (Tritton, Dennis & Chang) for BM-2's 2.05 baseline. Mark each
   citation "verify page/volume before external use."
3. **PROJECT_CONTEXT.md backlog:** add the coupled v2 item —
   *parabolic inlet BC → Schäfer–Turek confined benchmark → tight BM-2 closure*
   — as one linked entry, plus the convective/non-reflecting outlet (CBC) item
   carried from 1.2e.

## Full close-out (deferred from 1.2d, now executed)

Since BM-2 is closed (as known-limitation) and BM-1/BM-3 pass, run the close-out
that every prior branch deferred:

4. **App smoke check** per 1.2b spec §7: dev server, cylinder at Re ≈ 100 and a
   moderate Re; confirm no inlet/outlet artifacts, finite forces, vortex street
   develops. Report qualitatively.
5. **AGENTS.md:** ensure the invariants/BC rows reflect the final state —
   Float64 storage, Lallemand–Luo ghost rates (1.4/1.2), Zou–He BC pair,
   free-slip side-wall mode, coupled-system note (BCs ↔ ghost rates). Add the
   official benchmark setups (D = 30 free-slip cylinders, 25D downstream;
   Poiseuille no-slip) as a reference note.
6. **PROJECT_CONTEXT.md decision log:** add every decision from the 1.2b–1.2f
   chain not yet logged — Zou–He BC pair, ghost-rate retune, INV-6, free-slip
   benchmark walls, D = 30 official setups + 1/D rationale, corrected BM-2
   windowed-mean gate, outlet-reflectivity (D-4) finding, BM-2 known-limitation
   closure. Terse, one line each, with the "gates/claims carry derivations"
   lesson noted once.

## Rules

No solver changes. No changes to BM-1/BM-3 gates. Granular commits
(test:/docs:). **This is the last session on the 1.2 chain** — after the
report, the maintainer merges 1.2b→1.2c (and children) to main. Provide the
final VALIDATION.md scoreboard and the AGENTS.md / decision-log diffs in the
report.
