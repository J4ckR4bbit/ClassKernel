import { describe, expect, it } from "vitest";
import { PLUGINS, enabledPlugins, pluginById, togglePluginId } from "./registry";

describe("plugin catalogue", () => {
  it("gives every plugin a unique, stable-looking id and the text the UI needs", () => {
    const ids = PLUGINS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLUGINS) {
      // Ids end up in settings.csv, so keep them to a plain slug.
      expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(pluginById(p.id)).toBe(p);
    }
  });

  it("lists only enabled plugins, in catalogue order, ignoring ids it doesn't know", () => {
    const ids = PLUGINS.map((p) => p.id);
    expect(enabledPlugins([]).length).toBe(0);
    expect(enabledPlugins(["not-a-plugin"]).length).toBe(0);
    expect(enabledPlugins([...ids].reverse()).map((p) => p.id)).toEqual(ids);
  });

  it("toggles one id at a time without disturbing the rest", () => {
    expect(togglePluginId([], "a")).toEqual(["a"]);
    expect(togglePluginId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePluginId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("plugin documents", () => {
  it("ships each plugin as a self-contained offline page", async () => {
    for (const p of PLUGINS) {
      const html = await p.load();
      expect(html.trim().slice(0, 15).toLowerCase()).toBe("<!doctype html>");
      // The frame has no origin and the app is offline-first: a plugin that
      // reaches for the network would simply fail at a teacher's desk.
      expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/i);
      expect(html).not.toMatch(/\b(fetch\(|XMLHttpRequest|importScripts)\b/);
    }
  });
});
