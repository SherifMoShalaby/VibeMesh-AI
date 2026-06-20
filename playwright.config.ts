import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end browser tests (chromium). These drive the REAL app — the openscad-wasm render
 * pipeline, the viewport, params, export, and the home composer — using the built-in examples
 * so no AI engine / API key is required. Complements the zero-API Vitest unit net.
 *
 *   npm run test:e2e            headless run
 *   npm run test:e2e -- --ui    interactive
 *
 * Reuses an already-running dev server locally; starts its own in CI.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000, // WASM compile of a model can take a few seconds on a cold cache
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
