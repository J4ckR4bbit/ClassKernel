import { defineConfig } from "@playwright/test";

// Browser tests: the built app in demo mode (no desktop backend, data in
// memory, a fresh demo class on every page load), clicked through in Chromium.
// Run with `npm run test:e2e`; the first time, `npx playwright install chromium`.
// The unit tests (`npm test`) are separate and don't need a browser.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 6_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:4173",
    viewport: { width: 1400, height: 900 },
    actionTimeout: 6_000,
    // A fake microphone for the noise meter: a steady tone, no prompt.
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
