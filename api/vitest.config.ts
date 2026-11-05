import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    // All test files share one fixture database, so they run one at a time.
    fileParallelism: false,
  },
})
