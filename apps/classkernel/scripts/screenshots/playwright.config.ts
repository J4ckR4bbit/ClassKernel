import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Screenshots for the user guide (docs/user-guide), taken from the built app in
// demo mode, like the browser tests. Run with `npm run docs:screenshots`; the
// pictures land in docs/images/. Re-run it after a change to the interface so
// the guide keeps matching the app.
export default defineConfig({
  testDir: ".",
  testMatch: "*.shots.ts",
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:4173",
    // The desktop app's default window size (src-tauri/tauri.conf.json).
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "en-ZA",
    timezoneId: "Africa/Johannesburg",
    actionTimeout: 8_000,
    // A fake microphone for the noise meter: a steady tone, no prompt.
    permissions: ["microphone"],
    // A South African browser locale also makes date fields read 2026/10/08.
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
      env: { ...process.env, LANGUAGE: "en_ZA", LANG: "en_ZA.UTF-8" },
    },
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
