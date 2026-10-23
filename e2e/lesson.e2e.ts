import { expect, nav, reveal, test } from "./fixtures";

// Taking a lesson: the register, seating, the live lesson and its tools, and
// the behaviour log they feed. The demo class already has its seats assigned.

const seats = (page: import("@playwright/test").Page) => page.locator(".seat-square.occupied");
const toast = (page: import("@playwright/test").Page) => page.locator(".toast");

test("attendance: all present, then one absent and one late", async ({ page }) => {
  await nav(page, "Attendance");
  await page.getByRole("button", { name: "All present" }).click();
  const rows = page.locator(".att-seg");
  await rows.nth(0).locator(".att-btn.A").click();
  await rows.nth(1).locator(".att-btn.L").click();
  await expect(rows.nth(0).locator(".att-btn.A")).toHaveClass(/\bon\b/);
  await expect(rows.nth(1).locator(".att-btn.L")).toHaveClass(/\bon\b/);
});

test("seating: Randomise fills the seats, then locks until the PIN", async ({ page }) => {
  await nav(page, "Seats");
  await page.locator("main button", { hasText: "Randomise" }).click();
  await expect(page.locator(".shuffle-overlay")).toBeVisible();
  await expect(page.locator(".shuffle-overlay")).toHaveCount(0, { timeout: 10_000 });
  expect(await seats(page).count()).toBeGreaterThan(10);
  await expect(page.locator("main button", { hasText: "Reseat" })).toBeVisible();
});

test("lesson: tap a seat and log a behaviour", async ({ page }) => {
  await nav(page, "Lesson");
  await seats(page).first().click({ force: true });
  const popover = page.locator(".behaviour-popover");
  await expect(popover).toBeVisible();
  await popover.locator(".bh-btn").first().click();
  await expect(toast(page)).toBeVisible();
});

test("lesson: a seat opens from the keyboard, and Escape closes it again", async ({ page }) => {
  await nav(page, "Lesson");
  const seat = page.getByRole("button", { name: /^(?!Empty seat)/ }).and(page.locator(".room-canvas .seat")).first();
  await seat.focus();
  await page.keyboard.press("Enter");
  const popover = page.locator(".behaviour-popover");
  await expect(popover).toBeVisible();
  const label = (await seat.getAttribute("aria-label")) ?? "";
  await expect(popover.locator("h4")).toHaveText(label.split(",")[0]);
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("lesson: tapping off a seat's pop-up closes it, and another seat opens that student's", async ({ page }) => {
  await nav(page, "Lesson");
  const popover = page.locator(".behaviour-popover");
  await seats(page).first().click({ force: true });
  await expect(popover).toBeVisible();
  await page.locator("main .lesson-head").click();
  await expect(popover).toHaveCount(0);

  await seats(page).nth(1).click({ force: true });
  await expect(popover).toBeVisible();
  const first = await popover.locator("h4").textContent();
  // A seat across the room, clear of the open pop-up.
  await seats(page).last().click({ force: true });
  await expect(popover).toBeVisible();
  await expect(popover.locator("h4")).not.toHaveText(first ?? "");
});

test("side panel: tapping off a student's sheet closes it", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Side panel" }).click();
  await page.locator(".strip .strip-student").first().click();
  const sheet = page.locator(".strip-sheet");
  await expect(sheet).toBeVisible();
  await page.locator(".strip .strip-class").click();
  await expect(sheet).toHaveCount(0);
});

test("lesson: the bathroom timer starts and stops", async ({ page }) => {
  await nav(page, "Lesson");
  await seats(page).nth(2).click({ force: true });
  await page.locator(".behaviour-popover .bathroom-btn").click();
  await expect(toast(page)).toContainText("Bathroom timer started");
  await seats(page).nth(2).click({ force: true });
  await expect(page.locator(".behaviour-popover .bathroom-btn")).toContainText("Back from bathroom");
  await page.locator(".behaviour-popover .bathroom-btn").click();
});

test("lesson: pick a student and record the answer", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Pick a student" }).click();
  const answer = page.locator(".picker-answer button").first();
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await answer.click();
  await expect(page.locator(".picker-card")).toHaveCount(0);
});

test("lesson: batch entry records one behaviour for several students", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Batch entry" }).click();
  await page.locator(".batch-panel .bh-btn").first().click();
  await seats(page).nth(3).click({ force: true });
  await seats(page).nth(4).click({ force: true });
  await page.locator(".batch-panel button.primary", { hasText: "Save" }).click();
  await expect(toast(page)).toContainText("2 students");
  // The panel goes back to choosing the next behaviour; Done leaves it.
  await page.locator(".batch-panel").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".batch-panel")).toHaveCount(0);
});

