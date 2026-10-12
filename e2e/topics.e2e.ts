import { expect, nav, settingsTab, test } from "./fixtures";

// Settings → Assessments: the topic bank by grade. Grades can share one list,
// and a grade can be deleted. The demo class is grade 7 with its own topics.

test("a new grade can share another grade's topics, then be deleted", async ({ page }) => {
  await settingsTab(page, "Assessments");
  const grade = page.getByRole("combobox", { name: "Grade", exact: true });
  await expect(grade).toHaveValue("7");

  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await page.locator(".modal input").fill("8");
  await page.locator(".modal button.primary").click();
  await expect(grade).toHaveValue("8");

  // G08 has no subtopics of its own yet, so it shares without asking.
  await page.getByLabel("Same topics as:").selectOption("7");
  await expect(page.locator(".topic-shared-note")).toContainText("One list for G07 and G08");
  await expect(page.locator(".topic-table input[value='Forces']")).toBeVisible();

  // A subtopic added on G08 is on G07's list too.
  await page.locator(".topic-area", { hasText: "Physics" }).locator(".topic-add-row input").first().fill("Waves");
  await page.locator(".topic-area", { hasText: "Physics" }).locator(".topic-add-row input").first().press("Enter");
  await grade.selectOption("7");
  await expect(page.locator(".topic-shared-note")).toContainText("One list for G07 and G08");
  await expect(page.locator(".topic-table input[value='Waves']")).toBeVisible();

  // Deleting G08 leaves G07's list alone.
  await grade.selectOption("8");
  await page.getByRole("button", { name: "Delete grade" }).click();
  await expect(page.locator(".modal h2")).toHaveText("Delete grade G08?");
  await page.locator(".modal button.danger").click();
  await expect(grade.locator("option")).toHaveText(["G07"]);
  await expect(page.locator(".topic-shared-note")).toHaveCount(0);
  await expect(page.locator(".topic-table input[value='Waves']")).toBeVisible();
});

test("deleting a grade a class still has says so", async ({ page }) => {
  await settingsTab(page, "Assessments");
  await page.getByRole("button", { name: "Delete grade" }).click();
  await expect(page.locator(".modal")).toContainText("7B-Science still has this grade");
  await page.locator(".modal button", { hasText: "Cancel" }).click();
  await expect(page.locator(".topic-table input[value='Forces']")).toBeVisible();
});

test("a class whose grade shares a list tags questions from it", async ({ page }) => {
  await settingsTab(page, "Assessments");
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await page.locator(".modal input").fill("8");
  await page.locator(".modal button.primary").click();
  await page.getByRole("button", { name: "Content area", exact: true }).click();
  await page.locator(".modal input").fill("Astronomy");
  await page.locator(".modal button.primary").click();

  // Grade 7 (the demo class) switches to G08's list; its own subtopics go, so it asks first.
  await page.getByRole("combobox", { name: "Grade", exact: true }).selectOption("7");
  await page.getByLabel("Same topics as:").selectOption("8");
  await expect(page.locator(".modal h2")).toHaveText("Use G08's topics?");
  await page.locator(".modal button.danger").click();
  await expect(page.locator(".topic-area", { hasText: "Astronomy" })).toBeVisible();

  await nav(page, "Marks");
  await page.getByRole("button", { name: "New assessment" }).click();
  await expect(page.locator(".modal select").first().locator("option", { hasText: "Astronomy" })).toHaveCount(1);
});
