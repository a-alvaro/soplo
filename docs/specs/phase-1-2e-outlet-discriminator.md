# Phase 1.2e Spec — BM-2 outlet-distance discriminator (D-4)

> Status: **approved draft** · Owner: Alex · Executed by: coding agent.
> Prereq: 1.2d stop-and-report (BM-2 at 2.190, +6.8%, mechanism attributed to
> the reflective pressure outlet). **Zero solver changes authorized** — this
> spec acts on domain geometry only.

## Physics rationale

The Zou–He pressure outlet has two distinct effects, both from the same plane:
(i) an acoustic cavity mode (oscillation, period ≈ 2·Nx/c_s — nuisance, does
not bias a mean by itself), and (ii) a **steady truncation of the wake's
pressure recovery** — clamping p = 1 at 25D forces faster recovery than
physical, which at Re = 20 (slow low-Re far-field decay; the reason literature
Cd(20) spans 2.0–2.1 with domain size) plausibly biases mean Cd upward.
D-4 separates them by moving the plane.

## D-4 — the discriminator

BM-2, identical to the official 1.2d setup (D = 30, β = 5%, free-slip walls,
Zou–He BCs, 150k steps, windowed-mean gate on the final 50k) with **one
change: downstream distance 25D → 50D** (Nx = 300 + 30 + 1500 = 1830;
1830×600 ≈ 1.1M cells; runtime ~3–3.5 h — one-off budget approved).

**Registered predictions (fingerprints):**
- Cavity period doubles: ~3.7k → ~6.3k steps (mechanism check, independent of
  the mean).
- If outlet-clamp dominates the mean bias: Cd 2.190 → ≈ 2.08–2.13 (in window).
- Oscillation amplitude: report (informative; expected same order or larger).

## Decision tree (mechanical)

- **Cd in window (≤ 2.17):** BM-2 official setup becomes the 50D domain.
  Phase 1.2 finding **closed** → execute the full close-out deferred from
  1.2d (app smoke check per 1.2b §7 · AGENTS.md updates · all decision-log
  entries listed in 1.2d §4, plus: 50D BM-2 domain with this rationale, and
  **backlog item: convective/non-reflecting outlet (CBC)** — the elegant fix
  that would shorten benchmark domains and clean up vortex exit in the app;
  cite the measured cavity signatures as motivation).
- **Cd improved but > 2.17:** stop and report with the refinement-style
  extrapolation vs. outlet distance (25D/50D) — maintainer chooses between a
  further distance point, a CBC spec, or a documented finite-domain tolerance
  with cited references.
- **Cd unchanged (± oscillation):** clamp hypothesis dead for the mean; the
  excess is low-Re confinement. Stop and report — maintainer decision between
  documented tolerance vs. cited confined references, or accepting BM-2 as a
  known-limitation benchmark.
- All branches: no window edits, no retuning, no solver changes.

## Rules

Discrepancy protocol as always. Granular commits on the 1.2 chain branch; no
merge to main (after this session the maintainer merges the full chain
regardless of branch outcome — the chain is getting long and every endpoint of
this tree leaves the repo in a consistent, documented state).
