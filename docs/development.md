# Development

[← Contents](README.md)

## The repository

Two apps and the look they share, as npm workspaces with one `npm install` at the top:

| Folder | What it is |
| --- | --- |
| `apps/classkernel/` | **ClassKernel**, the classroom manager: a Windows desktop app (Tauri 2). Its React front end is in `src/`, the Rust shell in `src-tauri/`, browser tests in `e2e/`, the release and screenshot scripts in `scripts/`. |
| `apps/science/` | **ClassKernel Science**, the science teaching tools. One set of pages, used twice: built into ClassKernel for its Science window, and published as a static website (GitHub Pages). Each tool is in `src/tools/<tool>/`, listed in `src/catalogue.ts`. |
| `packages/ui/` | **@classkernel/ui**, what both use: the colour scheme and base styles (`src/styles/base.css`), icons, `Modal`, `Segmented`, the theme logic, classroom number formatting, fonts. Each app imports it as `@classkernel/ui/<name>` (the list is `exports` in its `package.json`). |
| `docs/` | Both apps' documentation and the guide's pictures. |

A change to the shared look goes in `packages/ui` and reaches both apps at once. Where an app needs something of its
own, it stays in that app: ClassKernel's store, toasts and Tauri window handling never reach the website, which has
a small toast and theme store of its own.

## Prerequisites

- **Node.js 22** (what CI uses) and npm.
- For ClassKernel's desktop app: **Rust** (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
  — on Windows, the WebView2 runtime; on Linux, `webkit2gtk`.

## Commands

From the top of the repository:

```bash
npm install
npm run dev               # ClassKernel in a browser, with an in-memory demo class (no Rust needed)
npm run dev:science       # ClassKernel Science in a browser
npm test                  # every unit test: both apps and the shared package (Vitest)
npm run typecheck         # TypeScript, everywhere
npm run build             # both apps: apps/classkernel/dist and apps/science/dist
npm run test:e2e          # both apps' browser tests: each is built and clicked through in Chromium
npm run tauri dev         # the full desktop app (for its Science window, also run npm run dev:science)
npm run tauri build       # the Windows installer, in apps/classkernel/src-tauri/target/release/bundle/nsis/
```

One app at a time: `npm run <script> -w classkernel` or `-w classkernel-science` (or run `npm run <script>`
inside its folder). The screenshots are per app, each from its own folder: `npm run docs:screenshots`.
`node apps/classkernel/scripts/gen-icons.mjs` regenerates the desktop app's icons.

The first time you run the browser tests or the screenshots, install the browser with
`npx playwright install chromium`.

## Demo mode

Outside the desktop app (`npm run dev`, the browser tests, the screenshots) there is no file system, so the app
starts in **demo mode**: `apps/classkernel/src/lib/demo.ts` seeds an in-memory data folder with one class, *7B-Science* — 24 students,
a room of double desks, four weeks of attendance, behaviour, trips outside and ended lessons, a topic bank, and four
assessments including one marked per question. A banner says so; nothing is saved.

Open it with `?simulate=folder-missing` (and optionally `&wait=<seconds>`) to try what happens when the data folder
isn't there at launch: the demo folder is copied to "this computer's copy" and hidden. In the browser console,
`__ckDemo.folderBack()` brings it back, and `__ckDemo.editOnDrive(path, text)` changes a file in it meanwhile, as
another computer would (`src/lib/demoMissingFolder.ts`, used by `e2e/offline.e2e.ts`).

## How ClassKernel fits together

Paths below are inside `apps/classkernel/`.

