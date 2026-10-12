# ClassKernel documentation

ClassKernel is an offline classroom manager for teachers: the register, seating plans, a live lesson you run from
the seating plan, behaviour, marks, dashboards and parent reports, plus optional teaching tools. Everything is
saved as plain files in a folder you choose.

![ClassKernel's Home page](images/home.png)

## User guide

1. [Getting started](user-guide/01-getting-started.md) — install, choose a data folder, find your way around, privacy on the big screen
2. [Setting up a class](user-guide/02-setting-up-a-class.md) — create a class, add students (or import them from a spreadsheet), draw the room, seating rules
3. [Attendance](user-guide/03-attendance.md) — take the register
4. [Seats](user-guide/04-seats.md) — seating plans, Randomise, the once-per-lesson lock and reseat PIN
5. [Lesson](user-guide/05-lesson.md) — record behaviour and attendance from the seating plan, bathroom trips, Pick a student, batch entry, teaching mode, Start and End lesson
6. [Behaviour log](user-guide/06-behaviour-log.md) — filter and correct behaviour entries, the bathroom log
7. [Marks](user-guide/07-marks.md) — assessments, quick marking, the per-question grid, viewing results, the markbook, weighting, marks from a spreadsheet, levels and symbols
8. [Dashboards and parent reports](user-guide/08-dashboards-and-reports.md) — class and student dashboards, seating insights, printed reports
9. [Teaching tools](user-guide/09-teaching-tools.md) — test timer, clock, stopwatch, graph paper, practical graphs, motion graphs, noise meter
10. [Settings](user-guide/10-settings.md) — every setting, and the spreadsheet export
11. [Your data and backups](user-guide/11-your-data.md) — where data lives, syncing, backups and restore, troubleshooting

## Quick start

1. **Install** from the [Releases](https://github.com/J4ckR4bbit/ClassKernel/releases) page and choose a data folder
   (ideally inside OneDrive or Google Drive).
2. **New class** on Home → add students under **Settings → Students** (paste a list with **Import list…**).
3. Draw the room under **Settings → Room layout**.
4. **Seating** on the class's Home card, then **Randomise**. This starts the lesson and marks the class present.
5. Mark any absences on **Attendance**, then teach from **Lesson**: tap a seat to record behaviour.
6. Press **End lesson** at the end.

## Reference

- [Data file reference](data-files.md) — every file in the data folder, column by column
- [Development](development.md) — building, testing, architecture, retaking the screenshots
- [Adding a tool](../src/plugins/README.md) — how the optional tools (plugins) are written
