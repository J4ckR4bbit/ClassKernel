import { defineConfig } from "@playwright/test";

// Browser tests: the built website, clicked through in Chromium.
// Run with `npm run test:e2e`; the first time, `npx playwright install chromium`.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 6_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:4174",
    viewport: { width: 1400, height: 900 },
    actionTimeout: 6_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
