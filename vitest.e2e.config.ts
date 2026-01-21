/**
 * Vitest configuration for E2E tests.
 *
 * E2E tests spawn the actual CLI binary as a subprocess,
 * so they need longer timeouts and different settings.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.e2e.test.ts'],
    // Keep the smoke test separate (it's more of an integration test)
    exclude: ['test/e2e/smoke.test.ts'],
    // Use forks for process isolation (important for chdir operations)
    pool: 'forks',
    // E2E tests need longer timeouts since they spawn subprocesses
    testTimeout: 60000,
    hookTimeout: 30000,
    // Global setup file
    setupFiles: ['test/e2e/setup.ts'],
    // Default reporter
    reporters: ['default'],
    // Predictable test ordering
    sequence: {
      shuffle: false,
    },
    // Retry flaky tests once in CI
    retry: process.env.CI ? 1 : 0,
    // Allow only one test at a time for E2E (to avoid port conflicts, etc.)
    maxConcurrency: 1,
    // Single worker for E2E tests (Vitest 4 uses fileParallelism)
    fileParallelism: false,
  },
});
