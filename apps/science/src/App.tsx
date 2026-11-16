import { Component, ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@classkernel/ui/Icon";
import Segmented from "@classkernel/ui/Segmented";
import { ThemeChoice } from "@classkernel/ui/theme";
import { TOOLS, ToolManifest, toolById } from "./catalogue";
import { toolFromHash, toolHash } from "./routing";
import { useTheme } from "./theme";
import { Toasts } from "./toast";

// ClassKernel Science: the science teaching tools, in any browser, with no
// installer and nothing saved online. Each tool has an address of its own
// (…/#/galvanic-cell) to bookmark or share, and the browser's Back and Forward
// move between the list and the tool.

export const SITE_NAME = "ClassKernel Science";

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match this device" },
];

/** Keeps a broken tool to itself: a message in its pane instead of a blank page. */
class ToolBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Tool crashed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel muted">
          <b>{this.props.name}</b> stopped working: {this.state.error.message}. Go back to the list and open it again.
        </div>
      );
    }
    return this.props.children;
  }
}

function ToolPane({ tool }: { tool: ToolManifest }) {
  // lazy() wants a module; the manifest hands back the component itself.
  const View = useMemo(() => lazy(() => tool.load().then((c) => ({ default: c }))), [tool]);
  return (
    <div className="plugin-view">
      <div className="plugin-body">
        <ToolBoundary name={tool.name}>
          <Suspense fallback={<div className="plugin-loading muted">Loading {tool.name}…</div>}>
            <View />
          </Suspense>
        </ToolBoundary>
      </div>
    </div>
  );
}

export default function App() {
  // Read from the address before the first screen, so arriving by a tool's
  // link adds nothing to the history (Back leaves the site, as it should).
  const [openId, setOpenId] = useState<string | null>(() => toolFromHash(location.hash, TOOLS));
  const themeChoice = useTheme((t) => t.choice);
  const setThemeChoice = useTheme((t) => t.setChoice);

  // The open tool follows the address (Back and Forward, an address typed by hand)…
  useEffect(() => {
    const follow = () => setOpenId(toolFromHash(location.hash, TOOLS));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  const tool = openId ? toolById(openId) : undefined;

  // …and the address follows the open tool. Tidying an address that named no
  // tool on the way in replaces it rather than adding a step to Back.
  const first = useRef(true);
  useEffect(() => {
    const want = toolHash(tool?.id ?? null);
    if (location.hash !== want) {
      const url = want || location.pathname + location.search;
      if (first.current) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    }
    first.current = false;
    document.title = tool ? `${tool.name} — ${SITE_NAME}` : SITE_NAME;
  }, [tool]);

  return (
    <div className="app-shell science-site">
      <div className="app-body">
        <header className="top-bar no-print">
          {tool && (
            <button className="icon-btn" onClick={() => setOpenId(null)} aria-label="Back to all tools" title="Back to all tools">
              <Icon name="arrow_back" />
            </button>
          )}
          <h1 className="top-bar-title">{tool ? tool.name : SITE_NAME}</h1>
        </header>
        <main className="main-pane">
          {tool ? (
            <ToolPane key={tool.id} tool={tool} />
          ) : (
            <>
              <p className="muted lead">
                Science teaching tools for the board, to open on any computer. Nothing is uploaded or saved online;
                pictures you save are downloaded to this device.
              </p>
              <div className="home-grid">
                {TOOLS.map((t) => (
                  <button key={t.id} className="tool-card" onClick={() => setOpenId(t.id)}>
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
              <div className="science-site-foot">
                <Segmented options={THEME_OPTIONS} value={themeChoice} onChange={setThemeChoice} label="Colours" small />
              </div>
            </>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
