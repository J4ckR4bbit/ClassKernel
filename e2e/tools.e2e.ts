import { Page } from "@playwright/test";
import { ALL_TOOLS, enableTools, expect, nav, openTool, reveal, settingsTab, test } from "./fixtures";

// The tools (Settings → Tools): each one switched on, opened and used.

test("switched-on tools appear on Home and in the navigation drawer", async ({ page }) => {
  await enableTools(page, ALL_TOOLS);
  await nav(page, "Home");
  await expect(page.locator(".tool-card")).toHaveCount(ALL_TOOLS.length);
  await page.getByRole("button", { name: "Expand the menu" }).click();
  await expect(page.locator(".nav-tools .nav-item")).toHaveCount(ALL_TOOLS.length);
});

test.describe("dashboards", () => {
  test.beforeEach(async ({ page }) => {
    await enableTools(page, ["class-dashboards", "parent-reports"]);
    await openTool(page, "Class & student dashboards");
    await reveal(page);
  });

  test("follow the top bar's class menu, with no picker of their own", async ({ page }) => {
    await expect(page.locator("main .class-picker")).toHaveCount(0);
    await expect(page.locator("main .md-tab.active")).toContainText("Class");
    await expect(page.locator(".summary-card")).toBeVisible();
  });

  test("the period is a segmented button", async ({ page }) => {
    await page.locator("main .seg button", { hasText: "Last 2 weeks" }).click();
    await expect(page.locator("main .seg button.on")).toHaveText("Last 2 weeks");
  });

  test("the Student tab steps through the class", async ({ page }) => {
    await page.locator("main .md-tab", { hasText: "Student" }).click();
    await reveal(page);
    const name = page.locator(".student-name");
    const first = await name.innerText();
    await page.getByRole("button", { name: "Next student" }).click();
    await expect(name).not.toHaveText(first);
  });

  test("Print report opens a one-page preview, without a class menu", async ({ page }) => {
    await page.locator("main .md-tab", { hasText: "Student" }).click();
    await reveal(page);
    await page.getByRole("button", { name: "Print report" }).click();
    await expect(page.locator(".report-page")).toHaveCount(1);
    await expect(page.locator(".report-options .class-picker")).toHaveCount(0);
    await page.locator(".report-actions button", { hasText: "Close" }).click();
    await expect(page.locator(".report-portal")).toHaveCount(0);
  });
});

test("the Students list opens a student's dashboard, and not once the dashboards are off", async ({ page }) => {
  await enableTools(page, ["class-dashboards"]);
  await settingsTab(page, "Students");
  await reveal(page);
  await page.getByRole("button", { name: /^Dashboard for/ }).first().click();
  await expect(page.locator(".top-bar-title")).toHaveText("Class & student dashboards");
  await expect(page.locator("main .md-tab.active")).toContainText("Student");

  await settingsTab(page, "Tools");
  await page.locator("#plugin-class-dashboards").uncheck();
  await settingsTab(page, "Students");
  await reveal(page);
  await expect(page.getByRole("button", { name: /^Dashboard for/ })).toHaveCount(0);
});

