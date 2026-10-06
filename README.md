# ClassKernel

Fast, lightweight, offline-first classroom management for teachers. Windows desktop app built with Tauri 2 — ~10 MB, instant startup, **no accounts, no server, no internet required**.

## Getting it

Currently distributed as a standalone **Windows installer (`.exe`)** — grab the latest from the [Releases](../../releases) page and run it. No sign-in, nothing to configure; on first launch you pick a folder to keep your data in.

## What it does

- **Home** — every class as a card on the landing page, with one-tap **Randomise seating** or **Live lesson** to start a lesson fast.
- **Students** — roster per class with flags (SEN, medical, …) and notes; bulk import by pasting a list of names.
- **Attendance register** — one-tap Present / Absent / Late / Excused per lesson, with running rates and history per student.
- **Room layout designer** — drag-and-drop desks (singles, doubles, group tables, teacher desk, doors, windows, free-text label boxes) onto a snap-to-grid canvas; rotate, recolour, resize, label, duplicate. Put the front of the room on any edge, scale the seat/desk/label text, set a **view crop** so seating views zoom to just the used part of the room, and **save a layout as a template** to reuse in another class.
- **Seating plans** — multiple named plans per class. Seat students by hand, or press **Randomise** for an animated reroll: students are spread evenly across desks (front desks filled first) honouring your rules — keep-apart pairs, keep-together pairs, front-of-room pins. Those rules live in Settings, out of sight of the class, so all students see is the shuffle. Print any plan for cover teachers.
- **Live lesson** — the seating plan *is* the interface. Every seat shows the student and their running points for the lesson; tap a seat to log positive/negative behaviours (fully customisable buttons) or mark attendance. **Batch entry** records one behaviour for many students at once: choose it (say *Missing homework*), tap each student — tap again to deselect — and press Save; nothing is recorded until then, and the next batch starts straight away. Seats are assigned (**Randomise**) **once per lesson**: after that the button shows 🔒 and needs your reseat PIN (set in Settings → Teaching mode), until you end the lesson or a new day starts. **Teaching mode** comes in two styles — the full-screen room plan, or a **side panel**: a narrow, always-on-top list of students grouped by table, docked to the left or right edge of the screen so your slides and annotations keep the rest (batch entry works there too). **End lesson** saves each student's seat and behaviour to the class history.
- **Seating insights** — from that saved history: how often each student has sat at each desk, which desk they behave best/worst at, and which pairings turn disruptive (one click to add them to the keep-apart list).
- **Assessments** — build tests as a single mark or broken into questions, each tagged with a **topic** (from a per-grade topic bank) and a cognitive level. Enter marks in a keyboard-first grid, then analyse everything on a dashboard: class means, mark distributions, per-student trends vs class average, attendance-vs-performance, at-risk flags, and per-topic breakdowns.
- **Export to a spreadsheet** — Settings → Export turns everything collected into one `.xlsx` workbook: a sheet each for the roster, the register (log and per-student summary), the behaviour log and summary, assessments with their statistics, marks with percentages and symbols, per-question marks, per-topic performance, seating plans, lesson history and seating insights. Tick the classes and datasets you want, optionally limit it to a term with a date range, and save it anywhere — every sheet carries a **Class** column so several classes can be exported together and pivoted. Exports are snapshots; editing the spreadsheet never changes the app's data.
- **Test timer** — a big countdown for exams and timed tasks, with optional reading + writing phases, a chime at phase changes, and three display styles (countdown circle, hourglass, or flip clock). Save reusable presets and go fullscreen.
- **Plugins** — extra teaching tools that ship inside the app but stay switched off until you want them. Turn one on in **Settings → Plugins** and it appears under **Tools** on the Home page; turn it off and the app is exactly as it was. Three so far: a **graph paper generator** that builds axes and grids to your own dimensions; a **practical graph plotter** — paste a table of readings and get the plotted graph with a least-squares line of best fit, its gradient, y-intercept and R², optionally forced through the origin; and a **motion graph builder** — describe a journey a stage at a time and get the position, velocity and acceleration graphs derived from it, so the three can never contradict each other, with any of them left blank for the question version. All three save a 300 dpi PNG that drops into Word at exactly the printed size. Plugins are compiled into the app: they work offline like everything else and save through the same file dialog as an export. See [`src/plugins/README.md`](src/plugins/README.md) to add one.

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
  exports/                       # spreadsheet exports saved from Settings → Export
  backups/                       # automatic snapshots (newest 14 kept)
```

Open any file in Excel or Notepad; move the folder between machines freely. **Pick a folder inside OneDrive or Google Drive** and the sync client gives you backup and access from other machines — the app itself never touches the network. Timestamps are saved in UTC so files mean the same thing on any machine; the app shows and exports every date and time in the time zone chosen under **Settings → General → Time zone** (by default, the computer's own). Every write is atomic (temp file + rename) so a sync mid-save can't corrupt anything, and a snapshot of the whole folder is taken into `backups/` at every launch.

## Development

```bash
npm install
npm run dev          # UI in a browser with an in-memory demo dataset
npm test             # unit tests (CSV round-trips, seat assigner, stats, insights, spreadsheet export)
npm run tauri dev    # full desktop app (needs Rust; on Linux also webkit2gtk)
npm run tauri build  # Windows installer (NSIS .exe) in src-tauri/target/release/bundle
```

- Frontend: React + TypeScript + Vite, Zustand, PapaParse, Recharts, marked. Spreadsheet exports are written by a small built-in `.xlsx` writer (`src/lib/xlsx.ts`) rather than a dependency, so the installer stays small.
- Backend: minimal Rust (Tauri 2) — atomic file writes, folder snapshots, folder and save-as pickers. No other native code.
- App icons are generated: `node scripts/gen-icons.mjs`.

CI (`.github/workflows/build.yml`) runs the tests on every push and builds the Windows NSIS installer; tagging `v*` attaches the `.exe` to a GitHub release.
