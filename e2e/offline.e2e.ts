import { Page } from "@playwright/test";
import { expect, nav, test } from "./fixtures";

// When the data folder isn't there at launch (Google Drive still starting),
// the app waits, then works from this computer's copy, and copies the changes
// back when the folder returns. The browser demo stands in for the missing
// folder with ?simulate=folder-missing (see src/lib/demoMissingFolder.ts).

const ATTENDANCE = "classes/7B-Science/attendance.csv";

async function launchWithoutFolder(page: Page, waitSeconds = 60) {
  await page.goto(`/?simulate=folder-missing&wait=${waitSeconds}`);
  await expect(page.getByRole("heading", { name: "Waiting for your data folder…" })).toBeVisible();
}

const banner = (page: Page) => page.locator(".folder-banner");

/** Mark the first student on the register absent, today. */
async function markFirstAbsent(page: Page) {
  await nav(page, "Attendance");
  const first = page.locator(".att-seg").first();
  await first.locator(".att-btn.A").click();
  await expect(first.locator(".att-btn.A")).toHaveClass(/\bon\b/);
}

test("waits for the folder, works from this computer's copy, and copies the changes back", async ({ page }) => {
  await launchWithoutFolder(page);
  await page.getByRole("button", { name: "Open this computer's copy now" }).click();
  await expect(banner(page)).toContainText("Your data folder isn't available");

  await markFirstAbsent(page);
  // A class rename can't be copied back safely, so it waits for the folder.
  await nav(page, "Notes");
  await expect(page.getByRole("button", { name: "Rename class" })).toBeDisabled();

  await page.evaluate(() => window.__ckDemo!.folderBack());
  await expect(banner(page)).toContainText("This computer's changes are back in your data folder", { timeout: 15_000 });
  expect(await page.evaluate((rel) => window.__ckDemo!.readOnDrive(rel), ATTENDANCE)).toMatch(/,A,/);
  await expect(page.getByRole("button", { name: "Rename class" })).toBeEnabled();

  // Still on the same class, with the register as it was left.
  await nav(page, "Attendance");
  await expect(page.locator(".att-seg").first().locator(".att-btn.A")).toHaveClass(/\bon\b/);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner(page)).toHaveCount(0);
});

test("opens this computer's copy by itself after the wait", async ({ page }) => {
  await launchWithoutFolder(page, 1);
  await expect(banner(page)).toContainText("working from this computer's copy", { timeout: 10_000 });
});

test("joins changes made on another computer meanwhile", async ({ page }) => {
  await launchWithoutFolder(page);
  await page.getByRole("button", { name: "Open this computer's copy now" }).click();
  await markFirstAbsent(page);
  // Meanwhile, another computer recorded an earlier day's register.
  await page.evaluate(async (rel) => {
    const drive = (await window.__ckDemo!.readOnDrive(rel)) ?? "date,student_id,status,note\r\n";
    await window.__ckDemo!.editOnDrive(rel, `${drive}2001-01-01,elsewhere,L,\r\n`);
  }, ATTENDANCE);
  await page.evaluate(() => window.__ckDemo!.folderBack());
  await expect(banner(page)).toContainText("joined with changes made on another computer", { timeout: 15_000 });
  const joined = await page.evaluate((rel) => window.__ckDemo!.readOnDrive(rel), ATTENDANCE);
  expect(joined).toMatch(/,A,/);
  expect(joined).toContain("2001-01-01,elsewhere,L");
});

test("in teaching mode, waits until the lesson view is left before copying back", async ({ page }) => {
  await launchWithoutFolder(page);
  await page.getByRole("button", { name: "Open this computer's copy now" }).click();
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Teaching mode" }).click();
  await expect(page.locator(".copy-chip")).toContainText("This computer's copy");
  await page.evaluate(() => window.__ckDemo!.folderBack());
  await expect(page.locator(".copy-chip")).toContainText("Folder back", { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(banner(page)).toContainText("This computer's changes are back in your data folder", { timeout: 15_000 });
});
