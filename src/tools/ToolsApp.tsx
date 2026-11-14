import { useEffect, useState } from "react";
import { useApp, useAppPick } from "../store/appStore";
import { useTheme } from "../store/theme";
import { ThemeChoice } from "../lib/theme";
import { TimerPreset } from "../lib/types";
import { webTools } from "../plugins/registry";
import { PluginPane } from "../components/PluginView";
import Overlays from "../components/Overlays";
import Segmented from "../components/Segmented";
import Icon from "../components/Icon";
import { PRESETS_KEY, parsePresets, toolFromHash, toolHash } from "./routing";

// The tools website: the teaching tools on their own, in any browser, with no
// installer and no class data (`npm run build:tools`; see docs/development.md).
//
// It is the same code as the desktop app's tools. The app's store is started
// the way demo mode starts it (in memory, nothing on disk), so a tool's
// toasts, dialogs and pop-ups work unchanged; the demo class is never shown.
// Each tool has an address of its own (…/#/galvanic-cell) to bookmark or share.

const TOOLS = webTools();

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match this device" },
];

function readPresets(): TimerPreset[] | null {
  try {
    return parsePresets(localStorage.getItem(PRESETS_KEY));
  } catch {
    return null;
  }
}

export default function ToolsApp() {
  const { view, activePlugin, openPlugin, setView, boot } = useAppPick("view", "activePlugin", "openPlugin", "setView", "boot");
  const themeChoice = useTheme((t) => t.choice);
  const setThemeChoice = useTheme((t) => t.setChoice);
  const [ready, setReady] = useState(false);

  // Start the store, switch every tool on, and bring back this browser's timer presets.
  useEffect(() => {
    let live = true;
    void (async () => {
      await boot();
      if (!live) return;
      const presets = readPresets();
      useApp.setState((s) => ({
        userPrefs: { ...s.userPrefs, enabledPlugins: TOOLS.map((t) => t.id) },
        ...(presets ? { timerPresets: presets } : {}),
      }));
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [boot]);

  // There is no data folder here, so the test timer's presets stay in this browser.
  useEffect(() => {
    if (!ready) return;
    return useApp.subscribe((s, before) => {
      if (s.timerPresets === before.timerPresets) return;
      try {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(s.timerPresets));
      } catch {
        // Not remembered; the presets still work until the page closes.
      }
    });
  }, [ready]);

  // The address follows the open tool, and the open tool follows the address
  // (a bookmark, a shared link, the browser's Back).
  useEffect(() => {
    if (!ready) return;
    const follow = () => {
      const id = toolFromHash(location.hash, TOOLS);
      if (id) openPlugin(id);
      else setView("home");
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [ready, openPlugin, setView]);

  const tool = view === "plugin" ? TOOLS.find((t) => t.id === activePlugin) : undefined;

  useEffect(() => {
    if (!ready) return;
    const want = toolHash(tool?.id ?? null);
    if (location.hash !== want) history.pushState(null, "", want || location.pathname + location.search);
    document.title = tool ? `${tool.name} — ClassKernel tools` : "ClassKernel tools";
  }, [ready, tool]);

  if (!ready) return <div className="boot-screen">Loading…</div>;

  return (
    <div className="app-shell tools-site">
      <div className="app-body">
        <header className="top-bar no-print">
          {tool && (
            <button className="icon-btn" onClick={() => setView("home")} aria-label="Back to all tools" title="Back to all tools">
              <Icon name="arrow_back" />
            </button>
          )}
          <h1 className="top-bar-title">{tool ? tool.name : "ClassKernel tools"}</h1>
        </header>
        <main className="main-pane">
          {tool ? (
            <PluginPane key={tool.id} plugin={tool} />
          ) : (
            <>
              <p className="muted lead">
                Teaching tools from ClassKernel, to open on any computer. Nothing is uploaded or saved online; pictures
                you save are downloaded to this device.
              </p>
              <div className="home-grid">
                {TOOLS.map((t) => (
                  <button key={t.id} className="tool-card" onClick={() => openPlugin(t.id)}>
                    <span className="tool-icon" aria-hidden>
                      <Icon name={t.icon} size={26} />
                    </span>
                    <span className="tool-text">
                      <b>{t.name}</b>
                      <span className="muted">{t.tagline}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="tools-site-foot">
                <Segmented options={THEME_OPTIONS} value={themeChoice} onChange={setThemeChoice} label="Colours" small />
              </div>
            </>
          )}
        </main>
      </div>
      <Overlays />
    </div>
  );
}
