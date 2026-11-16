import { Page } from "@playwright/test";
import { expect, nav, reveal, settingsTab, test } from "./fixtures";

// The student pop-up's three styles, behaviour codes and icons, and notes:
// quick notes from the lesson (Submit / Draft / Escape), detailed notes in
// sections, Form F, and the Notes page.

const seats = (page: Page) => page.locator(".room-canvas g.seat");
const toast = (page: Page) => page.locator(".toast");
const noteBox = (page: Page) => page.locator(".modal.note-modal");

async function popupStyle(page: Page, style: "List" | "Grid" | "Round") {
  await settingsTab(page, "Teaching mode");
  await page.getByRole("group", { name: "Student pop-up" }).getByRole("button", { name: style }).click();
  await nav(page, "Lesson");
}

test("the grid pop-up records attendance and a behaviour from its tiles", async ({ page }) => {
  await popupStyle(page, "Grid");
  await seats(page).nth(3).click();
  const grid = page.locator(".behaviour-popover .student-grid");
  await expect(grid).toBeVisible();
  // Each behaviour is a tile with its three-character code.
  await expect(grid.locator(".sg-tile .sg-code").first()).toHaveText("+EF");
  await grid.getByRole("radio", { name: "Late" }).click();
  await expect(toast(page)).toContainText("Marked late");
  await seats(page).nth(3).click();
  await page.getByRole("button", { name: "+1 Great effort" }).click();
  await expect(toast(page)).toContainText("Great effort");
});

test("the round pop-up opens centred on the seat tapped, and records from its rings", async ({ page }) => {
  await popupStyle(page, "Round");
  const seat = seats(page).nth(8);
  const s = (await seat.boundingBox())!;
  await seat.click();
  const ring = page.locator(".student-ring > svg");
  await expect(ring).toBeVisible();
  const r = (await ring.boundingBox())!;
  expect(Math.abs(r.x + r.width / 2 - (s.x + s.width / 2))).toBeLessThan(2);
  expect(Math.abs(r.y + r.height / 2 - (s.y + s.height / 2))).toBeLessThan(2);

  await page.getByRole("button", { name: /Talking \/ off task/ }).click();
  await expect(toast(page)).toContainText("Talking / off task");
  await seat.click();
  await page.locator(".ring-outside").click();
  await expect(toast(page)).toContainText("OUTSIDE timer started");
  await expect(page.locator(".bathroom-bar")).toContainText("Outside now");
});

test("a behaviour's code is at most three characters, and its icon shows on the tiles", async ({ page }) => {
  await settingsTab(page, "Behaviour");
  const code = page.getByRole("textbox", { name: "Code for Great effort" });
  await code.fill("EFFORT");
  await expect(code).toHaveValue("EFF");
  await code.press("Enter");
  await page.getByRole("button", { name: "Icon for Great effort" }).click();
  await page.locator(".icon-picker").getByRole("button", { name: "star", exact: true }).click();

  await popupStyle(page, "Grid");
  await seats(page).nth(2).click();
  const tile = page.getByRole("button", { name: "+1 Great effort" });
  await expect(tile.locator(".sg-code")).toHaveText("EFF");
  await expect(tile.locator("svg.icon")).toHaveCount(1);
});

test("a quick note: Draft keeps it for the student, Submit saves it, Escape throws it away", async ({ page }) => {
  await nav(page, "Lesson");
  await seats(page).nth(4).click();
  await page.locator(".behaviour-popover").getByRole("button", { name: "Note" }).click();
  await noteBox(page).locator("textarea").fill("Forgot his calculator again");
  await noteBox(page).getByRole("button", { name: "Assessment" }).click();
  await noteBox(page).getByRole("button", { name: "Draft" }).click();
  await expect(noteBox(page)).toHaveCount(0);

  // Opening the student again: the Note button says there's a draft, and it's all still there.
  await seats(page).nth(4).click();
  await page.locator(".behaviour-popover").getByRole("button", { name: "Note (draft)" }).click();
  await expect(noteBox(page).locator("textarea")).toHaveValue("Forgot his calculator again");
  await expect(noteBox(page).getByRole("button", { name: "Assessment" })).toHaveAttribute("aria-pressed", "true");
  await noteBox(page).getByRole("button", { name: "Submit" }).click();
  await expect(toast(page)).toContainText("Note saved");

  // Escape clears the box and keeps nothing.
  await page.getByRole("button", { name: "Quick note" }).click();
  await noteBox(page).locator("textarea").fill("Never mind");
  await noteBox(page).getByRole("button", { name: "Escape" }).click();
  await page.getByRole("button", { name: "Quick note" }).click();
  await expect(noteBox(page).locator("textarea")).toHaveValue("");
  await page.keyboard.press("Escape");

  await nav(page, "Notes");
  await reveal(page);
  await expect(page.locator(".note-card").first()).toContainText("Forgot his calculator again");
  await expect(page.locator(".note-card", { hasText: "Never mind" })).toHaveCount(0);
});

