import { describe, expect, it } from "vitest";
import { PLUGINS, webTools } from "../plugins/registry";
import { parsePresets, toolFromHash, toolHash } from "./routing";

describe("the tools website", () => {
  it("leaves out the tools that need a class's records", () => {
    const ids = webTools().map((t) => t.id);
    expect(ids).not.toContain("class-dashboards");
    expect(ids).not.toContain("parent-reports");
    expect(ids).toHaveLength(PLUGINS.length - 2);
    expect(ids).toContain("galvanic-cell");
  });

  it("reads a tool from the address and writes it back", () => {
    const tools = webTools();
    expect(toolFromHash("#/galvanic-cell", tools)).toBe("galvanic-cell");
    expect(toolFromHash("#galvanic-cell", tools)).toBe("galvanic-cell");
    expect(toolFromHash(toolHash("clock"), tools)).toBe("clock");
    expect(toolHash(null)).toBe("");
  });

  it("shows the list for an empty, unknown or desktop-only address", () => {
    const tools = webTools();
    expect(toolFromHash("", tools)).toBeNull();
    expect(toolFromHash("#/no-such-tool", tools)).toBeNull();
    expect(toolFromHash("#/class-dashboards", tools)).toBeNull();
  });

  it("keeps only well-formed timer presets", () => {
    const good = { name: "Test", readingMinutes: 10, writingMinutes: 60, display: "circle", chime: true };
    expect(parsePresets(JSON.stringify([good, { name: "Broken" }, null]))).toEqual([good]);
    expect(parsePresets(null)).toBeNull();
    expect(parsePresets("not json")).toBeNull();
    expect(parsePresets('{"name":"x"}')).toBeNull();
  });
});
