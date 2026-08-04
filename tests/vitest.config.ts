import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suites share one Postgres and migrate it up/down;
    // files must not race each other.
    fileParallelism: false,
  },
});
