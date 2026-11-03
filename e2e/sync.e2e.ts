import { Page } from "@playwright/test";
import { expect, nav, settingsTab, test } from "./fixtures";

// Changes are saved on this computer and sent to the data folder (Google
// Drive) in batches: every few minutes and at natural pauses, not after every
// tap. The browser demo stands in for a synced folder with ?simulate=drive;
// &minute=<seconds> shortens a "minute" of the send interval.

const CLASS = "7B-Science";
const ATTENDANCE = `classes/${CLASS}/attendance.csv`;

async function launch(page: Page, minuteSeconds: number) {
  await page.goto(`/?simulate=drive&minute=${minuteSeconds}`);
  await expect(chip(page)).toBeVisible();
}

const chip = (page: Page) => page.locator(".send-status");
const onDrive = (page: Page, rel: string) => page.evaluate((r) => window.__ckDemo!.readOnDrive(r), rel);

/** Mark the first student on the register absent, today. */
async function markFirstAbsent(page: Page) {
  await nav(page, "Attendance");
  const first = page.locator(".att-seg").first();
  await first.locator(".att-btn.A").click();
  await expect(first.locator(".att-btn.A")).toHaveClass(/\bon\b/);
}

test("a change waits on this computer, then goes to the data folder with the next batch", async ({ page }) => {
  await launch(page, 1); // "every 2 minutes" = every 2 s
  const before = await onDrive(page, ATTENDANCE);
  await markFirstAbsent(page);
  await expect(chip(page)).toContainText("Changes waiting");
  expect(await onDrive(page, ATTENDANCE)).toBe(before);
  await expect.poll(() => onDrive(page, ATTENDANCE), { timeout: 8_000 }).not.toBe(before);
  await expect(chip(page)).toContainText("Sent");
});

test("Send now sends straight away, and takes in a change made on another computer", async ({ page }) => {
  await launch(page, 60); // a real two minutes: only Send now sends
  const before = await onDrive(page, ATTENDANCE);
  await markFirstAbsent(page);
  await page.waitForTimeout(500);
  expect(await onDrive(page, ATTENDANCE)).toBe(before);

  // Meanwhile another computer moves the class to another room.
  const classMd = (await onDrive(page, `classes/${CLASS}/class.md`))!;
  await page.evaluate(
    ([rel, text]) => window.__ckDemo!.editOnDrive(rel, text),
    [`classes/${CLASS}/class.md`, classMd.replace(/room: .*/, "room: Lab 9")],
  );

  await chip(page).click();
  await expect.poll(() => onDrive(page, ATTENDANCE)).not.toBe(before);
  await expect(page.locator(".top-bar .class-picker-room")).toHaveText("Lab 9");
});

test("End lesson is a natural pause: what it saved is sent at once", async ({ page }) => {
  await launch(page, 60);
  const lessonsBefore = await onDrive(page, `classes/${CLASS}/lessons.csv`);
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.getByRole("button", { name: "End lesson" }).click();
  await page.locator(".modal button.primary").click();
  await expect.poll(() => onDrive(page, `classes/${CLASS}/lessons.csv`)).not.toBe(lessonsBefore);
  await expect(chip(page)).toContainText("Sent");
});

test("With every save, changes go to the data folder straight away", async ({ page }) => {
  await launch(page, 60);
  await settingsTab(page, "General");
  await page.getByRole("group", { name: "Send changes to your data folder" }).getByRole("button", { name: "With every save" }).click();
  await expect(chip(page)).toHaveCount(0);
  const before = await onDrive(page, ATTENDANCE);
  await markFirstAbsent(page);
  await expect.poll(() => onDrive(page, ATTENDANCE), { timeout: 2_000 }).not.toBe(before);
});

test("renaming a class is done in the data folder itself, and sending in batches carries on", async ({ page }) => {
  await launch(page, 60);
  await nav(page, "Class");
  await page.getByRole("button", { name: "Rename class" }).click();
  await page.locator(".modal input").fill("7B Science");
  await page.locator(".modal button.primary").click();
  await expect(page.locator(".top-bar .class-picker-name")).toHaveText("7B Science");
  expect(await onDrive(page, "classes/7B Science/class.md")).not.toBeNull();
  expect(await onDrive(page, `classes/${CLASS}/class.md`)).toBeNull();
  await expect(chip(page)).toBeVisible();

  // And a change made afterwards still goes to the renamed class's folder.
  await markFirstAbsent(page);
  await chip(page).click();
  await expect.poll(() => onDrive(page, "classes/7B Science/attendance.csv")).toContain(",A,");
});
