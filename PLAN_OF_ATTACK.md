# SOPLO — Plan of Attack (model-agnostic)

> **Read this first when resuming work on SOPLO after a break.**
> It tells you where the project stands, what to do next, and how to work —
> without depending on any particular AI assistant, chat history, or session
> memory. Everything referenced here lives in this repository.
>
> Last updated: 2026-07-22 (after Phase 1.2 closure).

---

## 1. Sixty-second orientation

Read these three files, in this order. They are the source of truth:

1. **`PROJECT_CONTEXT.md`** — what SOPLO is, who it's for, the roadmap, and the
   decision log (why things are the way they are).
2. **`VALIDATION.md`** — what has been proven, with numbers and references.
3. **`AGENTS.md`** — the operating rules and protected invariants.

Then: `npm run test:fast`. If it's green (13 tests), the project is healthy and
you can start. If it's not, that is the first thing to fix — nothing else
proceeds on a red suite.

**State in one paragraph:** 2D LBM (D2Q9, MRT) fluid simulator in the browser,
React 19 + TypeScript + Vite, Float64 solver on the main thread. Phase 0
(hygiene) and Phase 1.1–1.2 (invariants + canonical benchmarks) are complete and
merged to `main`. Poiseuille validates to 0.159% against the analytic solution;
cylinder at Re = 100 gives Cd = 1.428 and St = 0.1691, both inside literature
windows; cylinder at Re = 20 is a documented known-limitation (+6.8%, low-Re
confinement). The differentiator — the interpretation layer that explains the
physics to non-experts — is **not built yet**. That is the point of the next
phases.

---

## 2. The working method (this is what makes SOPLO reproducible)

This is the part that must survive any change of tools. It has already caught
four specification errors that would otherwise have shipped as bugs.

**The cycle:** spec → agent session → report → decision → next spec.

1. **Nothing non-trivial starts without a written spec** in `docs/specs/`.
   A spec states: the problem, the authorized change (nothing outside it),
   acceptance criteria **with their derivations**, and a decision tree for
   foreseeable outcomes.
2. **Every numeric threshold carries its derivation.** Not "tolerance ≤ 5e-3"
   but "≤ 5e-3, because <physics>". This rule exists because four thresholds
   were written without it and all four were wrong. If you cannot derive it,
   you do not yet know what you are tolerating.
3. **One session, one scope.** Sessions are disposable; the repo is the memory.
   Start a fresh session per sub-phase — never continue in a session that has
   already finished its scope.
4. **The discrepancy protocol is absolute.** If a test or benchmark falls
   outside its window, the agent must: document the setup, the measured value,
   and a hypothesis — then **stop**. Never loosen a tolerance, never retune the
   solver, never "recalibrate to pass". A failing gate is a finding, and the
   decision about it belongs to the maintainer.
5. **Register predictions before running expensive experiments.** Write down
   what you expect to happen and why. A prediction that fails is worth more
   than one that was never made — it killed two wrong hypotheses in Phase 1.2.
6. **Merge when a phase reaches a consistent, documented state**, with
   `--no-ff` so each phase is one identifiable bubble in the history.

**How to brief any agent** (Claude Code, Codex, or whatever comes next):

```
Read AGENTS.md, then docs/specs/<the spec for this session>, then VALIDATION.md.
Those files are the source of truth and override anything in this prompt.
Your scope is exactly what the spec authorizes — nothing else.
Discrepancy protocol applies: if something falls outside its window, document
and stop; do not adjust tolerances or retune.
Granular conventional commits in English. Work on branch <name>. No merge to
main. Final report: full output, findings, and any ambiguity you noticed but
did not touch.
```

That briefing is model-agnostic by construction: it contains no knowledge, only
pointers to the repo plus the protocol.

---

## 3. What to do next — ordered

### Step 0 — Reconcile the stale spec *(do this first; ~30 min, docs only)*

`docs/specs/phase-1-validation.md` contradicts the repository: its §1.2 still
says D = 20, Ny = 400, Nx = 720 and a literature-gated BM-2 at ±6%; its §1.1
lists only INV-1..5. Reality (per `AGENTS.md`, `VALIDATION.md`, and the tests):
D = 30, 1080×600, free-slip side walls, BM-2 as a *reporting* benchmark with a
1.8–2.4 sanity bound, and INV-6 exists. The closure decisions live in
`docs/specs/phase-1-2d-benchmark-closure.md` and were never folded back.

**Do:** fold the closure decisions into §1.1/§1.2 of the validation spec so it
matches the repo (this is the file `VALIDATION.md` links to). Also fix its
Definition of Done, which is unsatisfiable as written — see Step 1.

Why first: any agent handed that file as truth will contradict the solver.

### Step 1 — Spectral module & in-app Strouhal *(the last piece of Phase 1)*

Treat this as the **first brick of the interpretation layer**, not as more
validation: showing "St = 0.168 (literature 0.164–0.166)" is exactly the kind
of thing that teaches.

Key decisions already made (do not relitigate):

- **The old Definition of Done is void.** It required the in-app St to match the
  benchmark within 1%. Impossible: the benchmark runs free-slip walls, the app
  defaults to no-slip, and that shift alone moves St by −4.0% (measured, 1.2c
  D-2); resolution adds ~1% more. Replace with **two separate gates**:
  (a) *estimator gate*: FFT vs. zero-crossings **on the same Cl trace**, ≤ 1%;
  (b) *in-app gate*: displayed St falls inside the literature window
  (0.157–0.173) for a Re ≈ 100 cylinder.
