import { useAppPick } from "../../store/appStore";
import { PLUGINS, togglePluginId } from "../../plugins/registry";
import Icon from "../Icon";

/**
 * Plugins: extra teaching tools that ship inside the app but stay off until
 * they're switched on here. The choice is app-wide (settings.csv) and the
 * enabled ones show up under Tools on the Home page.
 */
export default function PluginSettings() {
  const { userPrefs, setUserPrefs, openPlugin } = useAppPick("userPrefs", "setUserPrefs", "openPlugin");
  const enabled = userPrefs.enabledPlugins;

  const toggle = (id: string) =>
    void setUserPrefs({ ...userPrefs, enabledPlugins: togglePluginId(enabled, id) });

  return (
    <div className="panel">
      <h3>Tools</h3>
      <p className="muted lead">
        Extra tools that come with ClassKernel. Everything ships switched off, so the app stays exactly as it is until
        you turn something on — then it appears under <b>Tools</b> on the Home page. They are part of the app, so they
        work offline and save files through the same dialog as an export.
      </p>

      {PLUGINS.length === 0 ? (
        <p className="muted tail">
          This version of the app doesn't ship any tools yet.
        </p>
      ) : (
        <ul className="plugin-list">
          {PLUGINS.map((p) => {
            const on = enabled.includes(p.id);
            return (
              <li key={p.id} className="plugin-row">
                <label className="plugin-toggle" htmlFor={`plugin-${p.id}`}>
                  <span className="plugin-icon" aria-hidden>
                    <Icon name={p.icon} />
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <div className="muted">{p.description}</div>
                  </span>
                </label>
                {on && (
                  <button className="small" onClick={() => openPlugin(p.id)}>
                    Open
                  </button>
                )}
                <input
                  id={`plugin-${p.id}`}
                  type="checkbox"
                  className="switch"
                  checked={on}
                  onChange={() => toggle(p.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
