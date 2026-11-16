import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS, toolById } from "./catalogue";
import { toolFromHash, toolHash } from "./routing";

describe("the catalogue", () => {
  it("gives every tool a unique slug for an id and the text the home page needs", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOOLS) {
      expect(t.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.tagline.length).toBeGreaterThan(0);
      expect(toolById(t.id)).toBe(t);
    }
  });

  it("lists every tool folder, so none is left unreachable", () => {
    const folders = readdirSync(new URL("./tools", import.meta.url), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    // The chemistry reference lives in chemistry/.
    const expected = TOOLS.map((t) => (t.id === "chemistry-reference" ? "chemistry" : t.id));
    expect(folders.sort()).toEqual(expected.sort());
  });

  it("loads a component for every tool", async () => {
    for (const t of TOOLS) {
      const View = await t.load();
      expect(typeof View).toBe("function");
    }
  });
});

describe("addresses", () => {
  it("reads a tool from the address and writes it back", () => {
    expect(toolFromHash("#/galvanic-cell", TOOLS)).toBe("galvanic-cell");
    expect(toolFromHash("#galvanic-cell", TOOLS)).toBe("galvanic-cell");
    expect(toolFromHash(toolHash("titration"), TOOLS)).toBe("titration");
    expect(toolHash(null)).toBe("");
  });

  it("shows the list for an empty or unknown address, or a tool that stayed in ClassKernel", () => {
    expect(toolFromHash("", TOOLS)).toBeNull();
    expect(toolFromHash("#/no-such-tool", TOOLS)).toBeNull();
    expect(toolFromHash("#/test-timer", TOOLS)).toBeNull();
  });
});
