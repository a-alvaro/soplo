# Phase 2.0 Spec — Web Worker simulation runtime

> Status: **ready for implementation** · Owner: Alex · Execution: coding agent,
> one implementation session.
> Prereq: Phase 0 and Phase 1 closed on `main` by
> [`phase-1-closure.md`](./phase-1-closure.md); remote fast CI green on Node 20
> and Node 24.
> Rules: `AGENTS.md` applies. This spec authorizes the Worker refactor described
> below and nothing from the interpretation layer. The validated solver and its
> physical behaviour remain unchanged.

## 1. Goal

Move simulation stepping and simulation-side analysis off the browser main
thread before adding reactive interpretation UI. React keeps configuration,
controls and Canvas2D rendering; one dedicated Web Worker owns each live
`LBMSolver` instance.

This is an execution-boundary refactor, not a physics change. For an identical
configuration and perturbation sequence, the Worker path must produce the same
solver state, force samples and Strouhal inputs as the current main-thread path.

## 2. Current contract that must be preserved

The current `useSimulation` contract defines the behaviour to retain:

- `Run` validates the live configuration, builds a fresh solver, clears force
  and spectral history, and starts from step 0. It does not resume a paused run.
- `Pause` stops advancement without rebuilding the solver.
- `Reset` rebuilds the current configuration at step 0 and leaves it paused.
- The first 200 steps receive the existing transverse perturbation before each
  `iterate()` call.
- Aerodynamic forces are sampled every 20 completed solver steps. The chart
  keeps the latest 500 samples.
- Strouhal receives **Cl**, never Cd, at the same 20-step cadence, retains its
  existing 4,096-sample capacity and validity guards, and is re-estimated no
  more often than once per wall-clock second.
- The displayed velocity maximum excludes `solid=1` domain walls exactly as it
  does today.
- Foreground execution keeps the current nominal pace: five steps per display
  interval, approximately 300 solver steps/s at 60 Hz. A hidden tab does not
  continue consuming a CPU core.
- The app-side solver remains `sideWalls: 'no-slip'`; benchmark-only free-slip
  configuration and every validated benchmark setup remain untouched.

No implementation may change solver constants, boundary conditions, force
timing, storage precision, physical-unit conversion, benchmark setups,
sampling cadence or acceptance windows.

## 3. Ownership boundary

### 3.1 Worker-owned state

The Worker owns:

- the sole live `LBMSolver` instance;
- solver construction from an immutable run configuration and copied masks;
- the stepping loop and first-200-step perturbation;
- exact 20-step force sampling;
- the `StrouhalEstimator` and its reset/estimate lifecycle;
- pending force samples not yet delivered to the UI;
- the current run generation and running/paused state.

`src/lbm/`, `src/physics/` and `src/geometry/` stay browser-independent. The
Worker imports them; they must not import Worker or DOM APIs in return.

### 3.2 Main-thread state

React owns:

- editable `SimConfig` and imported geometry/tunnel masks;
- validation messages and the physical-unit preview;
- Worker creation, termination and command dispatch through a small client;
- the latest render snapshot and static run metadata;
- the 500-point UI force history assembled from Worker samples;
- controls, panels, Canvas2D drawing and resize redraws.

Neither `App.tsx`, `useSimulation` nor a renderer may retain or import a live
`LBMSolver` value. `Canvas2D` is refactored to consume an explicit field view:
`Nx`, `Ny`, `ux`, `uy` and `solid`.

### 3.3 Pure engine seam

Put solver ownership behind a synchronous, DOM-free `SimulationEngine` used by
the Worker adapter. The engine builds, advances a fixed batch, pauses/resets,
collects force/spectral data and creates snapshots. Timer scheduling and
`postMessage` belong only to the thin Worker entry point.

This seam is mandatory: Vitest's Node environment can prove numerical parity
and lifecycle semantics without emulating a browser Worker.

## 4. Typed message protocol

Define the protocol in a pure module that contains no browser globals. Every
command and event carries a monotonically increasing `generation`; events from
an older generation are ignored by the client.

