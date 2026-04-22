import { defineConfig, devices } from "@playwright/test";

/**
 * ArchLens E2E Test Configuration
 *
 * Assumes:
 * - API server running on localhost:4848 (archlens-studio serve)
 * - Web dev server running on localhost:4849 (pnpm --filter @archlens/web dev)
 * - At least one project registered
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // UI state is shared, don't parallelize
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:4849",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
