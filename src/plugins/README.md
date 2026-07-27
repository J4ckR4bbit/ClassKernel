# Plugins

A plugin is an extra teaching tool that **ships with the app but is off until a
teacher switches it on** in *Settings → Plugins*. Enabled plugins appear as
cards in a **Tools** section on the Home page; nothing else about the app
changes when one is off.

## The shape of a plugin

**An ordinary React view, compiled into the app and loaded on demand.** It gets
the app's stylesheet, the app's store, and the same audited Rust file commands
as every other view.

> **Why not a standalone HTML page in an iframe?** That was the first design and
> it does not survive contact with the desktop build. The app ships a strict
> CSP (`default-src 'self'` — see `src-tauri/tauri.conf.json`), so the inline
> `<script>` that a self-contained HTML tool is made of never runs: the page
> loads, renders its controls, and sits there dead. Loosening the CSP to fix one
> tool would weaken the whole app, and a sandboxed frame can't reach the file
> commands anyway. Porting the tool to a component costs an afternoon and gets
> the app's look, its save dialog and its tests for free.

## Writing one

Put it in `src/plugins/<your-plugin>/` and export a default component that takes
no props:

```tsx
export default function MyTool() {
  return <div className="panel">…</div>;
}
```

Two conventions worth keeping to:

- **Split the logic out of the component.** The graph paper keeps its geometry
  and PNG encoding in `drawing.ts` and only the UI in `GraphPaper.tsx`, so the
  maths is unit-tested in Node without a browser.
- **Don't let two files differ only in case.** `GraphPaper.tsx` beside a
  `graphPaper.ts` builds here and fails on Windows, where they are the same
  name. A test in `registry.test.ts` guards the whole of `src/` against it.
- **Use the app's classes** — `panel`, `row`, `muted`, `primary`, `small` — so
  the tool looks like the rest of ClassKernel rather than a foreign page.

## Registering it

Add an entry to `PLUGINS` in `registry.ts`:

```ts
{
  id: "graph-paper",              // stable — it is written into settings.csv
  name: "Graph paper generator",
  tagline: "Build printable axes and grids at an exact mm size.",
  description: "…what it does, and what it saves.",
  icon: "📐",
  load: () => import("./graph-paper/GraphPaper").then((m) => m.default),
}
```

That is the whole registration. `load` is a dynamic import, so each plugin sits
in its own chunk and costs nothing until it is opened.

Never change an `id` after release: the enabled list in `settings.csv` is keyed
by it, so a rename reads as "switched off" on every machine that had it on.

## Saving files

Use the host helper rather than reaching for the filesystem yourself. It opens
the native *save as* dialog on the desktop and falls back to a browser download
in demo mode, and it never throws:

```ts
import { savePluginFile } from "../host";

const outcome = await savePluginFile({
  name: "graph_paper_10x8.png",   // suggested file name
  extension: "png",               // for the dialog's file filter
  label: "PNG image",             // human name for that filter
  bytes,                          // Uint8Array
});
// outcome.ok      → true when the file was written
// outcome.message → "Saved to …", "Save cancelled", or the error
```

## What the app does around your view

- **Lazy loading** with a "Loading …" fallback while the chunk arrives.
- **An error boundary** per plugin: a crash shows a message inside the pane
  instead of blanking the app mid-lesson.
- **The header** — back to Home, the icon, the name and the tagline. Your
  component starts below that and gets the rest of the pane; it is laid out with
  `height: 100%` available, so a two-column tool can fill it.

## Where the pieces live

| File | What it does |
| --- | --- |
| `registry.ts` | The catalogue: one manifest per plugin. |
| `host.ts` | The save helper (native dialog / download). |
| `src/components/PluginView.tsx` | Lazy loading, the error boundary, the chrome. |
| `src/components/SettingsView.tsx` | The Plugins tab where they are switched on. |
| `src/components/HomeView.tsx` | The Tools section listing the enabled ones. |
| `settings.csv` (`plugins_enabled`) | The teacher's choice, as a `;`-separated list of ids. |