### 4.1 Main → Worker

| Message | Required payload | Semantics |
|---|---|---|
| `run` | generation, config, object mask, tunnel mask | Build a fresh solver, publish step-0 state, then start. |
| `pause` | generation | Stop after the current five-step batch and publish a final state. Idempotent. |
| `reset` | generation, config, object mask, tunnel mask | Build and publish step 0, clear analysis, remain paused. |
| `suspend` | generation | Visibility-only stop after the current batch; preserve the solver and the user's running intent. Idempotent. |
| `resume` | generation | Continue the same visibility-suspended generation without rebuilding or clearing analysis. Ignored unless suspended. |
| `request-frame` | generation, request id | Publish the newest fields if this generation is active. At most one request may be outstanding. |

`SimConfig` is structured-cloneable. Masks sent to the Worker must be copies;
transferring them must never detach the arrays held in React state. Missing or
wrong-sized masks retain the current validation/build behaviour rather than
being silently resized.

### 4.2 Worker → main

| Message | Required payload | Semantics |
|---|---|---|
| `ready` | generation, immutable run metadata, `solid`, step-0 fields | Atomically establishes the new rendered run. |
| `frame` | generation, request id, step, `ux`, `uy`, `umax`, pending force samples, Strouhal result, running | Replaces the latest dynamic view. |
| `paused` | generation, final frame payload | Confirms that no later step will be produced for that generation until another `run`. |
| `suspended` | generation, final frame payload | Confirms visibility suspension and the last coherent state; unlike `paused`, it may accept `resume`. |
| `error` | generation, phase, message | Stops the run and exposes an actionable UI error without crashing React. |

Run metadata contains `Nx`, `Ny`, `charCells`, `LBMParams` and the immutable
configuration that produced the fields. It replaces today's `Built.solver`
shape while preserving every non-solver consumer in `App.tsx` and
`ResultsPanel`.

`ux`, `uy` and `solid` snapshots remain `Float64Array`, `Float64Array` and
`Uint8Array`. The Worker copies live solver fields into snapshot arrays and
transfers only the copies. The live solver buffers must never be transferred
or detached. `solid` is transferred once in `ready`; dynamic frames transfer
only `ux` and `uy`.

## 5. Scheduling and backpressure

- The Worker advances exactly five steps per batch, preserving the current
  batch granularity. The nominal interval is `1000 / 60` ms, preserving the
  current approximately 300 solver steps/s at 60 Hz. It schedules at most one
  yielding Worker timer and must not spin in a blocking `while` loop.
- Timer drift is corrected only forward. After a delayed callback, suspension
  or machine sleep, schedule the next batch from the current time; never execute
  accumulated catch-up batches. A stalled tab must not produce a CPU spike when
  it becomes responsive again.
- Force sampling is checked after each completed `iterate()` whose resulting
  step is divisible by 20. Correctness therefore does not depend on five
  continuing to divide the force cadence.
- The main thread requests field snapshots from `requestAnimationFrame`, capped
  at **30 field frames/s**, and sends no second request while one is pending.
  This is backpressure: a slow or backgrounded tab cannot build an unbounded
  message queue.
- A frame request is handled between Worker batches, giving a coherent point-in-
  time copy of both velocity components and its matching step number.
- Pending force samples are drained into the next frame and capped to the most
  recent 500. The Worker keeps the independent spectral ring buffer, so UI
  throttling cannot alter Strouhal.
- `Pause` forces one final payload even if no animation-frame request is
  pending. The visible step, force chart and Strouhal therefore describe the
  actual paused state.
- `document.visibilitychange` is part of the client contract. When the document
  becomes hidden during a run, cancel snapshot requests and send `suspend`.
  When it becomes visible, send `resume` only if that same generation was
  running before suspension and the user has not paused or reset it. Resumption
  starts with a fresh timer deadline and no catch-up work.
- `fps` remains a UI metric and becomes received field frames per second. Do not
  relabel it as solver throughput. Solver steps remain visible in the existing
  counter.

