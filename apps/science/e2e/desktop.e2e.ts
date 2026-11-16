import { expect, openTool, test } from "./fixtures";

// ClassKernel Science in its own window in the ClassKernel desktop app. The
// desktop bridge is stood in for here: it records each command the page sends
// and answers the save dialog with a path, so the test sees the page use the
// window (the save-as dialog, full screen, showing the window) rather than the
// browser.

type Call = [string, unknown];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const calls: Call[] = [];
    Object.assign(window, {
      __calls: calls,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "science" }, currentWebview: { label: "science", windowLabel: "science" } },
        transformCallback: () => 0,
        invoke: async (cmd: string, args: unknown) => {
          calls.push([cmd, args]);
          return cmd === "plugin:dialog|save" ? "C:\\Users\\teacher\\Pictures\\graph.png" : null;
        },
      },
    });
  });
});

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
const commands = async (page: import("@playwright/test").Page) => (await calls(page)).map(([cmd]) => cmd);

test("shows its window once drawn, and colours the title bar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tool-card")).toHaveCount(6);
  await expect.poll(() => commands(page)).toContain("plugin:window|show");
  await expect.poll(() => commands(page)).toContain("plugin:window|set_theme");
  await expect(page.locator("main p.lead")).toContainText("Pictures you save go wherever you choose");
});

test("Save PNG… asks where with the Save as dialog and writes the file through the app", async ({ page }) => {
  await openTool(page, "Graph paper generator");
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Save PNG…" }).click();
  await expect(page.locator(".toast")).toContainText("Saved");
  const all = await calls(page);
  const write = all.find(([cmd]) => cmd === "write_binary");
  expect(all.map(([cmd]) => cmd)).toContain("plugin:dialog|save");
  expect(write?.[1]).toMatchObject({ path: "C:\\Users\\teacher\\Pictures\\graph.png" });
  expect(((write?.[1] as { bytes: number[] }).bytes ?? []).slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]); // a PNG
  expect(downloads).toEqual([]);
});

test("Show to class fills the screen with the window, and going back restores it", async ({ page }) => {
  await openTool(page, "Galvanic cell animator");
  const fullscreen = async () =>
    (await calls(page)).filter(([cmd]) => cmd === "plugin:window|set_fullscreen").map(([, a]) => (a as { value: boolean }).value);
  await page.getByRole("button", { name: "Show to class" }).click();
  await expect.poll(fullscreen).toEqual([true]);
  await page.getByRole("button", { name: "Back to the controls" }).click();
  await expect.poll(fullscreen).toEqual([true, false]);
});