| Layer | Where | Notes |
| --- | --- | --- |
| UI | `src/components/` | React + TypeScript, built with Vite. Material Design 3 styling: the shared base in `packages/ui/src/styles/base.css` (colours named by meaning in its `:root`, with dark values under `:root[data-theme="dark"]` for the screen only, so printing stays light, and the navy-and-gold scheme's roles under `:root[data-palette="navy"]` (and with `[data-theme="dark"]`)), then ClassKernel's own `src/styles.css`; the theme choice lives in `@classkernel/ui/theme` and `store/theme.ts`; each tool's own styles beside it in `src/plugins/`; dialogs share `@classkernel/ui/Modal`; icons in `@classkernel/ui/Icon`. Settings has a folder of its own (`components/settings/`, one file per tab or panel), as do the Marks screens (`components/marks/`). Charts with Recharts, Markdown with marked. |
| State | `src/store/appStore.ts` | One Zustand store: the open class's data, preferences, navigation, dialogs and toasts. Every setter saves to disk straight away. |
| Hooks | `src/hooks/` | The live lesson (`useLessonSession`), batch entry and the animated seat shuffle, shared by the room plan and the side panel. |
| Domain logic | `src/lib/` | Pure, unit-tested modules: `seating.ts` (seat assigner), `stats.ts` (marks, weighting, ranks) and `insights.ts` (dashboards, reports, written summaries), `lessons.ts` (seating insights), `exporter.ts` + `xlsx.ts` (spreadsheet export, with a small built-in `.xlsx` writer instead of a dependency), `markSheet.ts` and `rosterSheet.ts` (marks and class-list templates and their import, read by the built-in `xlsxRead.ts`), `format.ts` (SA number formatting), `time.ts` (UTC storage, zone display), `pin.ts`, `privacy.ts`. |
| Storage | `src/lib/repo.ts`, `src/lib/csv.ts`, `src/lib/fs.ts` | `repo.ts` maps everything onto the `.csv` / `.md` files (see [Data file reference](data-files.md)). `fs.ts` is either the Tauri backend or an in-memory file system for demo mode, wrapped in `MirrorFS` (repeats each save in this computer's copy) and `QueuedFS` (writes to one file in order, a burst collapsed, behind the launch backup). |
| This computer's copy | `src/lib/offline.ts`, `src/lib/merge.ts` | When the data folder isn't there at launch: the boot decision, working from the copy, and copying the changes back with a 3-way, row-by-row join (`FILE_RULES` in `repo.ts` says how each file joins). |
| Tools | `src/plugins/` | Optional tools, compiled in and lazily loaded, switched on in Settings → Tools. See [`src/plugins/README.md`](../apps/classkernel/src/plugins/README.md) to add one. `lib/science.ts` opens ClassKernel Science (the `open_science_window` command in the desktop app, the website in the browser demo) and lists the ids of the tools that moved there. |
| Science window | `src-tauri/src/windows_app.rs`, `src-tauri/src/launch.rs`, `capabilities/science.json` | Neither window is made by `tauri.conf.json` (`"create": false`): `setup` opens ClassKernel, or only ClassKernel Science when started with `--science`, and a second launch reaches the running copy (single-instance plugin), which opens or raises the window it asked for. Science loads `science/index.html` from ClassKernel's own pages — `npm run build` builds `apps/science` into `dist/science/` — or, under `tauri dev`, Science's dev server on port 1430. It has its own icon (`icons/science.png`) and, on Windows, its own AppUserModelID and relaunch command, so it gets a taskbar button of its own and a pin starts Science. Its capability allows only the save dialog, full screen, the title-bar theme and showing the window. |
| Installer | `src-tauri/windows/hooks.nsh` | Hooks into Tauri's NSIS template: after a normal install (not an update, a passive or silent install, or when it's already there) it asks whether to also install ClassKernel Science and, on Yes, makes its Start menu and desktop shortcuts (`ClassKernel.exe --science`, `science.ico`, Science's AppUserModelID); the uninstaller removes them. `scripts/gen-icons.mjs` draws both apps' icons. |
| Desktop shell | `src-tauri/` | Minimal Rust (Tauri 2): `read_text`, `read_text_opt`, `write_atomic`, `write_binary`, `path_exists`, `mkdirs`, `list_dir`, `rename_path`, `snapshot_backup` (which also refreshes this computer's copy), and `copy_folder` / `remove_local` (only inside the app's own local folder), all on the blocking pool; the file operations are in `fsops.rs` with tests (`rustc --edition 2021 --test apps/classkernel/src-tauri/src/fsops.rs`, likewise `backup_policy.rs`, `links.rs` and `launch.rs`; CI runs all four). Plus the dialog plugin for folder and save-as pickers, and the single-instance plugin so a second launch focuses the open window. The window opens hidden (`tauri.conf.json`) and the page shows it once its first screen is drawn and the window is painted in the theme's colours (`store/theme.ts`), so a dark theme never flashes white; `lib.rs` shows it anyway after 4 s if the page never gets that far. A strict CSP (`default-src 'self'`); the page makes no network requests. A link that leads out of the app (in a class's notes) is opened in the computer's browser instead of in the window (`links.rs`, with the `open` crate). The updater plugin (Rust side) fetches the release list and installer from GitHub, only when asked (`lib/updates.ts`, Settings → General → Updates). |

## How ClassKernel Science fits together

Paths below are inside `apps/science/`. It's a plain static site with relative addresses, so the same pages work
from any folder of a web server and from ClassKernel's own pages: `npm run build` writes `dist/` (the website), and
`npm run build:desktop` writes `../classkernel/dist/science/` (ClassKernel's `npm run build` runs it). `.github/workflows/science-site.yml` publishes it to GitHub
Pages from `main`, at the address ClassKernel's Science button opens (`SCIENCE_SITE_URL` in
`apps/classkernel/src/lib/science.ts`; change both together).

| Part | Where | Notes |
| --- | --- | --- |
| Shell | `src/App.tsx`, `src/routing.ts` | The list of tools, and each tool at its own `#/<id>` address, kept in step with Back and Forward. An error boundary keeps a broken tool to its own pane. |
| Tools | `src/tools/<tool>/`, `src/catalogue.ts` | One folder per tool, logic split from the view as in ClassKernel's plugins (the maths is unit-tested in Node). Add a tool by adding its folder and a line to the catalogue; a test fails if a folder isn't listed. Ids are addresses: never rename one, they're bookmarked and ClassKernel links to them. |
| Helpers | `src/lib/` | `png.ts` (a canvas as a 300 dpi PNG, sized so Word inserts it at its true size), `scale.ts` (axis scales on round values), `save.ts` (a download), `fullscreen.ts` (Show to class). |
| Theme, toasts | `src/theme.ts`, `src/toast.tsx` | Light / Dark / Match this device, remembered by the browser; a short message after a save. |
| In the desktop app | `src/lib/desktop.ts` | In ClassKernel's Science window, saving uses the Windows *Save as* dialog and ClassKernel's `write_binary`, Show to class fills the screen with the window, the title bar follows the theme (which is ClassKernel's own setting there), and the page shows the window once drawn. Each falls back to the browser's way if the app refuses. `e2e/desktop.e2e.ts` checks the commands with the desktop bridge stood in. |

Design points worth keeping:

- **Plain files, written atomically.** Every write goes to a temporary file and is renamed over the original, so a
  sync client never sees half a file. `snapshot_backup` copies the data folder into `backups/` at each launch and
  keeps the newest 14.
- **UTC on disk, the chosen zone on screen.** Timestamps are stored as ISO 8601 UTC; `time.ts` shows them in the
  zone from Settings.
- **Privacy first.** Screens with individual data sit behind `PrivacyGate`, which re-arms on every navigation.
- **Per-computer conveniences in `localStorage`**: the data-folder path, the rail state, the once-per-lesson seat
  lock, the lesson start and the picker's no-repeat list (`src/lib/lessonState.ts`).

## Releases and updates

Tagging `v<major>.<minor>.<patch>` builds the installer with that version and attaches it to a GitHub release.
Installed copies find it through `latest.json` on the newest release (`apps/classkernel/scripts/latest-json.mjs` writes it), and
only accept an installer signed with this project's update key:

- The **public** key is in `apps/classkernel/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
- The **private** key is the repository secret `TAURI_SIGNING_PRIVATE_KEY` (with
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has one). Keep a copy somewhere safe: without it, installed
  copies can never be updated again and everyone has to reinstall by hand. To start over, run
  `npx tauri signer generate`, put the new public key in `tauri.conf.json` and the new private key in the secret.
- Without the secret, CI still builds an installer (with a warning); it just can't be offered as an update.

Builds from a branch are numbered `<major>.<minor>.<run number>` from the version in `tauri.conf.json`, so give a
release a higher major or minor than that file has, or copies installed from a branch build won't see it as newer.

This signing is Tauri's own and is free. It is separate from a Windows code-signing certificate, which is what
would stop the SmartScreen warning when the installer is first run; the project doesn't have one.

## Tests

- **Unit tests** — `src/**/*.test.ts` in each app and the shared package, run by Vitest in Node: CSV round-trips,
  the seat assigner, stats and insights, the spreadsheet export, the seat lock, the PIN, table grouping, time zones
  and the science tools' maths (the motion graphs are checked by differentiating the position and integrating the
  velocity back). One test walks the whole repository for file names that differ only in case, which Windows
  can't tell apart. They run in CI.
- **Browser tests** — `apps/<app>/e2e/*.e2e.ts`, run by Playwright. ClassKernel's run against the built app in demo
  mode, with a fresh demo class for every test and a fake microphone for the noise meter. They cover every page and
  Settings tab, a lesson from register to End lesson, marking (including the row highlighting), each tool and the
  Science button. ClassKernel Science's click through the built website: the list, the addresses, and each tool.
  Both fail if anything reaches the browser console as an error. They run in CI beside the installer build (a failure shows on the pull request but doesn't stop the
  installer).

## The user-guide screenshots

The pictures in [`docs/images/`](images/) come from each app's `scripts/screenshots/`: Playwright scripts that drive
the built app in demo mode, or the built website (at the desktop app's default 1280 × 800 window, in a South
African locale and time zone) and save full-screen shots and close-ups of the buttons the guides describe. Re-run it after a change to the
interface so the guide keeps matching the app:

```bash
cd apps/classkernel && npm run docs:screenshots   # ClassKernel's pictures
cd apps/science && npm run docs:screenshots       # the science tools'
```

Each reuses a preview server already running on its port (4173, 4174), or builds and starts one. The committed images were then
reduced to 256 colours to keep the repository small; that step is optional (any PNG optimiser, e.g. `pngquant`,
does it).

## CI and releases

`.github/workflows/build.yml` runs on every push and pull request: every unit test and both production builds on
Ubuntu, both apps' browser tests, then ClassKernel's Windows NSIS installer on `windows-latest`, uploaded as a build
artifact. Pushing a tag `v*` also attaches the `.exe` to a GitHub release; tags and releases are ClassKernel's only.
`.github/workflows/science-site.yml` publishes ClassKernel Science to GitHub Pages on every push to `main`.
