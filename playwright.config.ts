import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end acceptance suite for the eno2 wallet + chat experience.
 *
 * The suite intentionally runs against the already-running dev server on
 * 127.0.0.1:5180 (live Gemini/Nessie) so it can be run repeatedly while the
 * UI is being iterated on. One worker: chat sessions and the shared server are
 * stateful, and live model calls are slow.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }]
  ],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5184',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ]
});
