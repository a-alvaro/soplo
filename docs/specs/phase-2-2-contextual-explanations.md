# Phase 2.2 Spec — Contextual flow explanations

> Status: **draft for maintainer review** · Owner: Alex · Execution: coding
> agent, one implementation session after approval.
> Prereq: Phase 2.0 Web Worker and Phase 2.1 public preview complete on `main`.
> Rules: `AGENTS.md` applies. This spec authorizes only the deterministic
> interpretation layer and its Results-panel integration. It does not authorize
> solver, physics, benchmark, canvas-annotation or glossary changes.

## 1. Goal

Add the first useful answer to “What am I seeing?” without pretending that
SOPLO measures more than it does. The Results panel will turn the run's existing
numerical-safety, force-convergence, Strouhal, Reynolds-number and blockage
signals into a short plain-language explanation.

This phase is deliberately conservative:

- it explains evidence already produced by validated code;
- it distinguishes a numerical observation from a physical interpretation;
- it names a von Kármán vortex street only when the geometry and spectral
  evidence support that statement;
- it never infers a separation point, stagnation point, boundary-layer state,
  stall or wake shape from force history alone;
- it makes uncertainty and model limits visible before positive conclusions.

The result is a deterministic structured interpretation seam that future
canvas annotations, glossary entries and an optional AI interpreter can consume
without re-deriving physical claims inside React components.

## 2. Source basis and discrepancy record

The implementation may rely only on committed, reviewable project sources:

- `AGENTS.md` for physical invariants and honesty rules;
- `VALIDATION.md` for benchmark evidence, the cylinder shedding onset near
  `Re ≈ 47`, the two-dimensional limitation around `Re ≳ 190`, and confinement
  caveats;
- `docs/specs/phase-1-3a-strouhal-fft.md` and `src/physics/spectral.ts` for the
  spectral status contract and Williamson validity window;
- the current `SafetyState`, force samples and immutable built-run metadata.

`PLAN_OF_ATTACK.md` says the educational physics copy already exists in a
Spanish fundamentals PDF under `docs/`, especially its §8. No PDF is present in
the repository as of 2026-09-22. This is a source discrepancy, not permission to
reconstruct or invent that document. It does not block this narrow phase because
the claims below are already supported by versioned validation material. It
does block richer explanations of separation, stagnation regions and attached
boundary layers until the source is restored or replaced by a reviewed source.

All literature markers in the existing docs retain their “verify page/volume
before external use” status. This phase does not strengthen those citations or
publish new literature claims.

### 2.1 Adjacent discrepancies not included in this phase

- `PROJECT_CONTEXT.md` and `README.md` describe smoke-line streamlines as an
  active feature, but `StreamlineRenderer` is not mounted by the application.
- Several existing educational InfoTips are in Spanish despite the repository's
  English-only rule.
- The Results panel says “last N steps” for a window that actually contains N
  force samples taken every 20 solver steps.

These findings must be resolved by an explicitly scoped follow-up. They are not
silently folded into contextual explanations.

### 2.2 Implementation finding — Cd settling and periodic Cl are compatible

The 2026-09-25 production smoke exposed an incorrect assumption in the first
draft. An in-app cylinder at Re = 100, D = 10 and β = 10% reached:

- the Cd classifier's `converging` state;
- St = 0.1806 from 19.5 resolved Cl periods;
- spectral prominence 195×.

These signals do not conflict. The convergence heuristic classifies **Cd**,
while the spectral estimator detects periodicity from **Cl**. A settled mean
drag and a periodic lift signal are compatible with established vortex
shedding. Therefore a valid St result owns the periodicity conclusion after the
safety, data-sufficiency and unstable-signal guards. The low-Re cylinder check
remains a real conflict because a resolved periodic signal below the documented
shedding onset contradicts the applicable physical regime.

No threshold, spectral rule or physics implementation changes because of this
finding. Only evidence precedence and UI wording change.

## 3. Scope

### 3.1 Included

1. Extract the force-history classifier from `ResultsPanel.tsx` into a pure,
   headless-testable interpretation module while preserving its numeric
   thresholds and classifications.
2. Add a pure function that combines built-run metadata, numerical safety,
   convergence and Strouhal evidence into structured explanatory content.
