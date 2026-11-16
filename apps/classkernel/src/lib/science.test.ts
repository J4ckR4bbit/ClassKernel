import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLUGINS } from "../plugins/registry";
import { MOVED_TO_SCIENCE, SCIENCE_SITE_URL, movedToolNames, scienceUrl } from "./science";

describe("the science tools' move to the website", () => {
  it("lists only tools that no longer ship in ClassKernel", () => {
    const shipping = new Set(PLUGINS.map((p) => p.id));
    for (const t of MOVED_TO_SCIENCE) expect(shipping.has(t.id)).toBe(false);
  });

  it("names the moved tools a teacher had switched on, and ignores the rest", () => {
    expect(movedToolNames(["test-timer", "titration", "graph-paper"])).toEqual(["Titration simulator", "Graph paper generator"]);
    expect(movedToolNames(["test-timer", "clock"])).toEqual([]);
    expect(movedToolNames([])).toEqual([]);
  });

  it("links to the website, or straight to one tool on it", () => {
    expect(SCIENCE_SITE_URL).toMatch(/^https:\/\/.+\/$/);
    expect(scienceUrl()).toBe(SCIENCE_SITE_URL);
    expect(scienceUrl("galvanic-cell")).toBe(`${SCIENCE_SITE_URL}#/galvanic-cell`);
  });

  it("matches the website's own catalogue, so a link to a moved tool lands on it", () => {
    const catalogue = readFileSync(new URL("../../../science/src/catalogue.ts", import.meta.url), "utf8");
    const ids = [...catalogue.matchAll(/^    id: "([a-z0-9-]+)",$/gm)].map((m) => m[1]);
    expect(ids.sort()).toEqual(MOVED_TO_SCIENCE.map((t) => t.id).sort());
  });
});
