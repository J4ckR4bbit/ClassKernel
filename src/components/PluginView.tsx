import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { getFS, isTauri } from "../lib/fs";
import { PluginManifest, enabledPlugins, pluginById } from "../plugins/registry";

/** A save request from a plugin frame (see src/plugins/README.md). */
interface SaveRequest {
  name: string;
  extension: string;
  label: string;
  bytes: Uint8Array;
}

/** Read a save request out of an untrusted message, or null if it isn't one. */
function parseSaveRequest(data: unknown): SaveRequest | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== "classkernel:save-file") return null;
  // postMessage deserialises into this window, so a real Uint8Array arrives as one.
  if (!(msg.bytes instanceof Uint8Array)) return null;
  // Plugins suggest a file name; they don't get to choose a path.
  const base = String(msg.name ?? "file").split(/[\\/]/).pop() || "file";
  const name = base.replace(/[<>:"|?*\x00-\x1f]/g, "_").slice(0, 120);
  const extension = String(msg.extension ?? name.split(".").pop() ?? "bin").replace(/[^A-Za-z0-9]/g, "");
  return { name, extension, label: String(msg.label ?? "File"), bytes: msg.bytes };
}

/** Hand the file to the browser as a download (demo mode — no desktop backend). */
function downloadInBrowser(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Runs one plugin: a self-contained HTML page in a sandboxed frame, with the
 * app's chrome around it and a save bridge across the sandbox boundary.
 *
 * The frame gets `allow-scripts allow-modals allow-downloads` but deliberately
 * not `allow-same-origin`, so the page has no origin: no access to the data
 * folder, the store, localStorage or the network. Saving a file is the one thing
 * it can ask the app to do on its behalf.
 */
export default function PluginView() {
  const { activePlugin, userPrefs, setView, showToast } = useApp();
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

  // Keyed so switching plugins remounts the frame with a fresh document.
  return <PluginFrame key={plugin.id} plugin={plugin} onHome={() => setView("home")} showToast={showToast} />;
}

function PluginFrame({
  plugin,
  onHome,
  showToast,
}: {
  plugin: PluginManifest;
  onHome: () => void;
  showToast: (message: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    plugin
      .load()
      .then((source) => {
        if (!cancelled) setHtml(source);
      })
      .catch((e) => {
        console.error(`Plugin failed to load: ${plugin.id}`, e);
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [plugin]);

  // The save bridge. Only messages from this plugin's own frame are honoured.
  useEffect(() => {
    const reply = (ok: boolean, message: string) =>
      frameRef.current?.contentWindow?.postMessage({ type: "classkernel:save-result", ok, message }, "*");

    const onMessage = (e: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const req = parseSaveRequest(e.data);
      if (!req) return;
      void (async () => {
        try {
          if (!isTauri()) {
            downloadInBrowser(req.name, req.bytes);
            reply(true, `Downloaded ${req.name}`);
            return;
          }
          const path = await getFS().pickSaveFile(req.name, req.extension, req.label);
          if (!path) {
            reply(false, "Save cancelled");
            return;
          }
          await getFS().writeBinary(path, req.bytes);
          reply(true, `Saved to ${path}`);
          showToast(`Saved ${req.name}`);
        } catch (err) {
          console.error("Plugin save failed", err);
          reply(false, `Could not save the file: ${err}`);
        }
      })();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showToast]);

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

      {error ? (
        <div className="panel muted">This plugin couldn't be loaded: {error}</div>
      ) : (
        <div className="plugin-frame-wrap">
          {html === null ? (
            <div className="plugin-loading muted">Loading {plugin.name}…</div>
          ) : (
            <iframe
              ref={frameRef}
              className="plugin-frame"
              title={plugin.name}
              srcDoc={html}
              // No allow-same-origin: the page runs with no origin and no reach
              // into the app's data. Downloads/modals are for standalone use.
              sandbox="allow-scripts allow-modals allow-downloads"
            />
          )}
        </div>
      )}
    </div>
  );
}
