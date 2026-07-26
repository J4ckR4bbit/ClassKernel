# Plugins

A plugin is an extra teaching tool that **ships with the app but is off until a
teacher switches it on** in *Settings → Plugins*. Enabled plugins appear as
cards in a **Tools** section on the Home page; nothing else about the app
changes when one is off.

The point of the format is that a tool can be written as an ordinary standalone
HTML page — the kind you can double-click in a browser — and dropped in here
without being rewritten as React.

## The shape of a plugin

One self-contained HTML document. Everything inline: no `<script src>`, no
`<link rel=stylesheet>`, no fonts or images fetched over the network. The app is
offline-first and the plugin runs in a frame with no origin, so an external
request would simply fail.

The page runs in `<iframe sandbox="allow-scripts allow-modals allow-downloads">`
with `srcDoc`. That means:

- scripts, `<canvas>`, `alert`/`confirm` and blob URLs all work;
- there is **no** `localStorage`, no cookies and no access to the app's data
  folder or to any class data;
- the only channel to the app is `postMessage` (below).

A plugin that needs class data is the wrong shape for this format — build it as
a normal view against the store instead.

## Registering it

Drop the file in `src/plugins/<your-plugin>/` and add an entry to `PLUGINS` in
`registry.ts`:

```ts
{
  id: "graph-paper",              // stable — it is written into settings.csv
  name: "Graph paper generator",
  tagline: "Build printable axes and grids at an exact mm size.",
  description: "…what it does, and what it saves.",
  icon: "📐",
  load: () => import("./graph-paper/graph-paper.html?raw").then((m) => m.default),
}
```

That is the whole registration. `load` is a dynamic import, so each plugin sits
in its own chunk and costs nothing until it is opened.

Never change an `id` after release: the enabled list in `settings.csv` is keyed
by it, so a rename reads as "switched off" on every machine that had it on.

## Saving files

The sandbox cannot write to disk, so the plugin hands the finished bytes to the
app, which opens a native *save as* dialog (or downloads the file when running
in a browser without the desktop backend):

```js
parent.postMessage({
  type: "classkernel:save-file",
  name: "graph_paper_10x8.png",   // suggested file name
  extension: "png",               // for the dialog's file filter
  label: "PNG image",             // human name for that filter
  bytes: uint8Array,              // the file itself
}, "*");
```

The app always answers, so the plugin can report the outcome:

```js
window.addEventListener("message", (e) => {
  if (e.data?.type === "classkernel:save-result") {
    // e.data.ok      → true when the file was written
    // e.data.message → "Saved to …", "Save cancelled", or the error
  }
});
```

Keep the page working on its own too: if `window.parent === window` there is no
host, so fall back to an ordinary `<a download>` — that is how the graph paper
plugin does it, and it keeps the file testable by opening it directly.

## Where the pieces live

| File | What it does |
| --- | --- |
| `registry.ts` | The catalogue: one manifest per plugin. |
| `src/components/PluginView.tsx` | The frame, the chrome and the save bridge. |
| `src/components/SettingsView.tsx` | The Plugins tab where they are switched on. |
| `src/components/HomeView.tsx` | The Tools section listing the enabled ones. |
| `settings.csv` (`plugins_enabled`) | The teacher's choice, as a `;`-separated list of ids. |