test("parent reports: a page per student, the class menu in the panel, A4 print", async ({ page }) => {
  await enableTools(page, ["parent-reports"]);
  await openTool(page, "Parent reports");
  await reveal(page);
  const pages = page.locator(".report-page");
  const students = await pages.count();
  expect(students).toBeGreaterThan(10);

  // The preview covers the top bar, so it carries the same class menu; Escape closes only the menu.
  await page.locator(".report-options .class-picker-btn").click();
  await expect(page.locator(".report-options .menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".report-options .menu")).toHaveCount(0);
  await expect(page.locator(".report-portal")).toBeVisible();

  await page.locator(".report-options select").selectOption({ index: 1 });
  await expect(pages).toHaveCount(1);
  await page.locator(".report-options select").selectOption({ index: 0 });
  await expect(pages).toHaveCount(students);

  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  const printed = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  // One A4 page each; a long report may flow onto a second rather than be cut off.
  expect(printed).toBeGreaterThanOrEqual(students);
  expect(printed).toBeLessThanOrEqual(students * 2);

  await page.locator(".report-actions button", { hasText: "Home" }).click();
  await expect(page.locator(".report-portal")).toHaveCount(0);
});

test("test timer: start, pause, resume, the pop-up elsewhere, stop", async ({ page }) => {
  await enableTools(page, ["test-timer"]);
  await openTool(page, "Test timer");
  await page.locator("main button.primary", { hasText: "Start" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).click();
  await nav(page, "Attendance");
  await expect(page.locator(".mini-stack .timer-mini")).toBeVisible();
  await page.locator(".timer-mini").getByRole("button", { name: "Open the test timer" }).click();
  await expect(page.locator(".top-bar-title")).toHaveText("Test timer");
  await page.locator("main button", { hasText: "Stop" }).click();
  await nav(page, "Attendance");
  await expect(page.locator(".timer-mini")).toHaveCount(0);
});

test("clock and stopwatch", async ({ page }) => {
  await enableTools(page, ["clock", "stopwatch"]);
  await openTool(page, "Clock");
  await expect(page.locator(".clock-plugin")).toBeVisible();

  await openTool(page, "Stopwatch");
  await page.locator("main .sw-main").click();
  await page.waitForTimeout(600);
  await page.locator("main button", { hasText: "Lap" }).click();
  await expect(page.locator(".sw-laps tbody tr:not(.current)")).toHaveCount(1);
  await page.locator("main .sw-main").click();
  await page.locator("main button", { hasText: "Restart" }).click();
  await expect(page.locator(".sw-laps")).toHaveCount(0);
});

test("graph tools: graph paper saves a PNG, the plotter takes readings, the motion graph its choices", async ({ page }) => {
  await enableTools(page, ["graph-paper", "practical-graph", "motion-graph"]);
  await openTool(page, "Graph paper generator");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG…" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);

  await openTool(page, "Practical graph plotter");
  const remove = page.getByRole("button", { name: "Remove this reading" });
  const before = await remove.count();
  // Typing in the spare bottom row adds a new spare row under it.
  const rows = page.locator("main tbody tr");
  for (const [x, y] of [[0, 0.1], [1, 2.1], [2, 3.9], [3, 6.2]]) {
    const row = rows.nth((await rows.count()) - 1);
    await row.locator("input").nth(0).fill(String(x));
    await row.locator("input").nth(1).fill(String(y));
  }
  await expect(remove).toHaveCount(before + 4);
  await remove.first().click();
  await expect(remove).toHaveCount(before + 3);

  await openTool(page, "Motion graph builder");
  const choice = page.locator("main .seg.small").first();
  await choice.locator("button").nth(1).click();
  await expect(choice.locator("button.on")).toHaveCount(1);
  await expect(choice.locator("button").nth(1)).toHaveClass(/\bon\b/);
});

test.describe("noise meter", () => {
  const startMeter = async (page: Page) => {
    await enableTools(page, ["noise-meter", "test-timer"]);
    await openTool(page, "Class noise meter");
    await page.locator("main button.primary", { hasText: "Start" }).click();
    await expect(page.locator(".nm-reading")).toContainText(/\d/, { timeout: 10_000 });
  };

  test("reads as a % of the limit, with the dB(A) under it, the bar and the graph", async ({ page }) => {
    await startMeter(page);
    const pct = Number((await page.locator(".nm-reading").innerText()).replace(/\D/g, ""));
    const db = Number((await page.locator(".nm-db").innerText()).replace(/\D/g, ""));
    const limit = Number(await page.locator(".nm-limit-value").innerText());
    expect(Math.abs(pct - (db / limit) * 100)).toBeLessThanOrEqual(2);
    // The bar follows the %: 0 to 150 % of the limit.
    const fill = await page.locator(".nm-gauge-fill").evaluate((e) => parseFloat((e as HTMLElement).style.width));
    expect(Math.abs(fill - (Math.min(pct, 150) / 150) * 100)).toBeLessThanOrEqual(2);
    await expect(page.locator(".nm-graph polyline")).toHaveCount(1, { timeout: 5_000 });
  });

  test("the class view fills the screen and closes again", async ({ page }) => {
    await startMeter(page);
    await page.getByRole("button", { name: "Show to class" }).click();
    await expect(page.locator(".nm-display.class-view")).toBeVisible();
    await page.getByRole("button", { name: "Back to the controls" }).click();
    await expect(page.locator(".nm-display.class-view")).toHaveCount(0);
  });

  test("keeps listening on other screens as a pop-up, stacked with the timer", async ({ page }) => {
    await startMeter(page);
    await expect(page.locator(".noise-mini")).toHaveCount(0); // not on its own screen
    await openTool(page, "Test timer");
    await page.locator("main button.primary", { hasText: "Start" }).click();
    await nav(page, "Seats");
    await expect(page.locator(".mini-stack .noise-mini")).toBeVisible();
    await expect(page.locator(".mini-stack .timer-mini")).toBeVisible();
    await expect(page.locator(".noise-mini-pct")).toContainText(/\d+%/);

    // In the side panel it sits inside the panel instead of the corner.
    await nav(page, "Lesson");
    await page.getByRole("button", { name: "Side panel" }).click();
    await expect(page.locator(".noise-mini.inline")).toBeVisible();
    await expect(page.locator(".mini-stack .noise-mini")).toHaveCount(0);
    await page.getByTitle("Exit teaching mode (Esc)").click();

    await page.locator(".noise-mini").getByRole("button", { name: "Open the noise meter" }).click();
    await expect(page.locator(".top-bar-title")).toHaveText("Class noise meter");
  });

  test("the pop-up flashes red with the alarm, and Stop closes the microphone", async ({ page }) => {
    await startMeter(page);
    for (let i = 0; i < 30; i++) await page.getByRole("button", { name: "Lower the limit" }).click();
    await nav(page, "Attendance");
    await expect(page.locator(".noise-mini.alarm")).toBeVisible({ timeout: 8_000 });
    await page.locator(".noise-mini").getByRole("button", { name: "Stop listening" }).click();
    await expect(page.locator(".noise-mini")).toHaveCount(0);
    await openTool(page, "Class noise meter");
    await expect(page.locator(".nm-controls button", { hasText: "Start" })).toBeVisible();
  });

  test("switching the tool off stops it", async ({ page }) => {
    await startMeter(page);
    await settingsTab(page, "Tools");
    await page.locator("#plugin-noise-meter").uncheck();
    await expect(page.locator(".noise-mini")).toHaveCount(0);
    await page.locator("#plugin-noise-meter").check();
    await openTool(page, "Class noise meter");
    await expect(page.locator(".nm-controls button", { hasText: "Start" })).toBeVisible();
  });
});
