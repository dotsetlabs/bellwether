import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Exclude e2e tests - they are run separately with `npm run test:e2e`
    // E2E tests take too long for CI, run locally only
    exclude: ['test/e2e/**/*.test.ts', 'node_modules/**'],
    pool: 'forks', // Use forks instead of threads to support process.chdir()
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/cli/index.ts'],
    },
    testTimeout: 10000,
  },
});
