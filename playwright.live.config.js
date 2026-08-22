import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web",
  testMatch: /p2-2c-live-workflows\.spec\.js/,
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    {
      name: "chromium-live-mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
      grep: /mobile/,
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://localhost:3101/health",
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: "3101",
      EAZINVOICE_E2E_AUTH_SECRET: "p2-2c-local-playwright-secret",
    },
  },
});
