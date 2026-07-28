# Phase 1.3a Spec — In-app Strouhal (FFT) & the spectral module

> Status: **approved draft** · Owner: Alex · Executed by: coding agent, one session.
> Prereq: Phase 1.2 chain merged to main (BM-1 ✅, BM-3 ✅, BM-2 reported /
> known-limitation; spec 1.2f).
> Rules: `AGENTS.md` applies. This spec supersedes the Strouhal half of
> `phase-1-validation.md` §1.3, corrects the Phase 1 Definition of Done (see
> Erratum), and authorizes the listed changes and nothing else. CI, the
> regression tier and benchmark reproducibility are **spec 1.3b**.

## Erratum — the Phase 1 Definition of Done gate is unsatisfiable

`phase-1-validation.md` currently closes with:

> *Strouhal visible in-app on a Re = 100 cylinder and matching the benchmark
> measurement within 1%.*

That gate cannot be met, and not because of a bug. The benchmark runs
**free-slip** side walls at **D = 30** in a 1080×600 domain (official setup,
spec 1.2d); the app default is **no-slip** (AGENTS.md, unchanged by 1.2d
decision 2) at whatever D the user builds. Both differences are measured:

- no-slip → free-slip shifts BM-3 St by **−4.0%** (1.2c D-2, VALIDATION.md);
- D = 20 → D = 30 shifts BM-3 St by **+1.06%** (1/D refinement study).

An in-app no-slip cylinder at Re ≈ 100 is therefore expected to sit several
percent from 0.1691, *correctly*. Gating the app against the benchmark number
would fail on physics the project has already documented. This is the same
failure mode as the four phase-1.2 errata: a threshold written without its
derivation.

**Corrected Definition of Done (replaces the sentence above):**

1. **Estimator gate** — the FFT estimator and the zero-crossing estimator,
   applied to *the same recorded Cl trace*, agree within **1%** (SP-9).
2. **App gate** — St displayed for an in-app cylinder at Re ≈ 100 falls inside
   the **literature window 0.157–0.173**, not inside ±1% of 0.1691.

## Goal

One pure, headless-testable spectral module that both the app and the test
suite use, so the Strouhal number the user reads is produced by code the
benchmark validated — and turn BM-3's three-hour Cl signal into a committed
fixture that the fast tier can exercise forever at zero cost.

---

## 1. Module — `src/physics/spectral.ts`

Lives in `physics/` (protected layer): **no React, no DOM, no imports from
`components/` or `rendering/`**. Dependency direction per AGENTS.md.

```ts
export type StrouhalStatus = 'ok' | 'filling' | 'no-peak' | 'band-edge';

export interface StrouhalEstimate {
  st: number | null;          // f·D/u0, dimensionless
  frequency: number | null;   // 1/steps (NOT 1/sample)
  periods: number;            // shedding periods contained in the record
  prominence: number;         // peak magnitude / in-band median magnitude
  status: StrouhalStatus;
}

export class StrouhalEstimator {
  constructor(opts?: { capacity?: number; cadence?: number });
  push(cl: number): void;     // one call per sampled point
  reset(): void;
  estimate(charCells: number, u0: number): StrouhalEstimate;
}
```

### Signal and cadence

- **Input is Cl, never Cd.** Cd oscillates at **2·f_shed**; feeding it in
  yields a silently doubled St. SP-5 pins this.
- `cadence` default **20 steps/sample** — the existing `forceHistory` sampling
  tick (AGENTS.md known pitfalls). The estimator never sees step counts; it
  converts sample-domain frequency to 1/steps by dividing by `cadence`. A
  missing or wrong `cadence` is a clean factor-20 error, which SP-2 catches by
  20× margin against a 1% gate.
- The 500-point `forceHistory` used by the convergence chart is **unchanged**.
  This is a second, independent buffer.

### Capacity — derivation

Shedding periods held by a full buffer:

```
periods = N · cadence · St · u0 / D = N · 20 · 0.165 · 0.07 / D ≈ 0.231·N / D
```

| N | periods at D = 30 | largest D meeting the 6-period guard | memory |
|---|---|---|---|
| 2,048 | 15.8 | D ≤ 79 cells | 16 KB |
| **4,096** | **31.5** | **D ≤ 158 cells** | **32 KB** |

`capacity` default **4,096**. (`phase-1-validation.md` §1.3 claimed 2,048 ≈ 24
periods; that figure assumed D ≈ 20 and does not hold at the D = 30 official
setup, where 2,048 gives 15.8. The 6-period display guard, not the buffer
length, is what protects the estimate — but 2,048 falls below it for bodies
above ~79 cells, which the app can build.)

### Method

1. Take the filled prefix, length `L` (the ring buffer works partially filled —
   the user must not wait for 4,096 samples before seeing a number).
2. Remove the mean of the prefix.
3. Apply a **Hann** window.
4. Zero-pad to the next power of two ≥ `L`, capped at 8,192, and FFT.
   Padding interpolates the spectrum; it adds no information. Resolution is set
   by `L`, and the ≥6-period rule is what guards it.
