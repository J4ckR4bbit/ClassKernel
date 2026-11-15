import { Page, expect, test as base } from "@playwright/test";
import { ALL_TOOLS } from "./fixtures";

// The tools website (`npm run build:tools`): the tools on their own, each at
// an address of its own, with nothing from the class pages around them.

const SITE = "http://localhost:4174/";
/** The tools that need a class's records stay in the desktop app. */
const WEB_TOOLS = ALL_TOOLS.filter((id) => id !== "class-dashboards" && id !== "parent-reports");

/** Fails a test if anything reaches the browser console as an error. */
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await use(page);
    expect(errors, "errors in the browser console").toEqual([]);
  },
});

const title = (page: Page) => page.locator(".top-bar-title");
const hash = (page: Page) => page.evaluate(() => location.hash);

test("lists every tool that needs no class data, and nothing of the class pages", async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator(".tool-card")).toHaveCount(WEB_TOOLS.length);
  await expect(page.locator(".tool-card", { hasText: "dashboards" })).toHaveCount(0);
  await expect(page.locator(".tool-card", { hasText: "Parent reports" })).toHaveCount(0);
  await expect(page.locator(".nav-rail")).toHaveCount(0);
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await expect(page).toHaveTitle("ClassKernel tools");
});

test("every tool opens at its own address", async ({ page }) => {
  await page.goto(SITE);
  const names = await page.locator(".tool-card b").allInnerTexts();
  for (const [i, name] of names.entries()) {
    await page.locator(".tool-card").nth(i).click();
    await expect(title(page)).toHaveText(name);
    expect(await hash(page)).toBe(`#/${WEB_TOOLS[i]}`);
    await expect(page.locator(".plugin-loading")).toHaveCount(0);
    await expect(page.getByText("stopped working")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to all tools" }).click();
    await expect(page.locator(".tool-card")).toHaveCount(WEB_TOOLS.length);
    expect(await hash(page)).toBe("");
  }
});

test("a tool's address opens it directly, and Back and Forward move between the list and the tool", async ({ page }) => {
  await page.goto(`${SITE}#/galvanic-cell`);
  await expect(title(page)).toHaveText("Galvanic cell animator");
  await expect(page).toHaveTitle("Galvanic cell animator — ClassKernel tools");
  await page.getByRole("button", { name: "Back to all tools" }).click();
  await expect(title(page)).toHaveText("ClassKernel tools");
  await page.goBack();
  await expect(title(page)).toHaveText("Galvanic cell animator");
  await page.goForward();
  await expect(title(page)).toHaveText("ClassKernel tools");
});

test("arriving by a tool's address adds nothing to the history: Back leaves the site", async ({ page }) => {
  await page.goto("about:blank");
  await page.goto(`${SITE}#/clock`);
  await expect(title(page)).toHaveText("Clock");
  await page.goBack();
  expect(page.url()).toBe("about:blank");
});

test("an address that names no tool, or a desktop-only one, shows the list", async ({ page }) => {
  await page.goto(`${SITE}#/class-dashboards`);
  await expect(page.locator(".tool-card")).toHaveCount(WEB_TOOLS.length);
  await page.goto(`${SITE}#/no-such-tool`);
  await expect(page.locator(".tool-card")).toHaveCount(WEB_TOOLS.length);
});

test("the test timer's presets are remembered by the browser", async ({ page }) => {
  await page.goto(`${SITE}#/test-timer`);
  await page.getByRole("button", { name: "Save current settings" }).click();
  await page.locator(".modal input").fill("Physics P1");
  await page.locator(".modal button.primary").click();
  await expect(page.locator("main select option", { hasText: "Physics P1" })).toHaveCount(1);
  await page.reload();
  await expect(title(page)).toHaveText("Test timer");
  await expect(page.locator("main select option", { hasText: "Physics P1" })).toHaveCount(1);
});

test("a running timer follows to the list as a pop-up that opens the timer again", async ({ page }) => {
  await page.goto(`${SITE}#/test-timer`);
  await page.locator("main button.primary", { hasText: "Start" }).click();
  await page.getByRole("button", { name: "Back to all tools" }).click();
  await expect(page.locator(".timer-mini")).toBeVisible();
  await page.locator(".timer-mini").getByRole("button", { name: "Open the test timer" }).click();
  await expect(title(page)).toHaveText("Test timer");
  expect(await hash(page)).toBe("#/test-timer");
});
