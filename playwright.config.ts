import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a run sit beside a server already holding 3100.
const PORT = Number(process.env.E2E_PORT ?? 3100);

/** Specs with their own project below, so the device projects skip them. */
const SPECIAL = /(a11y|offline)\.spec\.ts$/;

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
    // Escape hatch for machines whose installed Chromium is not the build this Playwright expects.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
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
      testIgnore: SPECIAL,
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
    // WebKit is not installed everywhere, so the iPhone is Chromium wearing an iPhone's size, pixel
    // ratio, touch and user agent. It catches layout and viewport problems, not Safari engine ones.
    {
      name: "iphone-15",
      testIgnore: SPECIAL,
      use: { ...devices["iPhone 15"], browserName: "chromium" },
    },
    // The smallest phone still in use (375x667) and a large Android (430 wide).
    {
      name: "iphone-se",
      testIgnore: SPECIAL,
      use: { ...devices["iPhone SE (3rd gen)"], browserName: "chromium" },
    },
    {
      name: "android-large",
      testIgnore: SPECIAL,
      use: { ...devices["Pixel 7"], browserName: "chromium", viewport: { width: 430, height: 932 } },
    },
  ],
  webServer: {
    command: `pnpm build && node e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { NEXT_PUBLIC_DEV_LOGIN: "false" },
  },
});
