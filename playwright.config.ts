import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a run sit beside a server already holding 3100.
const PORT = Number(process.env.E2E_PORT ?? 3100);
// The same build served beside the first with a stub API behind it (e2e/stub-api.mjs, port 4000):
// for the specs whose requests page.route cannot see (the service worker's) or that need real
// server rendering (axe on /stations, /areas, /toilets/[id]).
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT ?? 3101);
const STUB_PORT = Number(process.env.E2E_STUB_PORT ?? 4000);
// The live server behind a proxy that can drop or stall connections per browser context (e2e/flaky-proxy.mjs).
const FLAKY_PORT = Number(process.env.E2E_FLAKY_PORT ?? 3102);

/** Specs with their own project below, so the device projects skip them. */
const SPECIAL = /(a11y|offline|layout)\.spec\.ts$/;

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
    // axe on every route at 390 px, in both themes, against the stub API with real server rendering.
    {
      name: "a11y",
      testMatch: /a11y\.spec\.ts$/,
      use: { ...devices["iPhone 14"], browserName: "chromium", baseURL: `http://localhost:${LIVE_PORT}` },
    },
    // Overflow, overlap and off-screen controls on every route, at three phone widths.
    {
      name: "layout-390",
      testMatch: /layout\.spec\.ts$/,
      use: { ...devices["iPhone 14"], browserName: "chromium", baseURL: `http://localhost:${LIVE_PORT}` },
    },
    {
      name: "layout-375",
      testMatch: /layout\.spec\.ts$/,
      use: { ...devices["iPhone SE (3rd gen)"], browserName: "chromium", baseURL: `http://localhost:${LIVE_PORT}` },
    },
    {
      name: "layout-430",
      testMatch: /layout\.spec\.ts$/,
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
        baseURL: `http://localhost:${LIVE_PORT}`,
      },
    },
    // The service worker runs for real here: offline shell, saved lists, lie-fi. Needs the stub API.
    {
      name: "offline",
      testMatch: /offline\.spec\.ts$/,
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        baseURL: `http://localhost:${FLAKY_PORT}`,
        serviceWorkers: "allow",
      },
    },
  ],
  webServer: [
    {
      command: `pnpm build && node e2e/serve.mjs ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: "ignore",
      stderr: "pipe",
      env: { NEXT_PUBLIC_DEV_LOGIN: "false" },
    },
    {
      command: `node e2e/stub-api.mjs ${STUB_PORT}`,
      url: `http://127.0.0.1:${STUB_PORT}/__calls`,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // After the first entry's build; `next start` only reads .next. Playwright starts these in order.
      command: `node e2e/serve.mjs ${LIVE_PORT} --live-api`,
      url: `http://localhost:${LIVE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
      env: { NEXT_PUBLIC_DEV_LOGIN: "false", API_ORIGIN: `http://127.0.0.1:${STUB_PORT}` },
    },
    {
      command: `node e2e/flaky-proxy.mjs ${FLAKY_PORT} ${LIVE_PORT}`,
      url: `http://localhost:${FLAKY_PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
