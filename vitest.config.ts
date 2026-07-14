import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Invariant tests iterate the solver for thousands of steps; give each
    // test headroom beyond the 5 s default. The fast tier as a whole still
    // targets < 30 s (see docs/specs/phase-1-validation.md §1.1).
    testTimeout: 60_000,
  },
});
