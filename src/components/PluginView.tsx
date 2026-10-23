import { Component, ReactNode, Suspense, lazy, useMemo } from "react";
import { useAppPick } from "../store/appStore";
import { PluginManifest, enabledPlugins, pluginById } from "../plugins/registry";
import Icon from "./Icon";

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
          unaffected — switch the tool off under Settings → Tools if it keeps happening.
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
  const { activePlugin, userPrefs, setView } = useAppPick("activePlugin", "userPrefs", "setView");
  const plugin = activePlugin ? pluginById(activePlugin) : undefined;
  const on = !!plugin && enabledPlugins(userPrefs.enabledPlugins).some((p) => p.id === plugin.id);

  if (!plugin || !on) {
    return (
      <div>
        <div className="panel muted">
          {plugin
            ? `"${plugin.name}" is switched off. Turn it back on under Settings → Tools.`
            : "That tool isn't part of this version of the app."}
          <div className="row button-row">
            <button onClick={() => setView("home")}>
              <Icon name="arrow_back" size={20} /> Home
            </button>
            <button onClick={() => setView("settings")}>Open Settings</button>
          </div>
        </div>
      </div>
    );
  }

  return <PluginPane key={plugin.id} plugin={plugin} />;
}

// The app bar above carries the plugin's name and the way back to Home.
function PluginPane({ plugin }: { plugin: PluginManifest }) {
  // lazy() wants a module; the manifest hands back the component itself.
  const View = useMemo(() => lazy(() => plugin.load().then((c) => ({ default: c }))), [plugin]);

  return (
    <div className="plugin-view">
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
