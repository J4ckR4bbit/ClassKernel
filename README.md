# Organik Classroom

Fast, lightweight, offline-first classroom management for teachers. Windows desktop app built with Tauri 2 — ~10 MB, instant startup, **no accounts, no server, no internet required**.

## What it does

- **Student information** — roster per class with flags (SEN, medical, …) and notes; bulk import by pasting a list of names.
- **Attendance register** — one-tap Present / Absent / Late / Excused per lesson, running rates and history per student.
- **Room layout designer** — drag-and-drop desks (singles, doubles, group tables, teacher desk, doors, windows) onto a snap-to-grid canvas; rotate, label, duplicate.
- **Seating plans** — multiple named plans per class. Seat students by hand, or use the **random assigner** with constraints: keep-apart pairs, keep-together pairs, front-of-room pins, mixed-gender desks. Print the plan for cover teachers.
- **Behaviour tracking on the seating plan** — in the Live lesson view every seat shows the student and their running points; tap a seat to log positive/negative behaviours (fully customisable buttons) or mark attendance. Filterable behaviour log behind it.
- **Assessments** — create assessments, enter marks with a keyboard-first quick-marking tool (type, Enter, next student), and analyse everything on a dashboard: class means, mark distributions, per-student trends vs class average, attendance-vs-performance, at-risk flags.

## Where your data lives

Everything is stored as plain **`.csv` and `.md` files** in one folder you choose:

```
ClassroomData/
  behaviours.csv                 # your behaviour buttons
  classes/7B-Science/
    class.md                     # class details + free-form notes
    students.csv
    attendance.csv
    behaviour.csv
    desks.csv                    # room layout geometry
    seating.csv                  # named seating plans
    assessments.csv
    marks.csv
  backups/                       # automatic snapshots (newest 14 kept)
```

Open any file in Excel or Notepad; move the folder between machines freely. **Pick a folder inside OneDrive or Google Drive** and the sync client gives you backup and access from other machines — the app itself never touches the network. Every write is atomic (temp file + rename) so a sync mid-save can't corrupt anything, and a snapshot of the whole folder is taken into `backups/` at every launch.

## Development

```bash
npm install
npm run dev          # UI in a browser with an in-memory demo dataset
npm test             # unit tests (CSV round-trips, seat assigner, stats)
npm run tauri dev    # full desktop app (needs Rust; on Linux also webkit2gtk)
npm run tauri build  # Windows installer (NSIS) in src-tauri/target/release/bundle
```

- Frontend: React + TypeScript + Vite, Zustand, PapaParse, Recharts, marked.
- Backend: minimal Rust (Tauri 2) — atomic file writes, folder snapshots, folder picker. No other native code.
- App icons are generated: `node scripts/gen-icons.mjs`.

CI (`.github/workflows/build.yml`) runs tests on every push and builds the Windows NSIS installer; tagging `v*` attaches the installer to a GitHub release.

## Microsoft Store

See [docs/STORE.md](docs/STORE.md) for packaging the build as MSIX and submitting it to the Microsoft Store via Partner Center.