3. Render one `// WHAT YOU ARE SEEING` section in the Results panel.
4. Replace two existing overclaims in that panel:
   - `OSCILLATING — periodic vortex shedding` becomes a neutral force-signal
     status unless the spectral and geometry rules below prove more;
   - `no dominant frequency — flow is not shedding periodically` becomes a
     statement about the analysed record, not the entire physical flow.
5. Add focused unit tests for rule precedence, geometry-specific wording and
   uncertainty handling.
6. Update `PROJECT_CONTEXT.md` and `PLAN_OF_ATTACK.md` only after implementation
   evidence exists.

### 3.2 Excluded

- Changes to `src/lbm/`, `src/physics/`, solver constants, boundary conditions,
  benchmark setups, fixtures or acceptance windows.
- New physical detectors or thresholds derived from velocity/vorticity fields.
- Canvas labels for stagnation, wake or separation regions.
- The glossary and expansion of existing InfoTips.
- Claims about airfoil separation, stall, transition or attached flow.
- New external dependencies, network calls, LLM calls or telemetry.
- Changes to the Safety indicator's existing limits or severity calculation.
- WebGPU work or simulation-performance work.

## 4. Existing evidence contract

The interpretation consumes an immutable summary of the **built run**, never
the editable live controls:

```ts
export type ConvergenceStatus =
  | 'insufficient'
  | 'converging'
  | 'oscillating'
  | 'unstable';

export type NumericalSafety = 'ok' | 'warn' | 'error';

export interface InterpretationInput {
  geometryType: GeometryType | null;
  re: number;
  numericalSafety: NumericalSafety;
  convergence: ConvergenceStatus;
  strouhal: StrouhalEstimate;
  blockageRatio: number | null;
}
```

The implementation may use equivalent names, but not additional inferred
inputs. In particular, viewport colours, instantaneous field extrema and the
selected render field are not evidence of a physical regime.

### 4.1 Convergence is a UI heuristic

The current classifier uses the latest 100 force samples after at least 50 are
available. Its coefficient-of-variation and mean-crossing thresholds remain
unchanged in this phase. They classify the recent **force signal**, not the full
flow field:

- `converging` means the recent Cd signal is nearly constant;
- `oscillating` means appreciable repeated or moderate Cd variation;
- `unstable` means the force signal is non-finite, physically absurd or not
  usefully settled by the current heuristic;
- `insufficient` means fewer than 50 samples exist.

No label produced from this classifier alone may say “periodic”, “vortex
shedding”, “von Kármán”, “turbulent” or “chaotic”.

### 4.2 Strouhal is the periodicity evidence

`StrouhalEstimate.status === 'ok'` is the only existing positive evidence for a
resolved dominant periodic lift signal. Other statuses mean:

- `filling`: the record does not yet contain enough resolved periods;
- `no-peak`: no sufficiently prominent in-band peak was found in this record;
- `band-edge`: the candidate peak is unresolved at the low-frequency edge.

`no-peak` must not be rewritten as proof that periodic shedding is physically
impossible. The estimator has finite record length, a defined frequency band and
a prominence threshold.

### 4.3 Numerical safety outranks interpretation

The current `SafetyState.overall` is authoritative:

- `error` suppresses all positive regime conclusions and says the setup is
  outside SOPLO's reliable numerical range;
- `warn` permits an observation but attaches a numerical-caution statement;
- `ok` permits the normal evidence rules below.

This layer does not calculate a second Reynolds, τ or Mach limit and must not
copy the safety logic.

## 5. Structured output

The pure interpreter returns content, not JSX:

```ts
export type InterpretationConfidence =
  | 'not-applicable'
  | 'collecting'
  | 'supported'
  | 'caution'
  | 'unreliable';

export interface FlowInterpretation {
  confidence: InterpretationConfidence;
  title: string;
  summary: string;
  evidence: string[];
  caveats: string[];
}
```

Strings are English, concise and complete without a tooltip. They use `Re`,
`Cd`, `Cl` and `St` only after spelling out the relevant concept in the same
section. Exact prose may be polished during implementation, but it must preserve
the claims and exclusions in this spec.

The output remains serializable and independent of React, DOM and browser APIs.
It does not include colours, CSS classes or component names.

