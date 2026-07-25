# ClassKernel

Fast, lightweight, offline-first classroom management for teachers. Windows desktop app built with Tauri 2 — instant startup, **no server, and no internet required**. Optionally, it can sync to your Google Drive.

## Getting it

Currently distributed as a standalone **Windows installer (`.exe`)** — grab the latest from the [Releases](../../releases) page and run it. On first launch you pick a folder to keep your data in, and choose whether to keep everything on this PC only or also sync it to Google Drive. The local-only option needs no account and nothing configured.

## What it does

- **Home** — every class as a card on the landing page, with one-tap **Randomise seating** or **Live lesson** to start a lesson fast.
- **Students** — roster per class with flags (SEN, medical, …) and notes; bulk import by pasting a list of names.
- **Attendance register** — one-tap Present / Absent / Late / Excused per lesson, with running rates and history per student.
- **Room layout designer** — drag-and-drop desks (singles, doubles, group tables, teacher desk, doors, windows, free-text label boxes) onto a snap-to-grid canvas; rotate, recolour, resize, label, duplicate. Put the front of the room on any edge, scale the seat/desk/label text, set a **view crop** so seating views zoom to just the used part of the room, and **save a layout as a template** to reuse in another class.
- **Seating plans** — multiple named plans per class. Seat students by hand, or press **Randomise** for an animated reroll: students are spread evenly across desks (front desks filled first) honouring your rules — keep-apart pairs, keep-together pairs, front-of-room pins. Those rules live in Settings, out of sight of the class, so all students see is the shuffle. Print any plan for cover teachers.
- **Live lesson** — the seating plan *is* the interface. Every seat shows the student and their running points for the lesson; tap a seat to log positive/negative behaviours (fully customisable buttons) or mark attendance. Reshuffle with **Randomise**, or switch to **Teaching mode** — a distraction-free, chrome-free view that fits beside your slides/notes. **End lesson** saves each student's seat and behaviour to the class history.
- **Seating insights** — from that saved history: how often each student has sat at each desk, which desk they behave best/worst at, and which pairings turn disruptive (one click to add them to the keep-apart list).
- **Assessments** — build tests as a single mark or broken into questions, each tagged with a **topic** (from a per-grade topic bank) and a cognitive level. Enter marks in a keyboard-first grid, then analyse everything on a dashboard: class means, mark distributions, per-student trends vs class average, attendance-vs-performance, at-risk flags, and per-topic breakdowns.
- **Test timer** — a big countdown for exams and timed tasks, with optional reading + writing phases, a chime at phase changes, and three display styles (countdown circle, hourglass, or flip clock). Save reusable presets and go fullscreen.

## Where your data lives

Everything is stored as plain **`.csv` and `.md` files** in one folder you choose:

```
ClassroomData/
  behaviours.csv                 # your behaviour buttons (shared across classes)
  topics.csv                     # assessable topics by grade
  cognitive_levels.csv           # question cognitive-level list
  settings.csv                   # app-wide preferences
  timer_presets.csv              # saved test-timer presets
  layouts/<name>/                # reusable room templates (desks.csv + room.csv)
  classes/7B-Science/
    class.md                     # class details + free-form notes
    students.csv
    attendance.csv
    behaviour.csv                # logged behaviour events
    desks.csv                    # room layout geometry (colours, sizes, label boxes)
    room.csv                     # front-of-room edge, view crop, text sizes
    seating.csv                  # named seating plans
    seating_prefs.csv            # keep-apart / keep-together / front rules
    lessons.csv                  # per-lesson seat + behaviour history (for insights)
    assessments.csv
    assessment_questions.csv     # per-question topic + cognitive level
    question_marks.csv           # per-question marks
    marks.csv                    # total marks per assessment
  backups/                       # automatic snapshots (newest 14 kept)
```

Open any file in Excel or Notepad; move the folder between machines freely. Every write is atomic (temp file + rename) so a sync mid-save can't corrupt anything, and a snapshot of the whole folder is taken into `backups/` at every launch.

For backup and a second machine without any sign-in, **pick a folder inside OneDrive or Google Drive** and let their desktop client mirror it. With no cloud option turned on, the app never touches the network.

## Google Drive sync (optional)

Choose **This PC + Google Drive** during setup — or turn it on later in **Settings → Google Drive sync** — and ClassKernel signs you in once, creates a `ClassKernel` folder in your My Drive, and keeps it in step with your data folder in both directions.

This is a different thing from putting your folder inside Google Drive for Desktop. It talks to Drive directly, which means the same data can be reached from other devices over the Drive API — the groundwork for an Android companion app.

- **Your PC stays the working copy.** Every read and write still goes straight to local disk, so the app is just as fast and works with no internet. Syncing happens in the background: on launch, a few seconds after each change, and every 90 seconds.
- **Only its own files.** The app uses Google's `drive.file` scope, so it can see the files it created and nothing else in your Drive.
- **Conflicts are merged, not overwritten.** If two devices change things before syncing, registers, mark sheets, behaviour logs and rosters are merged row by row so nothing is lost. Files that are a single document — a room layout, a seating plan, class notes — take the newer version, and the other is kept next to it as `desks.conflict-<date>.csv` and listed in Settings.
- **Nothing is deleted behind your back.** Files removed on another device are removed here too, but a file you edited since is kept and re-uploaded, and remote deletions go to your Drive bin rather than being erased.
- **While a lesson is live**, changes pulled from other devices are held back for the class you're teaching until you leave the lesson view. Your own work still uploads.
- **Sign out any time** from Settings. Your local files are untouched, and the Drive folder stays where it is.

Two caveats worth knowing:

- If your data folder is itself inside OneDrive or Google Drive for Desktop, don't also turn this on — two sync systems watching the same files will fight over them. Use a plain local folder.
- Because rows are merged rather than tracked individually, deleting a student (or a mark, or a behaviour button) on a device that is offline can be undone when it syncs, if the other device still has that row. Deleting while connected is fine.

Building an installer with Drive sync enabled needs a Google OAuth client — see [docs/google-drive-setup.md](docs/google-drive-setup.md). Builds without one work fine; the option just shows as unavailable.

## Development

```bash
npm install
npm run dev          # UI in a browser with an in-memory demo dataset
npm test             # unit tests (CSV round-trips, seat assigner, stats, insights)
npm run tauri dev    # full desktop app (needs Rust; on Linux also webkit2gtk)
npm run tauri build  # Windows installer (NSIS .exe) in src-tauri/target/release/bundle
```

- Frontend: React + TypeScript + Vite, Zustand, PapaParse, Recharts, marked.
- Backend: minimal Rust (Tauri 2) — atomic file writes, folder snapshots, folder picker, and the Google Drive client. No other native code.
- App icons are generated: `node scripts/gen-icons.mjs`.

All network access lives in Rust (`src-tauri/src/google_auth.rs`, `drive.rs`). The webview's CSP has no `connect-src`, so the frontend cannot make outbound requests at all and never sees an access token. The sync engine itself is TypeScript (`src/lib/sync/`) — that is where the CSV schema knowledge is, and it is unit-tested against an in-memory filesystem and a fake Drive.

CI (`.github/workflows/build.yml`) runs the tests on every push and builds the Windows NSIS installer; tagging `v*` attaches the `.exe` to a GitHub release.
