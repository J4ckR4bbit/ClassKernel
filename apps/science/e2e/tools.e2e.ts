import { expect, openTool, test } from "./fixtures";

// Each science tool clicked through on the website, as a teacher would at the board.

test("graph tools: graph paper saves a PNG, the plotter takes readings, the motion graph its choices", async ({ page }) => {
  await openTool(page, "Graph paper generator");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG…" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);

  await openTool(page, "Practical graph plotter");
  const remove = page.getByRole("button", { name: "Remove this reading" });
  // The tool loads on demand: count its rows once they are there.
  await expect(remove.first()).toBeVisible();
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

test("galvanic cell: the reading follows the half-cells and the salt bridge, question mode hides it", async ({ page }) => {
  await openTool(page, "Galvanic cell animator");
  const memo = page.locator(".gc-memo");
  await expect(memo).toContainText("Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s)");
  await expect(memo).toContainText("+1,10 V");
  // Silver instead of copper: E°cell = 0,80 − (−0,76).
  await page.locator("main select").nth(1).selectOption("ag");
  await expect(memo).toContainText("+1,56 V");
  await expect(memo).toContainText("2Ag⁺(aq) + Zn(s) → 2Ag(s) + Zn²⁺(aq)");
  // No salt bridge: the EMF stands, the voltmeter reads 0.
  await page.getByLabel("Salt bridge in place").uncheck();
  await expect(memo).toContainText("no salt bridge, no circuit");
  await page.getByLabel("Salt bridge in place").check();
  // Question mode hides the memo.
  await page.getByLabel(/Question mode/).check();
  await expect(memo).toHaveCount(0);
  await expect(page.locator(".gc-hidden")).toBeVisible();
  await page.getByLabel(/Question mode/).uncheck();
  // Running the cell lowers the EMF; Reset puts it back.
  await page.getByRole("button", { name: "Run the cell" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(memo).not.toContainText("+1,560 V", { timeout: 10_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(memo).toContainText("+1,560 V");
  // A PNG of the picture.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG…" }).click();
  expect((await download).suggestedFilename()).toBe("galvanic_cell_zn_ag.png");
});

test("chemistry reference: the periodic table, its views and highlights, and an element's pop-up", async ({ page }) => {
  await openTool(page, "Chemistry reference");
  await expect(page.locator(".pt-cell.shown")).toHaveCount(118);
  await expect(page.locator(".pt-cell[data-z='17'] .pt-mass")).toHaveText("35,5");
  await expect(page.locator(".pt-cell[data-z='17'] .pt-en")).toHaveText("3,0");
  // Iron: configuration in filling order, and ferromagnetic.
  await page.locator(".pt-cell[data-z='26']").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶");
  await expect(dialog).toContainText("[Ar] 4s² 3d⁶");
  await expect(dialog).toContainText("Ferromagnetic");
  await expect(dialog).toContainText("1 538 °C");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Highlight the diatomic elements: seven lit, the rest dimmed.
  await page.locator("main .chip", { hasText: "Diatomic" }).click();
  await expect(page.locator(".pt-cell.mark-diatomic")).toHaveCount(7);
  await expect(page.locator(".pt-cell.shown.dim")).toHaveCount(111);
  await page.locator("main .chip", { hasText: "Diatomic" }).click();
  // The simplified table: the first 20 and the extras.
  await page.locator("main .seg button", { hasText: "Simplified" }).click();
  await expect(page.locator(".pt-cell.shown")).toHaveCount(40);
  await expect(page.locator(".pt-cell[data-z='92']")).toHaveClass(/shown/);
  await expect(page.locator(".pt-cell[data-z='57']")).toHaveCount(0);
});

test("chemistry reference: substances show their bonds, enthalpies and polarity", async ({ page }) => {
  await openTool(page, "Chemistry reference");
  await page.locator("main .md-tab", { hasText: "Substances & bonds" }).click();
  const detail = page.locator(".sub-detail");
  await expect(detail).toContainText("Water");
  await expect(detail).toContainText("18 g·mol⁻¹");
  await expect(page.locator(".sub-bonds")).toContainText("O–H");
  await expect(page.locator(".sub-bonds")).toContainText("464");
  await expect(page.locator(".mol text", { hasText: "δ−" })).toHaveCount(1);
  await expect(page.locator(".mol text", { hasText: "δ+" })).toHaveCount(2);
  await page.getByLabel("Show δ+ and δ−").uncheck();
  await expect(page.locator(".mol text", { hasText: "δ−" })).toHaveCount(0);
  // An ionic salt: ions drawn, the lattice row.
  await page.getByRole("option", { name: "CuSO₄ Copper(II) sulfate", exact: true }).click();
  await expect(detail).toContainText("159,6 g·mol⁻¹");
  await expect(page.locator(".sub-bonds")).toContainText("Ionic bond (lattice)");
  await expect(page.locator(".sub-ion-bracket")).toHaveCount(1);
  // Organic: ethanoic acid's bonds and the total.
  await page.locator("main .seg button", { hasText: /^Organic$/ }).click();
  await page.locator("main .chip", { hasText: "Carboxylic acids" }).click();
  await page.getByRole("option", { name: "CH₃COOH Ethanoic acid", exact: true }).click();
  await expect(detail).toContainText("60 g·mol⁻¹");
  await expect(page.locator(".sub-total")).toContainText("3 153");
});

test("chemistry reference: polyatomic ions open a pop-up with the Lewis diagram and the solubility rule", async ({ page }) => {
  await openTool(page, "Chemistry reference");
  await page.locator("main .md-tab", { hasText: "Polyatomic ions" }).click();
  await expect(page.locator(".ion-card")).toHaveCount(32);
  await page.locator("main .chip", { hasText: "Syllabus table" }).click();
  await expect(page.locator(".ion-card.extra")).toHaveCount(0);
  await page.locator(".ion-card[data-ion='sulfate']").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sulfate");
  await expect(dialog).toContainText("32 valence electrons");
  await expect(dialog).toContainText("white precipitate of BaSO₄");
  // Two oxygens carry the −1 formal charge, the sulfur none.
  await expect(dialog.locator(".mol text", { hasText: /^−$/ })).toHaveCount(2);
  await dialog.locator(".seg button", { hasText: "Bonds only" }).click();
  await expect(dialog.locator(".mol text", { hasText: /^−$/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("chemistry reference: quiz, data sheet and equations", async ({ page }) => {
  await openTool(page, "Chemistry reference");
  // Quiz: four choices, tapping one reveals the answer and counts the score.
  await page.locator("main .md-tab", { hasText: "Quiz" }).click();
  await expect(page.locator(".quiz-option")).toHaveCount(4);
  await page.locator(".quiz-option").first().click();
  await expect(page.locator(".quiz-option.right")).toHaveCount(1);
  await expect(page.locator(".quiz-score")).toContainText("/ 1");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(page.locator(".quiz-option.right")).toHaveCount(0);
  // Data sheet: two rows make the Zn / Cu cell.
  await page.locator("main .md-tab", { hasText: "Data sheet" }).click();
  await expect(page.locator(".ds-table tbody tr")).toHaveCount(48);
  await page.locator(".ds-table tr[data-id='zn']").click();
  await page.locator(".ds-table tr[data-id='cu2']").click();
  await expect(page.locator(".ds-cell")).toContainText("+1,10 V");
  await expect(page.locator(".ds-cell")).toContainText("Zn → Zn²⁺ + 2e⁻");
  await page.getByLabel("Search the table").fill("mno");
  await expect(page.locator(".ds-table tbody tr")).toHaveCount(2);
  // Equations: the propane example, then a typed one, then question mode.
  await page.locator("main .md-tab", { hasText: "Equations" }).click();
  await expect(page.locator(".eq-balanced")).toHaveText("C₃H₈ + 5O₂ → 3CO₂ + 4H₂O");
  await expect(page.locator(".eq-types")).toContainText("combustion");
  await page.locator("#eq-text").fill("Fe + O2 -> Fe2O3");
  await expect(page.locator(".eq-balanced")).toHaveText("4Fe + 3O₂ → 2Fe₂O₃");
  await expect(page.locator(".eq-types")).toContainText("Fe oxidised: 0 → +3");
  await page.getByLabel(/Question mode/).check();
  await expect(page.locator(".eq-balanced")).toHaveCount(0);
  await page.getByRole("button", { name: /Reveal the balanced equation/ }).click();
  await expect(page.locator(".eq-balanced")).toHaveText("4Fe + 3O₂ → 2Fe₂O₃");
});

test("titration: measured additions move the burette and the pH, the indicator turns, the memo knows the end point", async ({ page }) => {
  await openTool(page, "Titration simulator");
  const reading = page.locator(".ti-readout", { hasText: "Burette reading" }).locator(".ti-readout-value");
  const ph = page.locator(".ti-readout", { hasText: /^pH/ }).locator(".ti-readout-value");
  await expect(reading).toHaveText("0,00 cm³");
  await expect(ph).toHaveText("1,00");
  await expect(page.locator(".ti-memo")).toContainText("25,00 cm³ of NaOH, pH 7,00 at equivalence");
  // 5 × 5 cm³ reaches the equivalence point exactly: phenolphthalein is still about to turn.
  for (let i = 0; i < 5; i++) await page.locator(".ti-add button", { hasText: "+5,00" }).click();
  await expect(reading).toHaveText("25,00 cm³");
  await expect(ph).toHaveText("7,00");
  await page.locator(".ti-add button", { hasText: "+0,50" }).click();
  await expect(reading).toHaveText("25,50 cm³");
  await expect(ph).toHaveText(/^1[0-2],/);
  // Record a reading; it appears in the table.
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.locator(".ti-readings tbody tr")).toHaveCount(1);
  // Refill, swap to ammonia in the flask against HCl: the memo moves the end point below 7.
  await page.getByRole("button", { name: /Refill/ }).click();
  await expect(reading).toHaveText("0,00 cm³");
  await page.getByLabel("Solution in the flask").selectOption("nh3");
  await page.getByLabel("Solution in the burette").selectOption("hcl");
  await expect(page.locator(".ti-memo")).toContainText("pH 5,2");
  // Unknown mode hides the equivalence.
  await page.getByLabel(/Unknown: hide/).check();
  await expect(page.locator(".ti-memo")).toContainText("Hidden");
});