## 6. Decision order

Rules are evaluated in this order so a weaker positive signal cannot overwrite
a stronger warning.

### 6.1 Invalid or unavailable evidence

1. **Numerical safety `error`:** return `unreliable`. State that the setup is
   outside SOPLO's reliable numerical range and that flow-pattern conclusions
   should not be trusted. Do not name a physical regime even if an old spectral
   result says `ok`.
2. **No built geometry:** return `collecting`; there is no immutable run to
   interpret yet.
3. **Geometry `none`:** return `not-applicable` and explain that no aerodynamic
   body or body wake exists in this run.
4. **Convergence `insufficient`:** return `collecting`. Explain that the force
   record is still too short and that the user should let the run continue.
5. **Convergence `unstable`:** return `caution`. Say the force signal is not
   settled enough for a physical interpretation. Do not call it turbulence or
   chaotic flow.

### 6.2 Positive and unresolved observations

After the guards above:

| Evidence | Allowed interpretation |
|---|---|
| `converging`, any body | The recent aerodynamic-force signal is settling toward a steady value. |
| `oscillating` + St `filling` | The force signal varies, but more history is needed to determine whether the variation has a stable period. |
| `oscillating` + St `no-peak` | The recent force signal varies, but this record contains no resolved dominant periodic lift frequency. |
| `oscillating` + St `band-edge` | A slow variation may be present, but its period is not resolved; run longer. |
| (`converging` or `oscillating`) + St `ok`, non-cylinder | A dominant periodic lift signal is resolved. Do not assign a cylinder-specific wake name. |
| (`converging` or `oscillating`) + St `ok`, cylinder, `49 < Re < 178` | A periodic wake consistent with a laminar von Kármán vortex street is resolved; explain that alternating vortices drive oscillating lift and that `St` is its dimensionless frequency. |

An `ok` spectral estimate paired with `converging` is **not** conflicting
evidence: Cd can settle while Cl remains periodic. The output uses the resolved
Cl spectrum for periodicity and retains the Cd status as a separate observation.

### 6.3 Cylinder-specific context

Only the built-in `cylinder` receives cylinder-specific regime wording:

- At `Re ≤ 47`, a converging force signal may be described as consistent with
  the documented steady-cylinder regime. If St is `ok`, report conflicting
  evidence instead of overriding either signal.
- At `49 < Re < 178`, the existing Williamson reference may accompany a
  spectrally resolved periodic wake. The interpreter reuses the already
  computed St value and does not duplicate the correlation.
- At `Re ≥ 190`, always add that real cylinder wakes become three-dimensional
  and SOPLO's two-dimensional result is qualitative. This caveat applies even
  when the numerical safety indicator is green.
- From `178 ≤ Re < 190`, do not show the Williamson comparison and do not claim
  that the lack of a reference makes the run invalid.
- The interval `47 < Re ≤ 49` is treated conservatively as a near-onset region:
  describe only the measured force/spectral evidence, not a named regime.

Square, NACA, SVG and DXF bodies receive generic force/spectral explanations.
The current repository has no validated geometry-specific transition map for
them. A cylinder threshold or Williamson value must never leak into their copy.

### 6.4 Confinement

The existing blockage calculation and caption remain authoritative. When
`blockageRatio > 0.05`, add a caveat that walls can shift measured force and
frequency relative to unconfined references. Do not quantify the shift or say
that every difference is caused by blockage.

The existing cylinder-specific Williamson caption may retain its more precise,
already documented explanation. This phase must not weaken or hide it.

## 7. UI integration

Add `// WHAT YOU ARE SEEING` in `ResultsPanel` after the current Status block
and before the disclaimer. It contains:

1. one short title;
2. a two-sentence maximum summary;
3. compact evidence and caveat lines when present.

The section is visible whenever a body run has force history. During collection
it explains what is missing rather than disappearing. It updates from the same
built-run metadata and history as the existing metrics, so edits to unlocked
controls cannot relabel an old result.

Visual treatment reuses current panel typography and severity colours. It must
not rely on colour alone: confidence is also communicated in text. No modal,
animation, accordion or new panel is added.

The existing Status block becomes evidence-focused and names the signal it
actually classifies:

