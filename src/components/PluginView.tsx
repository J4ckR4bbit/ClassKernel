import { Component, ReactNode, Suspense, lazy, useMemo } from "react";
import { useApp } from "../store/appStore";
import { PluginManifest, enabledPlugins, pluginById } from "../plugins/registry";

/**
 * Keeps a broken plugin to itself. Without this, one bad render would blank the
 * whole app mid-lesson; with it, the teacher gets a message and the rest of
 * ClassKernel carries on.
 */
class PluginBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Plugin crashed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel muted">
          <b>{this.props.name}</b> stopped working: {this.state.error.message}. Everything else in ClassKernel is
          unaffected — switch the plugin off under Settings → Plugins if it keeps happening.
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Runs one plugin full-pane, with the app's chrome around it.
 *
 * Plugins are compiled into the app rather than loaded from disk: they are
 * ordinary views, styled like the rest of ClassKernel, and they save files
 * through the same Rust commands (see src/plugins/host.ts).
 */
export default function PluginView() {
  const { activePlugin, userPrefs, setView } = useApp();
  const plugin = activePlugin ? pluginById(activePlugin) : undefined;
  const on = !!plugin && enabledPlugins(userPrefs.enabledPlugins).some((p) => p.id === plugin.id);

  if (!plugin || !on) {
    return (
      <div>
        <div className="view-header">
          <h1>Plugin</h1>
        </div>
        <div className="panel muted">
          {plugin
            ? `"${plugin.name}" is switched off. Turn it back on under Settings → Plugins.`
            : "That plugin isn't part of this version of the app."}
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={() => setView("home")}>← Home</button>
            <button onClick={() => setView("settings")}>Open Settings</button>
          </div>
        </div>
      </div>
    );
  }

  return <PluginPane key={plugin.id} plugin={plugin} onHome={() => setView("home")} />;
}

function PluginPane({ plugin, onHome }: { plugin: PluginManifest; onHome: () => void }) {
  // lazy() wants a module; the manifest hands back the component itself.
  const View = useMemo(() => lazy(() => plugin.load().then((c) => ({ default: c }))), [plugin]);

  return (
    <div className="plugin-view">
      <div className="view-header">
        <button onClick={onHome}>← Home</button>
        <h1>
          <span aria-hidden style={{ marginRight: 8 }}>
            {plugin.icon}
          </span>
          {plugin.name}
        </h1>
        <span className="muted plugin-tagline">{plugin.tagline}</span>
      </div>

      <div className="plugin-body">
        <PluginBoundary name={plugin.name}>
          <Suspense fallback={<div className="plugin-loading muted">Loading {plugin.name}…</div>}>
            <View />
          </Suspense>
        </PluginBoundary>
      </div>
    </div>
  );
}
