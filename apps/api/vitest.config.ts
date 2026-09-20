import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The suite truncates shared tables in beforeEach, so parallel files would race on them.
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Each test hits a real (remote) Postgres database now instead of local SQLite.
    testTimeout: 20_000,
  },
});