- **Cl fixture instead of re-running benchmarks.** Have BM-3 emit its Cl trace
  decimated at the 20-step cadence and commit it as a test fixture. All spectral
  validation then lives in `test:fast` against real solver signal, at zero
  runtime cost. Derived numbers: BM-3's measurement window (31,500 steps) yields
  1,575 samples; the largest usable power of two is **N = 1,024** (≈ 8.1 shedding
  periods, above the 6-period guard). Bin width is 12.4% of f_shed, but Hann
  window + parabolic interpolation on log-magnitude gives ≈ 0.25% error on a
  near-pure tone — 4× margin on the 1% gate. Record in the fixture the solver
  SHA that produced it, so it is regenerated when the solver legitimately changes.
- **In-app buffer: 4,096 samples, not 2,048.** Periods held = 473/D at N = 2,048,
  so bodies above D ≈ 79 cells would fall under the 6-period guard and display
  "—". N = 4,096 raises that to D ≈ 158 and costs 32 KB.
- **Seeded RNG in `injectPerturbation` is authorized** as an *optional* `seed`
  parameter whose default preserves current (random) behavior. Tests seed it;
  the app is unchanged. This makes BM-3 bit-reproducible on a given machine.
- Also required, none of it optional: **flush the spectral buffer** when Re, u₀
  or geometry changes (otherwise the FFT mixes regimes); **peak-validity guard**
  (peak/median ratio ≥ ~10, excluding DC and the first 2–3 bins after Hann);
  the signal is **Cl, not Cd** (Cd oscillates at twice the frequency — test it);
  synthetic test tones at a **non-round frequency** (e.g. 0.0137 steps⁻¹) so a
  stray factor of 20 or 2π cannot pass by coincidence; and widen `test:fast` in
  `package.json`, which currently points only at `tests/invariants`.

### Step 2 — Move the solver to a Web Worker *(start of Phase 2)*

Do this **before** building interpretation UI, not after. The solver currently
runs on the main thread; reactive panels and canvas annotations will compete
with it. This is a contained refactor and everything after it builds on solid
ground. Watch React 19 StrictMode double-invocation in dev — the worker
lifecycle must be idempotent.

### Step 3 — The interpretation layer *(the actual differentiator)*

This is why SOPLO exists and it is still unbuilt. On top of the existing regime
detection (steady / oscillating / unstable) and the new Strouhal:

- **Contextual explanations** driven by Re and flow state: attached laminar flow
  → boundary-layer separation → von Kármán street → beyond-validity. Plain
  language, no jargon without a definition.
- **Canvas annotations**: stagnation point, wake region, separation zone.
- **Plain-language glossary**; expand the existing InfoTips.

The physics content for all of this is already written and referenced in the
project's physics document (`docs/`, the Spanish fundamentals PDF) — §8 covers
the observable phenomena and their literature values.

### Step 4 — Guided experiments *(Phase 3, the teacher mode)*

JSON-defined experiments: preset config + guided steps + observation prompts.
Launch set: vortex shedding vs. Reynolds; angle of attack on a NACA airfoil;
blunt vs. streamlined body.

### Deferred on purpose

- **CI tiers, regression goldens, guardian job** (was Phase 1.3b). The guardian
  job — fail a PR that touches `src/lbm/` or `src/physics/` without evidence of
  a bench run — is worth doing when there are external contributors or the next
  time the solver is modified. Note for whenever it happens: benchmarks are
  bit-reproducible *on the same machine*; across architectures, floating-point
  differences accumulate over 150k steps, so goldens need tolerances, not exact
  equality.
- **Official benchmarks in CI: no.** They take hours and, without RNG, reproduce
  the identical number every time — hours of compute for zero information. Run
  them locally as a ritual, plus `workflow_dispatch` and release tags, recording
  SHA, Node version and wall time in `VALIDATION.md`.

---

## 4. Guard-rails that outlive any tool

- **Never modify `src/lbm/` or `src/physics/` without a spec** authorizing the
  specific change. These layers are validated physics.
- **Boundary scheme and MRT ghost rates are a coupled system.** Changing either
  invalidates the other's validation. This was learned the hard way.
- **Never weaken a physical-honesty warning.** If a feature lets a user run
  outside validity limits, it must surface a warning, never hide one.
- **The app default stays no-slip side walls**; free-slip exists for benchmarks.
- **Keep `src/lbm/`, `src/physics/`, `src/geometry/` free of browser APIs** —
  they must remain runnable headless under Node/Vitest.
- **English everywhere**: code, comments, UI strings, docs, commits.
- Citations in docs are marked "verify page/volume before external use" — they
  were written from knowledge, not from opening every paper. Verify before
  citing externally.

---

## 5. Calibration note for the maintainer

Phase 1 was planned as three sub-phases and ran to nine. The work was real —
it found and fixed a genuine product bug (an over-constrained inlet that slowly
starved the flow, invisible to the naked eye) and produced a refinement study
whose 1/D extrapolation lands exactly on the literature value. But the cost is
that **the thing that makes SOPLO different from the dozens of LBM demos on
GitHub still does not exist.**

The validation is now good enough. Resist the pull of more rigor for its own
sake — the blockage sweep, the confined benchmark, the CI machinery are all
defensible and all deferrable. Build the interpretation layer next. A repo with
flawless validation and no teaching layer is one more validated solver; with
both, it is SOPLO.
