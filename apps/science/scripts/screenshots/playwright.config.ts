import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Screenshots of the science tools for the user guide, taken from the built
// website. Run with `npm run docs:screenshots`; the pictures land in
// docs/images/ at the top of the repository.
export default defineConfig({
  testDir: ".",
  testMatch: "*.shots.ts",
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:4174",
    // The same size as ClassKernel's pictures, so the guide's pages match.
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "en-ZA",
    timezoneId: "Africa/Johannesburg",
    actionTimeout: 8_000,
    launchOptions: { env: { ...process.env, LANGUAGE: "en_ZA", LANG: "en_ZA.UTF-8" } },
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4174 --strictPort",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: "http://localhost:4174",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
