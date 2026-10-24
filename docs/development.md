# Development

[← Contents](README.md)

## Prerequisites

- **Node.js 22** (what CI uses) and npm.
- For the desktop app: **Rust** (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
  — on Windows, the WebView2 runtime; on Linux, `webkit2gtk`.

## Commands

```bash
npm install
npm run dev               # the UI in a browser, with an in-memory demo class (no Rust needed)
npm test                  # unit tests (Vitest)
npm run test:e2e          # browser tests: builds the app and clicks through it in Chromium
npm run docs:screenshots  # retakes the user-guide pictures into docs/images/
npm run tauri dev         # the full desktop app
npm run tauri build       # the Windows installer (NSIS .exe) in src-tauri/target/release/bundle/nsis/
node scripts/gen-icons.mjs  # regenerates the app icons
```

The first time you run the browser tests or the screenshots, install the browser with
`npx playwright install chromium`.

## Demo mode

Outside the desktop app (`npm run dev`, the browser tests, the screenshots) there is no file system, so the app
starts in **demo mode**: `src/lib/demo.ts` seeds an in-memory data folder with one class, *7B-Science* — 24 students,
a room of double desks, four weeks of attendance, behaviour, bathroom trips and ended lessons, a topic bank, and four
assessments including one marked per question. A banner says so; nothing is saved.

Open it with `?simulate=folder-missing` (and optionally `&wait=<seconds>`) to try what happens when the data folder
isn't there at launch: the demo folder is copied to "this computer's copy" and hidden. In the browser console,
`__ckDemo.folderBack()` brings it back, and `__ckDemo.editOnDrive(path, text)` changes a file in it meanwhile, as
another computer would (`src/lib/demoMissingFolder.ts`, used by `e2e/offline.e2e.ts`).

## How it fits together

| Layer | Where | Notes |
| --- | --- | --- |
| UI | `src/components/` | React + TypeScript, built with Vite. Material Design 3 styling in `src/styles.css` (colours named by meaning in its `:root`, with dark values under `:root[data-theme="dark"]` for the screen only, so printing stays light; the theme choice lives in `lib/theme.ts` and `store/theme.ts`; each tool's own styles beside it in `src/plugins/`); dialogs share `components/Modal.tsx`; icons in `components/Icon.tsx`. Settings has a folder of its own (`components/settings/`, one file per tab or panel), as do the Marks screens (`components/marks/`). Charts with Recharts, Markdown with marked. |
| State | `src/store/appStore.ts` | One Zustand store: the open class's data, preferences, navigation, dialogs and toasts. Every setter saves to disk straight away. |
| Hooks | `src/hooks/` | The live lesson (`useLessonSession`), batch entry and the animated seat shuffle, shared by the room plan and the side panel. |
| Domain logic | `src/lib/` | Pure, unit-tested modules: `seating.ts` (seat assigner), `stats.ts` (marks, weighting, ranks) and `insights.ts` (dashboards, reports, written summaries), `lessons.ts` (seating insights), `exporter.ts` + `xlsx.ts` (spreadsheet export, with a small built-in `.xlsx` writer instead of a dependency), `markSheet.ts` and `rosterSheet.ts` (marks and class-list templates and their import, read by the built-in `xlsxRead.ts`), `format.ts` (SA number formatting), `time.ts` (UTC storage, zone display), `pin.ts`, `privacy.ts`. |
| Storage | `src/lib/repo.ts`, `src/lib/csv.ts`, `src/lib/fs.ts` | `repo.ts` maps everything onto the `.csv` / `.md` files (see [Data file reference](data-files.md)). `fs.ts` is either the Tauri backend or an in-memory file system for demo mode, wrapped in `MirrorFS` (repeats each save in this computer's copy) and `QueuedFS` (writes to one file in order, a burst collapsed, behind the launch backup). |
| This computer's copy | `src/lib/offline.ts`, `src/lib/merge.ts` | When the data folder isn't there at launch: the boot decision, working from the copy, and copying the changes back with a 3-way, row-by-row join (`FILE_RULES` in `repo.ts` says how each file joins). |
| Tools | `src/plugins/` | Optional tools, compiled in and lazily loaded, switched on in Settings → Tools. See [`src/plugins/README.md`](../src/plugins/README.md) to add one. |
| Desktop shell | `src-tauri/` | Minimal Rust (Tauri 2): `read_text`, `read_text_opt`, `write_atomic`, `write_binary`, `path_exists`, `mkdirs`, `list_dir`, `rename_path`, `snapshot_backup` (which also refreshes this computer's copy), and `copy_folder` / `remove_local` (only inside the app's own local folder), all on the blocking pool; the file operations are in `fsops.rs` with tests (`rustc --edition 2021 --test src-tauri/src/fsops.rs`). Plus the dialog plugin for folder and save-as pickers, and the single-instance plugin so a second launch focuses the open window. The window opens hidden (`tauri.conf.json`) and the page shows it once its first screen is drawn and the window is painted in the theme's colours (`store/theme.ts`), so a dark theme never flashes white; `lib.rs` shows it anyway after 4 s if the page never gets that far. A strict CSP (`default-src 'self'`); the app makes no network requests. |

Design points worth keeping:

- **Plain files, written atomically.** Every write goes to a temporary file and is renamed over the original, so a
  sync client never sees half a file. `snapshot_backup` copies the data folder into `backups/` at each launch and
  keeps the newest 14.
- **UTC on disk, the chosen zone on screen.** Timestamps are stored as ISO 8601 UTC; `time.ts` shows them in the
  zone from Settings.
- **Privacy first.** Screens with individual data sit behind `PrivacyGate`, which re-arms on every navigation.
- **Per-computer conveniences in `localStorage`**: the data-folder path, the rail state, the once-per-lesson seat
  lock, the lesson start and the picker's no-repeat list (`src/lib/lessonState.ts`).

## Tests

- **Unit tests** — `src/**/*.test.ts`, run by Vitest in Node: CSV round-trips, the seat assigner, stats and
  insights, the spreadsheet export, the seat lock, the PIN, table grouping, time zones and the tools' maths (the
  motion graphs are checked by differentiating the position and integrating the velocity back). They run in CI.
- **Browser tests** — `e2e/*.e2e.ts`, run by Playwright against the built app in demo mode, with a fresh demo
  class for every test and a fake microphone for the noise meter. They cover every page and Settings tab, a lesson
  from register to End lesson, marking (including the row highlighting) and each tool, and fail if anything reaches
  the browser console as an error. Run them after changing the interface; they aren't part of CI.

## The user-guide screenshots

The pictures in [`docs/images/`](images/) come from `scripts/screenshots/`: a Playwright script that drives the
built app in demo mode (at the desktop app's default 1280 × 800 window, in a South African locale and time zone)
and saves full-screen shots and close-ups of the buttons the guide describes. Re-run it after a change to the
interface so the guide keeps matching the app:

```bash
npm run docs:screenshots
```

It reuses a preview server already running on port 4173, or builds and starts one. The committed images were then
reduced to 256 colours to keep the repository small; that step is optional (any PNG optimiser, e.g. `pngquant`,
does it).

## CI and releases

`.github/workflows/build.yml` runs on every push and pull request: the unit tests and a production build on Ubuntu,
then the Windows NSIS installer on `windows-latest`, uploaded as a build artifact. Pushing a tag `v*` also attaches
the `.exe` to a GitHub release.