The 30 fps cap bounds copy traffic while preserving interactive rendering. Do
not add `SharedArrayBuffer`, cross-origin isolation, `OffscreenCanvas` or field
down-casting in this phase; each changes deployment or rendering semantics and
needs separate evidence. An uncapped or user-selectable fast mode is also a
separate product feature, not part of this refactor.

## 6. Lifecycle and failure rules

Create the Worker with Vite's module-worker form:

```ts
new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
  type: 'module',
})
```

The React hook creates one client in an effect and terminates it in that
effect's cleanup. Cleanup cancels the snapshot rAF, removes listeners, rejects
or clears pending requests, removes its `visibilitychange` listener, and calls
`terminate()` exactly once. This must be safe under React 19 StrictMode's mount
→ cleanup → remount development cycle.

Additional lifecycle requirements:

1. Each `run` or `reset` increments the generation before posting its command.
2. Stale `ready`, `frame`, `paused`, `suspended` and `error` events cannot mutate
   React state or acknowledge a current frame request.
3. Repeated `pause`, `suspend`, `resume` and cleanup calls are no-ops when their
   state transition is not applicable.
4. A Worker error sets `running=false`, clears the pending-frame flag and shows
   the message through the existing control-area error path. It does not retry
   automatically or fall back silently to main-thread solving.
5. User `pause` or `reset` while a visibility suspension is pending cancels the
   stored resume intent; returning to the tab must not restart the simulation.
6. Unmount leaves no timer, rAF, visibility listener, message listener or
   Worker alive.

## 7. File-level implementation plan

The implementation may choose equivalent names, but must keep these boundaries:

- `src/simulation/buildSimulation.ts` — move `resolveDomainSize`, `computeLBM`,
  validation and solver construction into pure reusable functions. This move
  must preserve their behaviour byte-for-byte where practical.
- `src/workers/simulationProtocol.ts` — clone-safe command/event types and
  render-snapshot types; no browser APIs.
- `src/workers/SimulationEngine.ts` — pure solver owner and deterministic batch
  API; no timers, React or DOM.
- `src/workers/simulation.worker.ts` — Worker timer and protocol adapter only.
- `src/workers/SimulationWorkerClient.ts` — injectable `Worker` wrapper,
  generation filtering, one-request backpressure and termination.
- `src/hooks/useSimulation.ts` — React lifecycle/state adapter; no solver
  stepping and no `LBMSolver` import.
- `src/rendering/Canvas2D.tsx` — render explicit arrays rather than a solver.
- `src/App.tsx` — consume immutable run metadata plus the latest field view.

Do not opportunistically refactor panels, styling, colormaps, geometry import,
the solver core or the spectral algorithm.

## 8. Required verification

Add a fast `tests/worker` tier and include it in `npm run test:fast`. Tests must
stay headless and sub-second as a group where practical; do not introduce a DOM
test framework solely for this phase.

| ID | Test | Gate |
|---|---|---|
| WK-1 | Build parity | Domain, LBM metadata, wall/object solid encoding and step-0 fields match the extracted legacy builder for cylinder, NACA and imported-mask cases. |
| WK-2 | Numerical parity | With `Math.random` fixed to 0.5, direct legacy stepping and `SimulationEngine` match after 40 steps (`step`, `rho`, `ux`, `uy`, `f`, forces) at existing double-precision tolerances. |
| WK-3 | Sampling contract | Force samples occur at 20, 40, 60… only; chart delivery caps at 500; spectral input uses Cl and survives slower frame requests. |
| WK-4 | Snapshot isolation | Transferring/copying a render snapshot cannot detach or alias live solver arrays; the engine advances correctly afterwards. |
| WK-5 | Lifecycle | Run starts fresh, pause stops after its current batch, reset returns step 0 paused, and each rebuild clears force and spectral state. Visibility suspend/resume preserves the same generation and analysis. |
| WK-6 | Stale-event guard | A fake Worker proves old-generation ready/frame/paused/suspended/error events cannot mutate current client state or release its pending request. |
| WK-7 | StrictMode cleanup | A fake Worker proves create/cleanup/remount leaves one live worker and each instance is terminated at most once. |
| WK-8 | Failure path | Invalid mask/build and runtime failures emit typed errors, stop running and never invoke main-thread fallback. |
| WK-9 | Pacing and background safety | A fake clock proves five steps per `1000/60` ms, at most one scheduled timer, zero advancement while suspended, no catch-up burst after delay/resume, and no resume after user pause/reset. |