5. **Search band** (this single rule replaces both the DC exclusion and the
   period guard, and keeps them consistent by construction):

   ```
   f ∈ [ 6 / (L · cadence) , 1 / (2 · cadence) ]     [1/steps]
   ```

   Lower edge = exactly 6 periods in the record. Upper edge = Nyquist. A peak
   below the lower edge cannot be resolved; a peak above Nyquist cannot occur
   for shedding (aliasing would need `D < 2.8·St ≈ 0.5` cells).
6. Take the in-band argmax; **3-point parabolic interpolation on the
   log-magnitude** around it.
7. Convert: `frequency = f_sample / cadence`, `st = frequency · charCells / u0`.

**Accuracy of step 6 — derivation.** For a Hann-windowed near-monochromatic
tone, log-magnitude parabolic interpolation carries a bias of ≲ 0.02 bins. On
the BM-3 fixture (L = 1,575, f = 3.95·10⁻⁴ 1/steps) the un-padded bin is
1/(L·20) = 3.17·10⁻⁵, i.e. 8.0% of f, so the expected error is
0.02 · 8.0% ≈ **0.16% of f**. The 1% gate carries ~6× margin.

### Validity guards

| Guard | Rule | Returned status |
|---|---|---|
| Record too short | `L · cadence · f_est < 6` periods — i.e. no in-band peak exists | `filling` |
| Peak not prominent | `peak / median(in-band magnitudes) < 10` | `no-peak` |
| Peak at band edge | argmax is the first in-band bin (an under-resolved shoulder, not a peak) | `band-edge` |

`st` and `frequency` are `null` for anything other than `ok`.

**Prominence threshold — derivation and a required measurement.** A saturated
limit cycle gives peak/median of O(10²); broadband noise gives O(1). 10 is one
order below the former and one above the latter. It is a first-cut value: the
session **must report the measured prominence** on the BM-3 fixture (SP-9) and
on the app smoke run. If either lands within 3× of the threshold, that is a
finding — report it, do not retune the threshold silently.

### Length scale

`charCells` is the caller's argument and **must be the same quantity the safety
indicator uses** (`built.charCells` / `liveCharCells`), i.e. the full
diameter/side/chord in cells, never a half-length — the definition AGENTS.md
pins for `Re_safe ≈ 21·D_cells`. Using a different length scale here would put
the displayed St and the displayed Re on inconsistent definitions.

### FFT implementation

No FFT dependency exists and none is added: implement an in-module radix-2
Cooley–Tukey transform. It is ~40 lines, it keeps `physics/` dependency-free,
and it is itself didactic. SP-1 gates it against a naive DFT.

---

## 2. Fixture — BM-3's Cl trace

BM-3 already accumulates `cl[]` at every step over its 31,500-step measurement
window. Decimated to the 20-step app cadence that is **1,575 samples** (≈ 12.4
shedding periods at T ≈ 2,540 steps) — enough for the fast tier to exercise the
full pipeline on real solver output instead of only on synthetic tones.

- **Path:** `tests/fixtures/bm3-cl-trace.json`, committed. ~16 KB at 6
  significant digits.
- **Emission is opt-in:** written only when `SOPLO_WRITE_FIXTURES=1`. A bench
  run must never silently rewrite a committed fixture that gates the fast tier
   — that would be a self-certifying loop. Add `writeTrace()` to
  `tests/benchmarks/helpers.ts` alongside `printReport()`.
- **Contents:** the decimated samples plus metadata — `cadence`, `D`, `u0`,
  `Nx`, `Ny`, `sideWalls`, `discardSteps`, `measureSteps`, the **full-rate
  zero-crossing St measured in that same run**, and the commit SHA. The
  full-rate St is stored because BM-3 uses `Math.random()` in its transient, so
  a different run produces slightly different statistics; the fixture must
  carry its own reference, not the published 0.1691 from another run.
- Regenerating the fixture is a deliberate act with its own commit
  (`test: regenerate BM-3 Cl fixture — reason`), never a side effect.

---

## 3. Tests — fast tier, `tests/spectral/`

| ID | Test | Acceptance |
|---|---|---|
| SP-1 | Radix-2 FFT vs naive DFT, 64-point random input | max abs error ≤ 1e-12 |
| SP-2 | Pure sine at a **non-round** frequency (0.0137 1/steps — round frequencies let factor-20 and 2π errors pass by coincidence) | recovered frequency within 1% |
| SP-3 | Sine + white noise at 20 dB SNR | within 1% |
| SP-4 | Sine + slow linear drift (tests mean removal + windowing) | within 1% |
| SP-5 | Signal at 2·f (a Cd-like input) | returns 2·f, **not** f — documents that the caller must pass Cl |
| SP-6 | Partial fill below 6 periods | `st === null`, status `filling` |
| SP-7 | Broadband noise, no tone | `st === null`, status `no-peak` |
| SP-8 | `reset()` isolation: push sine A, reset, push sine B | recovers B; no contamination from A |
| SP-9 | **Fixture.** FFT estimate on `bm3-cl-trace.json` vs (a) zero-crossings recomputed on the same decimated trace, (b) the stored full-rate zero-crossing St | both within **1%**; report the measured prominence |

