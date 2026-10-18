import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Smoke tests for the three core flows (find, route, submit). Every /api/**
 * call is mocked with page.route (see e2e/mock-api.ts), so no backend is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Page-level mocks can't see requests made by a service worker.
    serviceWorkers: "block",
    geolocation: { latitude: 1.2993, longitude: 103.8455 },
    permissions: ["geolocation"],
    locale: "en-SG",
    timezoneId: "Asia/Singapore",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { NEXT_PUBLIC_DEV_LOGIN: "false" },
  },
});