test("lesson: discarding a batch selection can be undone", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Batch entry" }).click();
  await page.locator(".batch-panel .bh-btn").first().click();
  await seats(page).nth(3).click({ force: true });
  await seats(page).nth(4).click({ force: true });
  await page.locator(".batch-panel").getByRole("button", { name: "Discard (2)" }).click();
  await expect(page.locator(".batch-panel")).toHaveCount(0);
  await expect(toast(page)).toContainText("Discarded 2 selected students");
  await toast(page).getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".batch-panel button.primary", { hasText: "Save (2)" })).toBeVisible();
});

test("teaching mode: the room plan and the side panel, and back", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Teaching mode" }).click();
  await expect(page.locator(".nav-rail")).toHaveCount(0);
  await page.getByRole("button", { name: "Exit teaching mode" }).click();
  await expect(page.locator(".nav-rail")).toBeVisible();

  await page.getByRole("button", { name: "Side panel" }).click();
  await expect(page.locator(".nav-rail")).toHaveCount(0);
  // The side panel's footer flips between Start and End lesson too.
  await page.locator(".strip-foot").getByRole("button", { name: "Start lesson" }).click();
  await expect(page.locator(".strip-foot").getByRole("button", { name: "End lesson" })).toBeVisible();
  await page.getByTitle("Exit teaching mode (Esc)").click();
  await expect(page.locator(".nav-rail")).toBeVisible();
});

test("Start lesson marks the class present and becomes End lesson", async ({ page }) => {
  // One student marked absent in the register first: starting the lesson keeps that.
  await nav(page, "Attendance");
  const first = page.locator(".att-seg").first();
  await first.locator(".att-btn.A").click();

  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(toast(page)).toContainText("Lesson started");
  await expect(page.getByRole("button", { name: "End lesson" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start lesson" })).toHaveCount(0);

  await nav(page, "Attendance");
  await expect(first.locator(".att-btn.A")).toHaveClass(/\bon\b/);
  const rows = page.locator(".att-seg");
  const n = await rows.count();
  for (let i = 0; i < n; i++) await expect(rows.nth(i).locator(".att-btn.on")).toHaveCount(1);

  // Ending it brings Start lesson back.
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "End lesson" }).click();
  await page.locator(".modal button.primary").click();
  await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
});

test("Randomise starts the lesson", async ({ page }) => {
  await nav(page, "Seats");
  await page.locator("main button", { hasText: "Randomise" }).click();
  await expect(toast(page)).toContainText("lesson started", { timeout: 10_000 });
  await nav(page, "Lesson");
  await expect(page.getByRole("button", { name: "End lesson" })).toBeVisible();
});

test("end lesson, then the behaviour log lists events and bathroom trips", async ({ page }) => {
  await nav(page, "Lesson");
  await seats(page).first().click({ force: true });
  await page.locator(".behaviour-popover .bh-btn").first().click();
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.getByRole("button", { name: "End lesson" }).click();
  if (await page.locator(".modal").isVisible()) await page.locator(".modal button.primary").click();
  await expect(toast(page)).toBeVisible();

  await nav(page, "Behaviour");
  await reveal(page);
  expect(await page.locator("main table.data tbody tr").count()).toBeGreaterThan(3);
  await expect(page.locator("main h2", { hasText: "Bathroom log" })).toBeVisible();
});

test("teaching mode: Escape closes a seat's pop-up first, then leaves", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Teaching mode" }).click();
  await seats(page).first().click({ force: true });
  const popover = page.locator(".behaviour-popover");
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(page.locator(".nav-rail")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".nav-rail")).toBeVisible();
});

test("lesson: an attendance tap says what it recorded, marks the seat, and can be undone", async ({ page }) => {
  await nav(page, "Lesson");
  // The demo class may already have someone late today.
  const late = page.locator(".seat-badge.late");
  const before = await late.count();
  await seats(page).first().click({ force: true });
  await page.locator(".behaviour-popover .att-btn.L").click();
  await expect(toast(page)).toContainText("Marked late");
  await expect(late).toHaveCount(before + 1);
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(late).toHaveCount(before);
});

test("Randomise can be undone, without lifting the seat lock", async ({ page }) => {
  await nav(page, "Lesson");
  const names = async () => (await page.locator(".seat-name").allTextContents()).join("|");
  const before = await names();
  await page.getByRole("button", { name: "Randomise" }).click();
  await expect(toast(page)).toContainText("lesson started", { timeout: 10_000 });
  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(names).toBe(before);
  await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reseat…" })).toBeVisible();
});
