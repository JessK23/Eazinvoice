import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/web",
  testIgnore: /p2-2c-live-workflows\.spec\.js/,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001/health",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
