import { defineConfig } from 'vitest/config'

// Zero-API client-seam unit net (board pick #2). These cover the deterministic,
// high-churn pure functions the bench never imports — refineProxy math, the
// params/intent parsers, toApiMessages normalization, and STL bbox/transform +
// its loud malformed-buffer throw. No DOM, no WASM, no network → `node` env, fast,
// runnable as a zero-API ratchet (npm run test:run) and in CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'threads',
  },
})
