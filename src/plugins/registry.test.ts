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

describe("plugin views", () => {
  it("loads a component for every plugin in the catalogue", async () => {
    for (const p of PLUGINS) {
      const View = await p.load();
      // React components are functions here; a module namespace or a stray
      // default export would break the lazy() in PluginView.
      expect(typeof View).toBe("function");
    }
  });
});
