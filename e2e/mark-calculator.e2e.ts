import { Page } from "@playwright/test";
import { expect, nav, reveal, test } from "./fixtures";

// The calculator beside the marks: shown and hidden from the marking toolbar
// (remembered on this computer), and its answer put into a mark box.

const openMarking = async (page: Page, title: string) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: title }).getByRole("button", { name: "Enter marks" }).click();
  await reveal(page);
};
const toggle = (page: Page) => page.getByRole("button", { name: "Calculator", exact: true });
const calculator = (page: Page) => page.getByRole("complementary", { name: "Calculator" });

test("the calculator shows and hides from the marking toolbar, and stays as it was left", async ({ page }) => {
  await openMarking(page, "Mid-term exam");
  await expect(calculator(page)).toHaveCount(0);
  await toggle(page).click();
  await expect(calculator(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await calculator(page).getByRole("button", { name: "Hide the calculator" }).click();
  await expect(calculator(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");

  // Left showing, it is there next time, on the question grid too.
  await toggle(page).click();
  await page.getByRole("button", { name: "Done" }).click();
  await openMarking(page, "Forces & energy test");
  await expect(calculator(page)).toBeVisible();
  await page.reload();
  await openMarking(page, "Forces & energy test");
  await expect(calculator(page)).toBeVisible();
});

test("adds up a paper and puts the answer in the mark box last typed in", async ({ page }) => {
  await openMarking(page, "Mid-term exam");
  const rows = page.locator(".quick-mark-row");
  // The demo leaves one student without a mark.
  const i = await rows.evaluateAll((els) => els.findIndex((e) => !e.classList.contains("done")));
  const row = rows.nth(i);
  const name = (await row.locator(".name").textContent())!.replace(/^\d+\.\s*/, "");
  await row.locator("input.mark-input").focus();
  await toggle(page).click();
  const calc = calculator(page);
  await expect(calc).toContainText(`Goes into: Mark for ${name}`);

  // Its keys...
  for (const key of ["2", "×", "3"]) await calc.getByRole("button", { name: key, exact: true }).click();
  await expect(calc.locator(".calc-answer")).toHaveText("= 6");
  await calc.getByRole("button", { name: "Clear" }).click();
  await expect(calc.getByRole("textbox", { name: "Sum" })).toHaveValue("");

  // ...or the keyboard, which carries on in the sum after a key is clicked.
  await calc.getByRole("button", { name: "1", exact: true }).click();
  await page.keyboard.type("8+15+14,5");
  await expect(calc.locator(".calc-answer")).toHaveText("= 47,5");

  await calc.getByRole("button", { name: "Put in mark" }).click();
  const box = row.locator("input.mark-input");
  await expect(box).toHaveValue("47,5");
  await expect(box).toBeFocused();
  await expect(row).toHaveClass(/\bdone\b/);
  await expect(calc.getByRole("textbox", { name: "Sum" })).toHaveValue("");
  await expect(page.locator(".view-header")).toContainText(`${await rows.count()}/${await rows.count()} entered`);
});

test("Enter in the sum shows the answer in its place, ready to carry on", async ({ page }) => {
  await openMarking(page, "Mid-term exam");
  await toggle(page).click();
  const sum = calculator(page).getByRole("textbox", { name: "Sum" });
  await sum.fill("34/50*100");
  await sum.press("Enter");
  await expect(sum).toHaveValue("68");
});

test("in the question grid, a put-in answer is capped at the question's marks, as a typed one is", async ({ page }) => {
  await openMarking(page, "Forces & energy test");
  const rows = page.locator(".mark-grid tbody tr");
  const i = await rows.evaluateAll((els) => els.findIndex((e) => !e.classList.contains("done")));
  const cell = rows.nth(i).locator("input.grid-input").first();
  await cell.fill("");
  await toggle(page).click();
  const calc = calculator(page);
  await expect(calc).toContainText("Goes into: Q1 for");
  // Q1 is out of 6.
  await calc.getByRole("textbox", { name: "Sum" }).fill("4+5");
  await calc.getByRole("button", { name: "Put in mark" }).click();
  await expect(cell).toHaveValue("6");
  await expect(cell).toBeFocused();
});

test("the read-only View of a test has no calculator", async ({ page }) => {
  await nav(page, "Marks");
  await page.locator("tr", { hasText: "Forces & energy test" }).getByRole("button", { name: "View" }).click();
  await reveal(page);
  await expect(page.locator(".mark-grid")).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
});