- `INSUFFICIENT DATA`
- `● DRAG SIGNAL SETTLING`
- `● DRAG SIGNAL OSCILLATING`
- `⚠ DRAG SIGNAL UNSETTLED`

The explanatory section, not that badge, owns the physical interpretation.

## 8. File-level implementation plan

Equivalent names are acceptable if the dependency direction remains clear:

- `src/interpretation/flowInterpretation.ts` — pure input/output contracts,
  preserved convergence classifier and ordered interpretation rules.
- `src/components/ResultsPanel.tsx` — consumes the pure result and renders the
  new section; keeps charts and numeric readouts.
- `src/index.css` — minimal styles for the explanation, evidence and caveats.
- `tests/interpretation/flow-interpretation.test.ts` — pure decision-matrix
  coverage.
- `package.json` — include `tests/interpretation` in `test:fast`.

Do not move interpretation into `src/physics/`: it is product narration over
physics outputs, not solver physics. The module may import types from
`src/types/` and `src/physics/spectral.ts`; protected modules must not import it.

## 9. Acceptance gates

### IX-1 — Safety precedence

Given numerical safety `error`, every geometry, convergence and St combination
returns `unreliable`, contains no named regime and tells the user not to trust
the physical interpretation. Numerical safety `warn` preserves the measured
observation but returns at least `caution` and includes the numerical warning.

### IX-2 — Collection and instability honesty

`insufficient`, `filling`, `band-edge` and `unstable` cases describe the missing
or unresolved evidence. None is labelled as vortex shedding, turbulence or
chaos.

### IX-3 — Cylinder vortex-street gate

“Von Kármán” appears only for a built-in cylinder with `49 < Re < 178`, settled
convergence (`converging` or `oscillating`), `strouhal.status === 'ok'` and
numerical safety other than `error`.

### IX-4 — Geometry isolation

The same periodic inputs for square, NACA, SVG and DXF produce generic
“dominant periodic lift signal” wording and no cylinder correlation, onset or
von Kármán claim.

### IX-5 — Cylinder validity context

Tests pin the `Re ≤ 47` steady-regime wording, the conservative `47 < Re ≤ 49`
gap, Williamson suppression from `Re ≥ 178`, and the two-dimensional caveat
from `Re ≥ 190`.

### IX-6 — Cross-signal coherence

`converging` Cd plus St `ok` follows the periodic interpretation because the St
evidence comes from Cl. A low-Re cylinder plus St `ok` still returns `caution`
and explicitly says the indicators disagree.

### IX-7 — Confinement honesty

`β > 5%` adds a confinement caveat; `β ≤ 5%` and unknown β do not. Existing
Williamson/blockage copy remains visible where currently applicable.

### IX-8 — Regression and build

`npm run test:fast` includes the new interpretation tests and remains under the
existing Node 20 budget. `npm run build` passes. No benchmark rerun is required
because `src/lbm/`, `src/physics/`, benchmark code and physical gates are
unchanged.

### IX-9 — Browser smoke

On the deployed-preview path, verify at least:

1. a newly started cylinder says it is collecting evidence;
2. a numerically safe periodic cylinder eventually receives the gated periodic
   explanation;
3. a non-cylinder with equivalent synthetic test inputs never receives
   cylinder-specific wording;
4. pause, reset and rebuild do not leave an explanation from the previous run;
5. the panel remains readable at its current desktop width and no console error
   appears.

The browser smoke is evidence of wiring and lifecycle only. It is not a new
physics benchmark.

## 10. Documentation closure

After all gates pass:

- mark this spec complete with date, branch, commit and measured test/build
  results;
- update `PLAN_OF_ATTACK.md` so contextual explanations are complete while
  canvas annotations and glossary remain next;
- update the Phase 2 status and decision log in `PROJECT_CONTEXT.md`;
- record any unexpected physical or UI discrepancy instead of silently
  broadening this phase.

## 11. Definition of done

IX-1 through IX-9 pass · no solver/physics/benchmark values changed · the
Results panel separates observation, interpretation and caveat · named physical
regimes appear only under their specified evidence gates · unsupported geometry
claims are absent · source discrepancy remains explicit · docs reflect measured
implementation evidence · repository is clean and publishable.
