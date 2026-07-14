import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Load src/ through native Node ESM (type stripping) instead of the
    // vite module-runner transform: the SSR import rewrite turns the
    // solver's hot-loop constant lookups (ex/ey/w/opp) into namespace
    // property accesses and costs ~4-5× throughput — prohibitive for the
    // benchmark tier.
    server: {
      deps: {
        external: [/\/src\//],
      },
    },
    // The tsx loader that resolves src/'s extensionless TS imports for
    // native Node ESM is injected via NODE_OPTIONS in the npm test scripts
    // (Vitest 4 removed per-pool execArgv).
    // Invariant tests iterate the solver for thousands of steps; give each
    // test headroom beyond the 5 s default. The fast tier as a whole still
    // targets < 30 s (see docs/specs/phase-1-validation.md §1.1).
    testTimeout: 60_000,
  },
});