test("ending the lesson throws away unsent drafts", async ({ page }) => {
  await nav(page, "Lesson");
  await page.getByRole("button", { name: "Start lesson" }).click();
  await page.getByRole("button", { name: "Quick note" }).click();
  await noteBox(page).locator("textarea").fill("Half a thought");
  await noteBox(page).getByRole("button", { name: "Draft" }).click();
  await expect(page.getByRole("button", { name: "Quick note (draft)" })).toBeVisible();

  await page.getByRole("button", { name: "End lesson" }).click();
  await expect(page.locator(".modal")).toContainText("1 unsent note draft is thrown away");
  await page.locator(".modal button.primary").click();
  await expect(page.getByRole("button", { name: "Quick note", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quick note", exact: true }).click();
  await expect(noteBox(page).locator("textarea")).toHaveValue("");
});

test("a detailed note in sections shows in the timeline and, by section, beside a tagged quick note", async ({ page }) => {
  await nav(page, "Notes");
  await reveal(page);
  await page.getByRole("button", { name: "Detailed note" }).click();
  const box = noteBox(page);
  await box.locator("select").first().selectOption({ label: "Ben Hughes" });
  await box.locator(".note-section", { hasText: "Work ethic" }).locator("textarea").fill("Works steadily and checks his answers.");
  await box.locator(".note-section", { hasText: "Behaviour" }).locator("textarea").fill("Quiet; joins in when asked.");
  await box.getByRole("button", { name: "Save" }).click();
  const card = page.locator(".note-card.detailed", { hasText: "Ben Hughes" });
  await expect(card).toContainText("Works steadily");
  await expect(card).toContainText("Quiet; joins in");

  await page.getByRole("button", { name: "Quick note" }).click();
  await noteBox(page).locator("select").selectOption({ label: "Ben Hughes" });
  await noteBox(page).locator("textarea").fill("Helped his partner with the graph.");
  await noteBox(page).getByRole("button", { name: "Behaviour" }).click();
  await noteBox(page).getByRole("button", { name: "Submit" }).click();

  await page.getByRole("combobox", { name: "Whose notes" }).selectOption({ label: "Ben Hughes" });
  await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "By section" }).click();
  const behaviour = page.locator(".note-group", { hasText: "Behaviour" });
  await expect(behaviour.locator("li")).toHaveCount(2);
  await expect(behaviour).toContainText("Helped his partner");
  await expect(behaviour).toContainText("Quiet; joins in");
  await expect(page.locator(".note-group", { hasText: "Work ethic" })).toContainText("Works steadily");
});

test("Form F fills in what the app knows, saves as a note, and prints as the form", async ({ page }) => {
  await nav(page, "Notes");
  await reveal(page);
  await page.getByRole("button", { name: "Form F" }).click();
  const box = noteBox(page);
  await box.locator("select").first().selectOption({ label: "Chloe Owen" });
  const field = (label: string) => box.locator(".formf-row", { hasText: label }).locator("input");
  await expect(field("Candidate's name")).toHaveValue("Chloe Owen");
  await expect(field("Grade")).toHaveValue("G07");
  await expect(field("Subject")).toHaveValue("Science");
  await field("applied for").fill("Extra time (25%)");
  await box.getByRole("button", { name: /^Yes: Does the learner understand/ }).click();
  await box.getByRole("button", { name: /^N\/A: Is handwriting legible/ }).click();
  await box.getByRole("button", { name: "Save and print" }).click();

  const form = page.locator(".formf-portal");
  await expect(form).toBeVisible();
  await expect(form.locator(".formf-table").first()).toContainText("Extra time (25%)");
  await expect(form.locator(".formf-ticks tr", { hasText: "understand what they have read" }).locator("td").nth(0)).toHaveText("✓");
  await expect(form.locator(".formf-ticks tr", { hasText: "handwriting legible" }).locator("td").nth(2)).toHaveText("✓");
  await form.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".note-card.formF", { hasText: "Chloe Owen" })).toContainText("2 of 11 answered");
});

test("renaming a section renames it in the notes", async ({ page }) => {
  await nav(page, "Notes");
  await reveal(page);
  await page.getByRole("combobox", { name: "Whose notes" }).selectOption({ label: "Amelia Adams" });
  const input = page.getByRole("textbox", { name: "Section Behaviour" });
  await input.fill("Conduct");
  await input.press("Enter");
  await expect(page.locator(".note-card").first()).toContainText("Conduct");
  await expect(page.locator(".note-card", { hasText: "Behaviour" })).toHaveCount(0);
});