SP-9(a) vs SP-9(b) also validates the decimation itself: the full-rate estimate
sees 20× more samples per period, so agreement between them means the 20-step
cadence does not bias the measurement.

`package.json`: `test:fast` currently runs `tests/invariants` only and must be
widened to include `tests/spectral`. Total fast-tier target stays **< 30 s**
(current: 13 tests in ~5 s; SP-1…SP-9 are sub-second each).

---

## 4. UI integration

- **`src/hooks/useSimulation.ts`** owns one `StrouhalEstimator` instance.
  - `push()` on the same 20-step tick that appends to `forceHistory`.
  - `reset()` on **exactly the events that clear `forceHistory`**, plus solver
    rebuild. The estimator must not survive a rebuild — a buffer spanning two
    configurations produces a peak belonging to neither. (`configLocked={running}`
    already prevents config edits mid-run, so this is a rebuild/reset concern,
    not a live-edit one.)
  - Expose `strouhal: StrouhalEstimate`.
  - **Re-estimate at most once per second.** The buffer gains one sample per 20
    steps, so at any realistic in-app rate a faster cadence recomputes an FFT
    over almost identical data. Do not re-estimate per frame.
- **`src/components/ResultsPanel.tsx`** takes a new `strouhal` prop and renders
  the value, or `—` with the status as secondary text when not `ok`.
- **Literature reference — built-in circle only.** Show the reference value
  *only* when the geometry is the built-in circle primitive. For NACA, SVG or
  DXF geometries show the measured St alone. A cylinder reference beside an
  airfoil is a false reference, and AGENTS.md rule 2 makes weakening physical
  honesty a physics change.
- **Reference source — Williamson's laminar correlation**, not a hardcoded
  table:

  ```
  St(Re) = −3.3265/Re + 0.1816 + 1.6·10⁻⁴·Re      valid 49 < Re < 178
  ```

  It returns 0.1643 at Re = 100, consistent with the 0.164 already cited in
  VALIDATION.md. **Outside 49 < Re < 178 show no reference** — below ≈ 47 there
  is no shedding, above ≈ 180 the wake is three-dimensional and a 2D value is
  not comparable (already a documented known limitation). Cite as
  *Williamson (1989)* with the project's standing marker: **verify page/volume
  before external use**.

---

## 5. Parent-spec reconciliation (do this first, docs-only commit)

`phase-1-validation.md` §1.1 and §1.2 are stale against the repo and would
mislead any agent reading them as current: §1.1 lists INV-1…5 (the suite has
INV-6, added in 1.2b rev 3); §1.2 specifies D = 20, Ny = 400, Nx = 720,
"free-slip or bounce-back — document which", and a literature ±6% gate on BM-2.
The repo runs D = 30, 1080×600, free-slip, with BM-2 as a reporting benchmark.

Following the convention the 1.2 chain established (parent spec + one child
spec per sub-phase), **do not fold the closure content into the parent**. Mark
§1.1/§1.2 as superseded with pointers to `phase-1-2b` … `phase-1-2f`, and
reduce §1.3 to an index pointing at this file and at 1.3b. Twenty lines, not a
rewrite.

---

## Authorized changes

1. `docs/specs/phase-1-validation.md` — supersession markers, §1.3 index,
   corrected Definition of Done (§Erratum above).
2. **New** `src/physics/spectral.ts`.
3. `src/hooks/useSimulation.ts` — own the estimator, expose the estimate.
4. `src/components/ResultsPanel.tsx` — display.
5. `tests/spectral/` — SP-1…SP-9; `tests/fixtures/bm3-cl-trace.json`.
6. `tests/benchmarks/helpers.ts` — `writeTrace()`.
7. `tests/benchmarks/bm3-cylinder-re100.test.ts` — fixture emission behind
   `SOPLO_WRITE_FIXTURES=1`. **No change to its windows, gates or assertions.**
8. `package.json` — widen `test:fast`.

## Not authorized

Any change to `src/lbm/` (rule 1). Any change to BM-1/BM-2/BM-3 setups, gates
or measurement windows. Any change to the 20-step sampling cadence or to the
500-point `forceHistory`. Seeding the perturbation RNG (spec 1.3b). CI
workflows, the regression tier and golden values (spec 1.3b).

## Discrepancy protocol

Unchanged from `phase-1-validation.md` §1.2: if an acceptance is missed, do not
tune tolerances and do not touch solver constants. Report the measured value,
the setup, and a hypothesis. In particular, if SP-9 misses 1%, the finding is
**which of the two estimators is wrong** — that is a maintainer decision, and
zero-crossings on a clean limit cycle are the more trustworthy of the two.

## Definition of done (this sub-phase)

`test:fast` green including SP-1…SP-9 and still < 30 s · fixture committed ·
St visible in the Results panel on an in-app cylinder, inside 0.157–0.173 ·
literature reference shown for the circle and suppressed for other geometries ·
parent spec reconciled · measured prominence reported for fixture and app ·
decision-log entries drafted (corrected DoD; spectral module as shared
production path; Williamson correlation as the in-app reference).