Verification order:

1. `npm run test:fast` — all existing 29 tests plus WK-1…WK-9 green.
2. `npm run build` — typecheck/build green and a distinct Worker asset emitted.
3. Repeat both commands under Node 20 and Node 24, matching CI.
4. `git diff --check`.
5. Production-browser smoke: run a cylinder, reach at least 10,000 steps, open
   and close Results while running, change the field view, pause, verify finite
   Cd/Cl and a coherent final step, reset to step 0, and run again. While
   running, background the tab until `suspended` is acknowledged: the step must
   advance by no more than the current five-step batch; returning resumes the
   same generation without a burst. Then navigate or reload without an orphan
   Worker or console error.
6. Development StrictMode smoke: one active simulation, no doubled step rate,
   duplicate force samples or messages after cleanup.

The fast-suite gate remains **under 30 seconds on Node 20** as recorded by the
Phase 1 closure. Measure rather than assume. If the added tests push the suite
over the gate, stop and report the exact timing; do not weaken the gate, remove
coverage or alter solver work to manufacture a pass.

Official BM-1/BM-2/BM-3 reruns are not required because this spec forbids
solver/physics changes. Any unavoidable edit under `src/lbm/` or `src/physics/`
invalidates that exemption and triggers the full benchmark ritual in
`AGENTS.md`.

## 9. Definition of Done

The phase is complete only when all of the following hold:

1. No solver iteration, force computation, spectral transform or full-field
   maximum scan runs on the browser main thread.
2. React/rendering receives only immutable metadata and transferred field
   snapshots; no live `LBMSolver` crosses the boundary.
3. WK-1…WK-9, all prior fast tests and the production build pass on Node 20 and
   Node 24; the Node 20 fast tier remains under 30 seconds.
4. Production and StrictMode smokes satisfy §8 with no stale messages, doubled
   simulation, hidden-tab advancement, resume catch-up or orphan Worker.
5. The build output records main and Worker chunk sizes. The existing ~608 kB
   warning is re-evaluated, not hidden; a remaining warning is documented and
   deferred rather than mixed into this refactor.
6. `PROJECT_CONTEXT.md`, `PLAN_OF_ATTACK.md` and README are updated only after
   implementation evidence exists, and the repo is clean and publishable.

## 10. Explicitly out of scope

- Solver, boundary-condition, benchmark or physical-unit changes.
- Interpretation copy, annotations, glossary or guided experiments.
- OffscreenCanvas, SharedArrayBuffer, WebGPU or rendering in the Worker.
- Changing field precision, force cadence, spectral constants or perturbation.
- Resuming a paused run from the `Run` button; this phase preserves the current
  fresh-run behaviour.
- Maximum-speed execution or user-selectable simulation speed controls.
- General bundle splitting beyond measuring the post-Worker output.

## 11. Recorded discrepancy outside this phase

`PROJECT_CONTEXT.md` and README claim that smoke-line streamlines are an active
feature, and `src/rendering/StreamlineRenderer.ts` plus related CSS exist, but
no application component imports or mounts that renderer. This predates the
Worker work and is unrelated to moving the solver execution boundary. Do not
silently wire it in or delete it during this phase; reconcile the product claim
and intended UI in a separately scoped rendering task.

## 12. Discrepancy protocol

If implementation reveals any other conflict between this spec, current app
behaviour and the validated sources of truth:

1. stop the conflicting change;
2. record the command or code path, observed behaviour and likely cause;
3. report whether it blocks the Worker boundary;
4. do not fix an out-of-scope contradiction without a spec amendment.
