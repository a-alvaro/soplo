# Phase 1 Closure Spec — Repository reconciliation and fast CI

> Status: **complete** · Owner: Alex · Executed by: coding agent.
> Date: 2026-09-20.
> Prereq: Phase 1.1–1.2 validated; Phase 1.3a implemented; parent-spec
> reconciliation committed on `phase-1-3-0-spec-reconciliation`.
> Rules: `AGENTS.md` and the discrepancy protocol apply. This is a closure
> pass: no solver, physics, benchmark, acceptance-window or test changes.

## Rev 1 — Node 20 fast-tier concurrency finding

Closure verification found a runner-level discrepancy after the clean-install
path was already green functionally. On Node 24, `test:fast` passed 29/29 in
25.04 s. On Node 20.20.2, two default-worker runs passed 29/29 but took 30.16 s
and 30.20 s, narrowly missing the existing < 30 s budget. Verbose profiling
identified INV-6 as the critical path (~31 s while competing with all other
files); no assertion, step count or acceptance gate failed.

Registered concurrency discriminator on the same machine and Node version:

| Vitest maximum workers | Duration | Result |
|---|---:|---|
| default | 30.16–30.20 s | over budget |
| 2 | 29.82 s | inside, thin margin |
| **4** | **29.62 s** | best measured |
| 6 | 30.31 s | over budget |

**Decision:** explicitly cap `test:fast` at four workers. This changes only test
scheduling; INV-6 still runs 50,000 steps and every invariant/spectral gate is
unchanged. Rev 1 authorizes that single `package.json` script edit as an
exception to the original closure scope. The < 30 s target is not loosened.

## Goal

Close Phase 0 and Phase 1 without leaving contradictory sources of truth or an
unverified integration path before the Web Worker refactor. The repository must
state what is actually implemented, run its fast safety net automatically, and
make every deliberate deferral explicit rather than presenting it as unfinished
Phase 1 work.

## Closure decisions

1. **Phase 0 is complete.** Repository hygiene, identity files and simulation-
   hook extraction are present. Stale status text in public/project docs is a
   documentation defect and is corrected in this pass.
2. **Phase 1.1, 1.2 and 1.3a are complete.** The invariant/boundary suite,
   canonical benchmark record, spectral estimator, BM-3 fixture and in-app
   Strouhal path are implemented and validated.
3. **Fast CI closes the remaining Phase 1 integration requirement.** Pushes and
   pull requests run `npm run test:fast` and `npm run build` on the oldest
   supported Node line and the current LTS line. A manual dispatch is also
   available.
4. **Official benchmarks do not run automatically.** BM-2/BM-3 take hours and
   no solver or physics code changes in this closure pass. Their validated
   results remain recorded in `VALIDATION.md`; `npm run test:bench` is mandatory
   locally whenever `src/lbm/` or `src/physics/` changes, per `AGENTS.md`.
5. **The former 1.3b remainder is deliberately deferred, not Phase 1 debt.** A
   benchmark guardian, cross-architecture regression goldens and optional
   seeded perturbation become justified with external contributors or the next
   legitimate solver change. They are not required for the Web Worker refactor,
   which must preserve the solver as an unchanged headless module.
6. **The production bundle-size warning is recorded, not hidden.** The current
   build emits a valid application but reports a ~608 kB minified JS chunk. The
   Worker refactor changes chunk topology, so bundle sizing is re-measured in
   that phase before any standalone code-splitting work is considered.

## Authorized changes

1. Add a GitHub Actions workflow for fast tests and production build.
2. Reconcile `README.md`, `PROJECT_CONTEXT.md`, `PLAN_OF_ATTACK.md` and the
   Phase 1 parent spec with the implemented state and the decisions above.
3. Add a CI badge to the README once the workflow path is fixed.
4. Run verification commands and a production-browser smoke check.

## Not authorized

- Any change under `src/`, `tests/`, benchmark fixtures or `package.json`.
- Any change to solver constants, boundary conditions, benchmark setups,
  acceptance windows or sampling cadence.
- Running the multi-hour benchmark tier without a physics change or a failed
  fast/build check that specifically calls its validity into question.
- Starting the Web Worker refactor or interpretation-layer work.

## Acceptance

1. `npm run test:fast` passes all current invariant, boundary and spectral tests
   in under 30 seconds.
2. `npm run build` passes TypeScript compilation and the Vite production build.
3. The production build opens successfully and the application reaches its
   initial interactive state without a fatal browser error.
4. CI runs the same two commands after a clean `npm ci` on Node 20 and Node 24.
5. README, project context, plan and parent spec agree that Phase 1 is closed,
   BM-2 is reported rather than literature-gated, and the Web Worker is next.
6. `git diff --check` passes and the worktree is clean after granular commits.

## Closure verification (2026-09-20)

- Clean install: `npm ci` completed successfully (151 packages).
- Node 24.15.0: `test:fast` passed **29/29** across 20 files in **24.53 s**
  with the Rev 1 worker cap; production build passed.
- Node 20.20.2: `test:fast` passed **29/29** across 20 files in **29.72 s**
  with the Rev 1 worker cap; production build passed.
- Production output: 703 modules transformed; main JS chunk 608.31 kB
  minified / 187.86 kB gzip. The recorded size warning remains non-blocking and
  is re-measured after Worker extraction.
- Browser smoke against `vite preview`: initial interactive state loaded;
  simulation advanced to step 3,570 with finite Cd/Cl and oscillating status;
  pause succeeded; reset returned the solver to step 0.
- Official benchmarks were not re-run: this pass changed no solver, physics,
  benchmark, fixture or acceptance code. Their current evidence remains the
  validated record in `VALIDATION.md`.

All acceptance criteria are satisfied. Phase 0 and Phase 1 are closed; the Web
Worker refactor is the next implementation phase.

## Discrepancy protocol

Any failure is documented with the exact command, output and hypothesis before
further changes. Do not modify tests, solver values or acceptance windows to
make closure pass. A production-only browser failure or a fast-suite regression
blocks Phase 1 closure; the bundle-size warning does not.
