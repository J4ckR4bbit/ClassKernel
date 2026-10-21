# Save point — speed & UI review (PR #39)

> Paused at the teacher's request on 2026-10-21. **Delete this file before PR #39 is marked ready for review.**
> Everything below is on branch `ccr-8284f537-pnnix6` (pushed); nothing is left uncommitted.

## What the teacher asked for and decided
- "Go through the app and check if things can be improved — speed and how efficiently features are displayed and coded", then
  "also consider style and user interface improvements", then **"implement all your suggestions for speed and UI"**.
- Backups: **every snapshot from today + the newest of each of the 14 most recent earlier days** (done).
- Low-priority items deliberately left out: lazy-loading Settings / `marked`, raw-bytes IPC for exports.
- Taste or behaviour changes are done in their **most conservative form** and called out in the PR.
- Parent reports keep "Grade 10" in words (parents read them); teacher-facing screens use G07–G12. Offered to flip.
- Flagged only, not changed: `applyLayoutTemplate` (`src/store/appStore.ts`) writes without the save-error guard.

## Done (4 commits, all tests green)
| Commit | What |
| --- | --- |
| `09ed3ed` | Rust commands `#[tauri::command(async)]` (off the UI thread), unique temp names, `read_text_opt`; `QueuedFS` per-file write queue + backup gate (`src/lib/fs.ts`, tests in `fs.test.ts`); one-call CSV reads; parallel class listing and app-wide loads; background launch backup; new backup policy (`src-tauri/src/backup_policy.rs` + tests) and wording in Settings/README/docs |
| `fcaee90` | `useAppPick(...keys)` (useShallow) replaces all 50 whole-store `useApp()` subscriptions; `App` picks only the class colour and zoom |
| `400da79` | Lesson: register/out-now/seat Maps, `today()` once (31 ms → 0,26 ms per redraw at 6 000 rows), `<Elapsed>` self-ticking bathroom timer; marking grid shares one `markIndex`; quick marking uses fresh state; Home card doesn't re-read the open class |
| `8e42def` | `fitView` (`src/lib/room.ts`): Seats/Lesson zoom to the furniture when no crop is set; `gradeLabel`/`joinAnd` moved to `lib/format.ts`; Home cards show G07/G10 |

Verified: `npx vitest run` 363 passing · `npx tsc` clean · `CI=1 npx playwright test` 60/60 · `rustc --edition 2021 --test src-tauri/src/backup_policy.rs` 6/6.
**Not yet verified:** the full Tauri crate (no GTK/WebKit in the cloud container) — CI's Windows build on PR #39 is the compile check. `lib.rs` was type-checked with Tauri stubbed out and the `command(async)` syntax confirmed in tauri-macros 2.7.1.

## Still to do, in order
1. **Check PR #39 CI** (Windows installer job = Rust compile). Fix anything red first. Re-subscribe to PR activity.
2. **Finish the UI review.** The visual and touch lenses finished (29 findings, appendix below) but were **not yet adversarially verified**. The accessibility and flows/wording/conventions lenses had not finished. Re-run those two lenses, then verify all four with a sceptic per lens, then a completeness critic (same design as before: read-only, evidence with file:line or `docs/images/*.png`, conventions = SA numbers, IUPAP units, G08–G12, IEB not CAPS).
3. **Live-lesson cluster** (was about to start; each claim checked against the code):
   - Escape closes the seat pop-up / strip sheet / picker **without** leaving teaching mode (add Escape to `useDismissOnOutside` in capture phase with stopPropagation; picker listener capture + `stopImmediatePropagation`).
   - Seat pop-up: privacy-aware name (`displayStudentName` when privacy mode is on); 20 px name heading with a ✕ in the header; positives and negatives as two labelled groups; `max-height` + scroll.
   - Attendance taps: toast with Undo; seat and strip badges for L and E as well as A.
   - Replace emoji glyphs (🚻 ✗ ✓ •) with `Icon` paths (add an SVG-embeddable glyph export to `Icon.tsx`); drop emoji from bathroom toasts (`e2e/lesson.e2e.ts:68` expects "Bathroom timer started").
   - Seat/strip points use tokens (`--md-primary`, `--md-error`, `--md-on-surface-variant`) via classes, not `fill="#2e9e5b"`.
   - Randomise gets an Undo: restore the previous plan, and if the lesson wasn't running, stop it and restore attendance. **Keep the seat lock** (otherwise Undo → Randomise bypasses the reseat PIN).
   - Timer/noise mini cards: in teaching mode the card body doesn't exit teaching mode (only the open-in-full button does); move the stack away from End lesson for `bar-right` / `bar-bottom`.
   - Side-column teaching mode: the "Out now" chips go inside the focus bar; the strip gets its own Out-now row.
   - Strip width scales with the display-size setting (`stripWidth(screenW, uiScale)` in `teachingWindow.ts`, re-dock when it changes).
   - Toast at the top in strip mode; toast action ≥ 44 px; strip head buttons 44 px with Exit away from Full screen; picker option labels 44 px; swatches 36 px.
   - `touch-action: manipulation` on lesson/seating canvases (keep `none` only for the editable designer); in teaching mode let the SVG fill its flex box instead of `max-height: calc(100vh - N)`.
   - Picker in the strip: `overflow-wrap: anywhere` and a narrower font clamp (no window resizing).
   - Strip footer uses the room plan's button emphasis for Start/End lesson.
4. **Other clusters** (suggest an implementation workflow, sequenced to avoid `styles.css` conflicts): shared helpers/components (`byName` sort, `StatTile`, `BehaviourButton`, `EmptyState`, `Modal` with focus/Escape/aria, z-index scale), inline styles → classes, consistent page headers/Back, table widths, labelled print of the seating plan, splitting `SettingsView.tsx` / `AssessmentsView.tsx` into folders, plugin CSS beside each plugin, semantic colour tokens + type/spacing/radius scale, optional Theme setting (Light default / Dark / Match Windows), plus whatever the a11y and flow lenses confirm.
5. **Review workflow over the whole diff** (correctness/regressions, adversarially verified), fix, rerun all tests.
6. Regenerate the guide screenshots (`npm run docs:screenshots`; `home.png` still shows "Grade 10", `lesson.png` the unfitted room) and update the user guide for any changed behaviour.
7. Update the PR description, delete this file, mark PR #39 ready.

## Resume commands
```bash
npm ci
npx vitest run && npx tsc && echo OK
CI=1 npx playwright test          # Chromium is preinstalled at /opt/pw-browsers
rustc --edition 2021 --test src-tauri/src/backup_policy.rs -o /tmp/bp && /tmp/bp
```

## Appendix — unverified UI findings (visual + touch lenses)
### `visual-hardcoded-colours-no-semantic-tokens` — 121 hex literals bypass the :root tokens; 'positive', 'negative', 'warning' and 'alarm' each have 3–5 different values

- **Severity / effort:** high / M
- **Where:** src/styles.css, RoomCanvas, dashboard charts, BehaviourLogView
- **Evidence:** styles.css after the :root block (line 70 on) has 121 hex literals (49 unique) plus 20 distinct rgba() values. The same meaning gets different colours:
- Positive: #2e9e5b (styles.css:1214 .strip-points.pos, RoomCanvas.tsx:264), var(--accent)=#2b6a46 (styles.css:1274 td.pos, BehaviourLogView.tsx:124, shared.tsx:129), #2e9455 (dashboard/shared.tsx:9 C_PRIMARY, styles.css:1324 .report-bar).
- Negative: #d65c5c (styles.css:1215, RoomCanvas.tsx:264), --danger=#ba1a1a, #c0322b (shared.tsx:11), #c0392b (styles.css:853, 857, 1064, 1092), #b83b3b (attendance A, styles.css:369).
- Amber/warning: --warn #8a5a00 (57), #7a5208/#fdf0dd/#d9b36a (bathroom, 526-536), #6b4a00/#fdf0d9 (import-warning, 598), #2a1800/#ffddb3 (tag.warn, 289), #d9901a (noise zone, 816).
- A leftover slate-blue neutral family from before Material sits beside the green neutrals: #1d2733 ×6, #5c6b7a ×5, #8a97a5, #3a4652/#16202b (seat names, 394-395), rgba(29,39,51,…) ×6.
The TSX has more: grid stroke #eef1f4 (RoomCanvas.tsx:118,121), seat-point fills (RoomCanvas.tsx:264), tag fallbacks #888/#555 (BehaviourLogView.tsx:119), and the chart constants (shared.tsx:9-15). The highlighter yellow #ffd84d is repeated at styles.css:400 and 1218.
- **Impact:** Across screens the same idea shows in visibly different greens and reds: the dashboard-class.png tile '92' is dark green while the chart bars are mid-green. Every future colour change, and any dark theme, means hunting through about 140 literals in CSS and TSX.
- **Suggested fix:** 1. In styles.css :root, add semantic tokens: --positive, --negative, --warning, --warning-container, --on-warning-container, --alarm, --alarm-container, --att-present/absent/late/excused, --select-highlight (#ffd84d), --grid-line, --seat-name, --seat-surname. Map them onto the md roles where one fits (positive→md-primary, negative→md-error).
2. Replace the literals rule by rule. Drop the slate family in favour of --md-on-surface and --md-on-surface-variant.
3. In RoomCanvas.tsx:264, set a className (seat-points pos/neg/zero) and colour it in CSS instead of the fill attribute. At :118/:121 use className="room-grid" with stroke: var(--grid-line).
4. In BehaviourLogView.tsx:124 use className={e.points>=0?'pos':'neg'} (the rule already exists at styles.css:1274).
5. Keep the recharts constants in one src/lib/palette.ts, with a comment tying each to its CSS token.

### `visual-seat-points-low-contrast` — Behaviour points on seats and in the side strip fail contrast (2.6:1 to 3.8:1)

- **Severity / effort:** high / S
- **Where:** RoomCanvas seat points, TeachingStrip points
- **Evidence:** RoomCanvas.tsx:256-265 draws points at 11 px × seatFontScale with fill #2e9e5b / #d65c5c / #7c8b99 on the occupied-seat fill var(--accent-soft) #d1e8d5 (styles.css:392). Measured WCAG ratios: green 2.63:1, red 2.92:1, grey 2.70:1. In the strip, .strip-points.pos #2e9e5b and .neg #d65c5c (styles.css:1214-1215) sit on white student rows (1194) at 13 px: 3.41:1 and 3.79:1. All are below 4.5:1, and below 3:1 on the seats.
- **Impact:** The 'public scoreboard' (Settings › General › 'Show each student's running behaviour points on their seat') is the thing pupils read from the back of the room on a projector or touch panel, where contrast is already washed out. A faint +2 or −1 is hard to read.
- **Suggested fix:** Once the tokens from visual-hardcoded-colours-no-semantic-tokens exist:
- In styles.css, add .seat-points.pos { fill: var(--md-primary) /* #2b6a46, about 4.9:1 on #d1e8d5 */ }, .seat-points.neg { fill: var(--md-error) /* #ba1a1a */ } and .seat-points.zero { fill: var(--md-on-surface-variant) }.
- Change .strip-points.pos/.neg (1214-1215) to the same tokens.
- In RoomCanvas.tsx:260-265, pass className instead of fill.
- Optionally raise the base size from 11 to 12 px (RoomCanvas.tsx:262).

### `visual-no-dark-or-high-contrast-theme` — No dark theme, no Windows high-contrast support, and #fff hard-coded on 28 surfaces

- **Severity / effort:** medium / L · **needs the teacher’s decision**
- **Where:** src/styles.css theming
- **Evidence:** There are no prefers-color-scheme, forced-colors, prefers-contrast or data-theme rules anywhere in src. The only scheme is the light :root block (styles.css:5-70; the comment at 6-7 reads 'tonal-spot scheme, light'). #fff appears 28 times outside :root as a surface, not a token: .seat-square (391), .grid-input (638, 640), .strip-table .strip-student (1194), .nm-gauge (825), .gp/.pg/.mg-canvas (742, 784, 908), .report-page (1303). Selected states rely on fills alone: .seat-square.batch-selected (400), .att-btn.on (368-371), .md-tab.active::after (346), input.switch (149).
- **Impact:** Marking at night on a bright green-white UI is tiring. Under Windows High Contrast, which some school machines and panels use, filled 'on' states such as attendance P/A/L/E, batch-selected seats and switches lose their fills and become indistinguishable.
- **Suggested fix:** After tokenising:
1. Add a :root[data-theme=dark] block with the Material dark tonal-spot roles generated from the same seed #2c6e49 (the same tool as styles.css:6-7). Swap #fff surfaces for var(--md-surface-container-lowest).
2. Add a 'Theme: Light / Dark / Match Windows' Segmented to the Display size panel (SettingsView.tsx:290-301) and set document.documentElement.dataset.theme in App.tsx.
3. Add @media (forced-colors: active) rules that give .att-btn.on, .seat-square.batch-selected, .chip.selected and .switch:checked a 3 px Highlight outline or forced-color-adjust, so state survives.
4. Keep the room plan and noise meter light in teaching mode if preferred.

### `visual-type-spacing-radius-scale` — No type, spacing or radius scale: 19 font sizes, 14 gaps, 11 ad-hoc radii, and weights 600/800/900 that the bundled fonts cannot render

- **Severity / effort:** medium / M
- **Where:** src/styles.css, src/main.tsx
- **Evidence:** - Font sizes: 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 18, 22, 24, 28, 30, 34, 40 and 52 px. 12.5px alone is used 15 times and 11.5px 5 times.
- Gaps: 2, 4, 5, 6, 8, 9, 10, 12, 14, 16, 18, 20, 22 and 24 px.
- Radii: --md-shape-* tokens exist (38-42), but 4, 6, 7, 8, 10, 12, 14, 16, 17, 20 and 28 px literals are used 35+ times (e.g. 6px at 544, 1141-1142, 1153; 10px at 1062, 1091, 1183; 14px at 581, 1051, 1076).
- Weights: main.tsx:6-11 bundles Roboto 400, 500 and 700 only (its comment says 'the three weights the app uses'), yet styles.css uses font-weight 600 ×22, 800 ×8 and 900 ×1. With no 600/800/900 face these all render as 700. So .seat-check 800 vs .seat-name 700, .timer-mini-time 800 vs its 700 label, and the .nm-banner 900 show no difference.
- **Impact:** The small differences (12 vs 12.5 vs 13 px, 6 vs 8 vs 10 px radii) make screens feel slightly 'off' next to each other, as in the compact stat chips (14 px radius) next to 12 px cards. Intended emphasis levels collapse into one bold.
- **Suggested fix:** 1. In :root add a Material type scale: --type-label-s 11px, --type-label-m 12px, --type-body-s 13px, --type-body-m 14px, --type-body-l 16px, --type-title-m 16px/500, --type-title-l 22px/400, --type-headline-s 24px. Add --space-1..6 = 4/8/12/16/24/32px.
2. Replace 12.5px with 12 or 13, 11.5px with 12, and 10.5px with 11.
3. Replace radius literals with --md-shape-xs/s/m/l (pills keep 999px).
4. Map font-weight 600 to 500 or 700 deliberately and 800/900 to 700, or add @fontsource/roboto 900 for the noise banner only.

### `visual-css-duplication-and-plugin-css-placement` — styles.css repeats whole blocks across plugins and holds 300 lines of plugin CSS the plugin README says belong beside each plugin

- **Severity / effort:** medium / M
- **Where:** src/styles.css, src/plugins/*
- **Evidence:** src/plugins/README.md:57-59 says 'Styles of your own go in a .css beside the view… Vite puts it in the plugin's chunk'. clock.css and stopwatch.css follow that, but graph-paper (708-750), practical-graph (752-792), noise-meter (794-873), motion-graph (875-916) and test-timer (931-1011) live in the global sheet, about 22% of its 1 352 lines.

Copy-pasted blocks:
- .gp-preview, .pg-preview and .mg-preview are byte-identical, comment included (730-737, 774-781, 898-905).
- .gp-canvas, .pg-canvas and .mg-canvas (740-743, 782-785, 906-909).
- The -controls, -field, -check and -number rows.
- Three identical @media (max-width:900px) blocks (746, 788, 912).
- .timer-mini (1047-1069) and .noise-mini (1072-1096) are near-identical.

Repeated or conflicting rules:
- .top-bar at 222 and again at 1241.
- .focus-layout.bar-left > .focus-bar sets max-width:240px at 464-468, then width/max-width:250px at 503-504.
- .mark-grid thead th at 608 and 668.
- .mark-grid .sticky-left.third twice (628-629).
- .spacer is global (273) but re-declared under .view-header (272), .top-bar (224), .focus-bar (450) and .batch-actions (1144), and inline again in LayoutDesigner.tsx:384.
- .seating-canvas{position:relative} (426) is repeated inline at LessonView.tsx:286.
- .report-options select is stranded after the print block (1351).
- Two @media (max-width:420px) blocks (1166, 1228) and two @media print blocks (677, 1336).
- **Impact:** Fixing a tool's layout means editing three places. The global sheet loads CSS for tools that are off by default, and the conflicting focus-bar widths make it unclear which value is real.
- **Suggested fix:** 1. Create src/plugins/shared/tool-layout.css with .tool-split (the grid plus 900px fallback), .tool-controls, .tool-preview, .tool-canvas, .tool-field, .tool-check and .tool-number. Use it from GraphPaper, PracticalGraph and MotionGraph.
2. Move each plugin's remaining rules into src/plugins/<id>/<id>.css, imported from its view.
3. Merge .timer-mini and .noise-mini into .mini-card with --mini-colour/--mini-soft variables.
4. Delete the duplicate .top-bar, .spacer, sticky-left.third and thead th rules. Pick one focus-bar side width (250px). Move .report-options select into the report block and merge the twin media blocks.
5. Remove the inline style at LessonView.tsx:286 and LayoutDesigner.tsx:384.

### `visual-inline-styles-to-classes` — 189 inline style objects, mostly the same few margins, column widths and empty-row paddings

- **Severity / effort:** medium / M
- **Where:** SettingsView, AssessmentsView, BehaviourLogView, SeatingInsights, RosterView, ExportView, ClassNotesView, AttendanceView
- **Evidence:** There are 189 style={{…}} in TSX: SettingsView 40, AssessmentsView 24, BehaviourLogView 13, SeatingInsights 11, RosterView 10, ExportView 10, LayoutDesigner 8, ClassNotesView 8. Repeated shapes:
- <p className="muted" style={{ marginTop: 0 }}> 23× in 6 files (SettingsView.tsx:230, 292, 305, 480, 517, 579, 600, 612, 699, 798, 1035, 1081, 1111, 1209; ExportView.tsx:141, 169, 198, 243; SeatingInsights.tsx:78, 124; StudentActions.tsx:43…).
- style={{ marginBottom: 0 }} 9×; className="row" style={{ marginTop: 10 }} 7×.
- Empty-table cell style={{ textAlign: "center", padding: 24 }} 5× (BehaviourLogView.tsx:145, 198; RosterView.tsx:140; AttendanceView.tsx:124; AssessmentsView.tsx:192), with padding:16 variants (AssessmentsView.tsx:769, 1028; Markbook.tsx:166).
- 58 <th style={{ width: N }}>.
- Colours inline that already have classes: BehaviourLogView.tsx:124 (td.pos/.neg exist at styles.css:1274-1275), SeatingInsights.tsx:69, 105, dashboard/shared.tsx:129.
- Typography inline: ClassNotesView.tsx:95 (fontFamily Consolas, fontSize 13, minHeight 380).
- **Impact:** Spacing and colour can't be changed centrally or themed. Inline colours escape any future dark theme, and the copy-paste encourages more drift.
- **Suggested fix:** In styles.css add:
- .panel > h3 + p.muted { margin-top: 0 } (removes 23 inline styles)
- .panel > :last-child { margin-bottom: 0 }
- .actions-row { margin-top: var(--space-2) }
- table.data td.empty { text-align: center; padding: 24px; color: var(--text-dim) }
- width utilities th.w-40/.w-90/.w-110/.w-160 (or <colgroup> classes)
- .stat-tile .value.pos/.neg
- .notes-editor { font-family: Consolas, monospace; font-size: 13px; min-height: 380px }
Then replace the inline styles, keeping style= only for data-driven values (behaviour colour, positionTint, CSS custom properties).

### `visual-shared-helpers-name-sort-grade-label` — Surname sort copied 11 times; the G10-style grade label is private to Settings, so Home and parent reports print 'Grade 10'

- **Severity / effort:** medium / S
- **Where:** lib helpers; HomeView, ParentReport, 9 views
- **Evidence:** - The sort `(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)` is inlined at Markbook.tsx:30, report/ParentReportsView.tsx:34, AttendanceView.tsx:43, DashboardView.tsx:103 and :146, dashboard/StudentDashboard.tsx:41, and AssessmentsView.tsx:518, 818 and 933. It is also private as `byName` in lib/markSheet.ts:18 and lib/rosterSheet.ts:21.
- gradeLabel ('10' → 'G10', '8' → 'G08') exists only inside SettingsView.tsx:1189. HomeView.tsx:31 and ParentReport.tsx:56 build `Grade ${year}` instead, visible in home.png as 'Grade 10', 'Grade 12' and 'Grade 7' on the class cards, while Settings shows G10/G12.
- **Impact:** The teacher sees two grade conventions in one app, and the cards and printed parent reports don't use the school's G08–G12 labels. Any change to name ordering (e.g. how 'van der Merwe' sorts) has to be made in 11 places.
- **Suggested fix:** 1. Export `byName(a: Student, b: Student)` and `sortByName(students)` from src/lib/types.ts (next to studentName) and replace all 11 copies.
2. Move gradeLabel and joinAnd from SettingsView.tsx:1188-1193 into src/lib/format.ts.
3. Use gradeLabel in HomeView.tsx:31 (`c.year && gradeLabel(c.year)`) and ParentReport.tsx:56.

### `visual-shared-components-stat-behaviour-empty` — Stat tiles, behaviour buttons and empty states are hand-rolled per view, with diverging markup and labels

- **Severity / effort:** medium / M
- **Where:** StatTile, behaviour buttons, empty states
- **Evidence:** - StatTile exists (dashboard/shared.tsx:126-135), yet the same 3-div markup is hand-written 21 times: BehaviourLogView.tsx:82-90, SeatingInsights.tsx:60-72, Markbook.tsx:67-84, MarkSheetTools.tsx:92-100, RosterSheetTools.tsx:101-110, AssessmentsView.tsx:663-674 and 970-978.
- Behaviour buttons are rendered in four places with different label formats. StudentActions.tsx:66-85 builds the sign by hand (`+{c.points} {c.label}` and `{c.points} {c.label}`). BatchPanel.tsx:38-44 and StudentPicker.tsx:180-186 use `signed(points) label`. StudentPicker.tsx:156-169 puts the points after the label ('Asked and answered +1'). The rest use '+1 Asked and answered', as in seat-popover.png.
- Empty states use four looks: .empty-state once (App.tsx:145), 'panel muted' 12× (HomeView.tsx:49, 95; DashboardView.tsx:115, 157; SettingsView.tsx:102, 104; ExportView.tsx:134…), an inline-styled td 8×, and bare <p className="muted">.
- **Impact:** The same action looks and reads differently in the seat pop-up, batch panel and picker. That matters at the board, where the teacher relies on recognising a button at a glance.
- **Suggested fix:** 1. Move StatTile to src/components/StatTile.tsx with props value, label, title, tone and compact, and replace the 21 copies. Let the parent keep the .stat-tiles/.compact wrapper.
2. Add src/components/BehaviourButton.tsx (`<BehaviourButton code={c} onClick size="m|l" />`) that always renders `{signed(points)} {label}`, and use it in StudentActions, BatchPanel and StudentPicker (picker-answer can pass an icon prop).
3. Add src/components/EmptyState.tsx ({icon?, title?, children, action?}) with variants 'panel' and 'table-row' (takes colSpan), and use it for the 'panel muted' and empty-td cases.

### `visual-modal-shell-and-zindex-scale` — Six hand-rolled modal shells, Escape only in one, and ad-hoc z-indexes that leave the timer and noise pop-ups above dialog scrims

- **Severity / effort:** medium / M · **needs the teacher’s decision**
- **Where:** Dialogs/overlays; styles.css z-index
- **Evidence:** - The markup `.modal-backdrop > .modal` is copied in AppDialog.tsx:32, RosterView.tsx:191, MarkSheetTools.tsx:80, RosterSheetTools.tsx:86, NewClassModal.tsx:26 and AssessmentsView.tsx:236.
- Only AppDialog handles Escape (AppDialog.tsx:21). Only MarkSheetTools:81 and RosterSheetTools:87 set role="dialog", and none set aria-modal.
- z-index values have no scale: sticky 1-3, .behaviour-popover/.strip-sheet 30 (517, 1223), .nm-display.class-view 45 (866), .modal-backdrop 50 (321), .picker-overlay 60 (1100), .menu 70 (239), .save-error-banner and .mini-stack 90 (1035, 1043), .toast 100 (262), .report-portal 2000 (1287).
- So the TimerMini/NoiseMini stack (90) floats above every modal scrim (50) and stays clickable, and the class-picker menu (70) outranks dialogs.
- **Impact:** Dialogs behave differently: Escape closes a confirm but not 'New assessment' or 'Import list'. During a test with the timer pop-up running, a dialog's scrim doesn't cover the timer, and in the narrow strip window the pop-up can sit over a dialog's buttons.
- **Suggested fix:** 1. Create src/components/Modal.tsx (`<Modal title onClose size="s|m|l" className>`) rendering the backdrop with role="dialog", aria-modal, aria-labelledby, Escape-to-close, backdrop click and focus return. Rebuild AppDialog, NewClassModal, NewAssessmentModal, the RosterView import and both import-preview dialogs on it.
2. In :root add --z-sticky:2, --z-popover:30, --z-float:40 (mini-stack), --z-overlay:50 (noise class-view, picker), --z-modal:60, --z-menu:70, --z-banner:90, --z-toast:100 and --z-portal:200, and use them everywhere.
3. Decide whether the timer should stay above dialogs. Default to below the modal scrim.

### `visual-view-headers-and-back-inconsistent` — Three different 'Back' patterns, two <h1>s per page, and some sub-pages with no heading

- **Severity / effort:** medium / M
- **Where:** TopAppBar, view-header across Marks, Markbook, Settings sub-pages, Tools
- **Evidence:** - Back as an icon-only arrow in the top bar: TopAppBar.tsx:26-35 for tools, roster and layout (dashboard-class.png shows '← Class & student dashboards').
- Back as an outlined 'Back' chip inside the page: Markbook.tsx:60-62, AssessmentsView.tsx:396, 615, 634 and 956 (markbook.png shows '← Back' then 'Markbook').
- Headings: TopAppBar renders <h1 className="top-bar-title"> (TopAppBar.tsx:36), and sub-pages add a second <h1> in .view-header (Markbook.tsx:63; AssessmentsView.tsx:619, 637, 648). So marking-grid.png stacks 'Marks' over 'Marking: Forces & energy test (out of 50)'.
- Several view-headers start with an empty spacer and no title at all (AssessmentsView.tsx:116-117, BehaviourLogView.tsx:54-55, ClassNotesView.tsx:52-53). marks-list.png and behaviour-log.png show actions floating right with nothing on the left.
- **Impact:** The teacher has to look in two places for 'back', depending on which screen they are on. The top-left is the natural place on a wide touch panel, but Markbook's back is mid-page. Two h1s also confuse screen readers.
- **Suggested fix:** 1. Add a `subPage` slot to the store, `{ title: string; onBack: () => void } | null`, rendered by TopAppBar as '← Marks › Markbook' using the existing icon-btn (TopAppBar.tsx:26-35).
2. Have Markbook, QuestionSetup, QuestionGrid (readOnly) and MarkListView set it in an effect instead of rendering their own Back button.
3. Demote the in-page view-header headings to <h2>, or drop them when the top bar carries the title.
4. Alternatively, make one `<PageHeader back? title? actions>` component used by every view-header, so the left slot is never empty.

### `visual-table-widths-gaps-and-squeeze` — Full-width tables leave 500–900 px gaps on some screens and squeeze columns on Marks

- **Severity / effort:** medium / S
- **Where:** AttendanceView, BehaviourLogView, AssessmentsView list, mark grid, StudentDashboard
- **Evidence:** table.data is width:100% everywhere (styles.css:292).
- attendance.png: names end near x≈190 while the P/A/L/E control sits at x≈1047-1235. There are about 850 px of empty row between them (AttendanceView.tsx:66-67: Student auto, Today 220).
- behaviour-log.png: the auto-width Behaviour column leaves about 500 px blank before Points.
- marks-list.png shows the opposite: AssessmentsView.tsx:129-140 fixes 9 widths totalling 1 094 px, including a 320 px action column. 'Forces & energy test' wraps over 4 lines, dates break as '2026- / 10-10', and the 'Out of' and 'Class mean' headers wrap. The ✕ jumps between x≈1133 and x≈1227 because 'Questions' only renders for multi-question tests (177-181).
- marking-grid.png and markbook.png: .mark-grid-wrap (styles.css:604) is a full-width bordered card, but the grid ends at x≈880 or x≈1127, leaving a large empty framed area.
- dashboard-student.png: a bordered table.data nested inside a bordered .panel (StudentDashboard.tsx:106-107) gives a double frame.
- **Impact:** At a big touch panel, reading a name and then tapping a button 850 px away invites the wrong row. On the Marks list, test titles are hard to scan and the actions are ragged.
- **Suggested fix:** - Attendance: put the Today column immediately after Student (`table.data.fit { width: auto; min-width: 560px }`, or give Student `width: 1%; white-space: nowrap`). Optionally add zebra rows via `table.data.striped tbody tr:nth-child(even) td { background: var(--md-surface-container-low) }`.
- Behaviour log: constrain the Behaviour column, or right-align Points next to it.
- Marks list: add `white-space: nowrap` to the date and number cells (reuse .num), give Title `min-width: 180px`, remove the fixed 320 px, always render a fixed-width Questions slot (or move Questions and Delete into a ⋯ menu), and show dates as shortDate ('10 Oct') like the markbook.
- `.mark-grid-wrap { width: fit-content; max-width: 100% }`.
- `.panel > table.data { border: none }`, or a `.panel.flush` modifier.

### `visual-seat-popover-hierarchy` — Seat pop-up: the student's name is a plain 14 px h4, and 10 behaviour bars run as one undivided column

- **Severity / effort:** medium / S
- **Where:** StudentActions (seat pop-up and strip sheet)
- **Evidence:** StudentActions.tsx:31 renders the name as <h4>. The only rule is .behaviour-popover h4 { margin } (styles.css:519), so it gets the default size, about 14 px at weight 500. seat-popover.png shows 'Ella Evans' as the smallest heading in a 688 px-tall card. Positives and negatives are computed separately (StudentActions.tsx:24-25) but rendered back to back with no label or divider (66-85), so '+1 Asked and answered' runs straight into '-1 Talking / off task'. Close is a full-width button at the very bottom (86-88), below the fold on a short panel.
- **Impact:** Before tapping, the teacher at the board needs to confirm they opened the right student and then find the right half of the list. A small name and an undifferentiated colour stack slow that down and invite mis-taps on the wrong student or the wrong sign.
- **Suggested fix:** - Style the heading with `.behaviour-popover h4 { font-size: 20px; line-height: 28px; }` (or var(--type-title-l)).
- Render two labelled groups in StudentActions.tsx: `<div className="bh-group"><span className="bar-group-label">Positive</span>…</div>` and the same for Negative, with an 8 px divider between them. If width allows (popover 300→420 px), use a two-column grid with positives left and negatives right.
- Move Close to an icon-btn ✕ in the header row so it is always visible.

### `visual-lesson-actions-divergent-styles` — Lesson actions are built twice with different emphasis in the room plan and the side strip

- **Severity / effort:** medium / M · **needs the teacher’s decision**
- **Where:** LessonView vs TeachingStrip
- **Evidence:** - LessonView.tsx:130-168 (room plan and lesson page): every action is a neutral 56 px .lesson-btn. Start is .lesson-btn.start (primary-container, the mint 'Start lesson' in lesson.png and teaching-room-plan.png). End is .lesson-btn.danger (error-container fill).
- TeachingStrip.tsx:229-244: Batch entry is `primary` (dark filled), Pick a student is outlined, Start lesson is `tonal`, and End lesson is outlined `.danger` (red text only), all at the default 40 px (teaching-side-panel.png).
- So the most prominent action is Start lesson in one mode and Batch entry in the other, and End lesson is a filled red block in one and a thin red outline in the other.
- **Impact:** Teachers switch between room plan and side panel mid-lesson (both offer a switch button). The primary action and the danger action changing look between modes costs recognition at exactly the moment they are teaching.
- **Suggested fix:** 1. Extract the actions into one place, e.g. a `useLessonActions()` hook in src/hooks returning [{id, icon, label, onClick, disabled, variant: 'primary'|'neutral'|'start'|'end'}], or a `<LessonActions layout="bar|column|strip">` component.
2. Render both LessonView and TeachingStrip from it, so variants map to one class set.
3. Decide the single emphasised action: Batch entry or Start lesson.
4. Use .lesson-btn sizing in the strip too (min-height 48-56 px, full width).

### `visual-print-seating-plan-unlabelled` — The printed seating plan has no class name or date and shows a dropdown box

- **Severity / effort:** medium / S
- **Where:** Print styles / SeatingView
- **Evidence:** styles.css:677-682 (@media print) hides .nav-rail, .top-bar and .view-header button. The .top-bar is the only place the class name appears on the Seats page (TopAppBar plus ClassPicker), and SeatingView's view-header still shows the plan <select> (SeatingView.tsx:114), which prints as a form control. .seating-canvas .room-canvas { max-height: calc(100vh - 230px) } (styles.css:477) is not reset for print. The user guide sells Print 'e.g. for a cover teacher' (docs/user-guide/04-seats.md:21).
- **Impact:** A cover teacher gets an anonymous room plan with a stray 'Default ▾' box and no class, plan or date. With several classes using the same lab, that is the information they actually need.
- **Suggested fix:** 1. In styles.css add `.print-only { display: none }` and, inside @media print: `.print-only { display: block }`, `.view-header select { display: none }`, `.seating-canvas .room-canvas { max-height: none; width: 100% }`, `@page { size: A4 landscape; margin: 10mm }`.
2. In SeatingView.tsx add `<h2 className="print-only">{currentClass} · {room} — {activePlan} plan · {today}</h2>` above the canvas, with the front-of-room marker kept.

### `visual-split-settings-and-assessments` — Split SettingsView (1 384 lines) and AssessmentsView (1 056 lines) by section, and break up the 9-panel General tab

- **Severity / effort:** medium / L
- **Where:** SettingsView.tsx, AssessmentsView.tsx
- **Evidence:** SettingsView.tsx holds 13 components:
- GeneralSettings (118-462), which itself renders 8 panels: Privacy, Display size, Spreadsheet, Time zone, Parent reports, Teaching mode, Behaviour buttons with pointer-drag reorder (135-200, 321-435), and Data/backups (437-459)
- TimeZoneSettings 466, ReportSettings 505, TeachingModeSettings 531, BackupRestore 625, PluginSettings 689, SeatingPrefsEditor 755-877
- AssessmentSettings 884-1186 (topic bank, cognitive levels, mark entry, results scale)
- gradeLabel/joinAnd 1189, WeightingSettings 1200, parseTopicPaste 1262, TopicAreaTable 1277-1384

AssessmentsView.tsx holds the list and router (14-214), NewAssessmentModal (216-318), clampCell/WeightInput (320-354), QuestionSetup (356-490), QuestionGrid (492-813), QuickMarking (815-916) and MarkListView (918-1056).

settings-general.png shows only 2 of the General tab's 9 panels above the fold, so Behaviour buttons and Data sit far below.
- **Impact:** Every change to one settings panel or marking screen means navigating a 1 000+ line file, which makes styling clean-ups (inline styles, shared components) slower and riskier. The teacher has to scroll a long General page to reach behaviour buttons, which they edit often.
- **Suggested fix:** 1. Create src/components/settings/ with: SettingsView.tsx (tabs only), GeneralTab.tsx (Privacy, Display, Spreadsheet, Time zone, Parent reports), TeachingModeSettings.tsx, BehaviourButtonsEditor.tsx (plus hooks/useRowReorder.ts for the drag logic), DataSettings.tsx (with BackupRestore), PluginSettings.tsx, SeatingRulesEditor.tsx, TopicBankEditor.tsx (+TopicAreaTable, parseTopicPaste), CognitiveLevelsEditor.tsx, MarkEntrySettings.tsx and WeightingSettings.tsx.
2. Create src/components/marks/ with: AssessmentsView.tsx (router), AssessmentList.tsx, NewAssessmentModal.tsx, QuestionSetup.tsx, QuestionGrid.tsx, QuickMarking.tsx, MarkListView.tsx and markCells.ts (clampCell, WeightInput).
3. Optionally promote 'Behaviour buttons' and 'Teaching mode' to their own Settings tabs, so General is just privacy, display and data.

### `touch-mini-cards-cover-end-lesson-and-exit-mode` — Timer and noise cards cover End lesson, and one tap on them leaves teaching mode

- **Severity / effort:** high / M
- **Where:** TimerMini / NoiseMini in both teaching modes (App Overlays .mini-stack, TeachingStrip inline)
- **Evidence:** styles.css:1042-1046 `.mini-stack { position: fixed; right: 16px; bottom: 16px; z-index: 90 }`, and each card is `width: min(270px, …)` (1050, 1075) and about 92 px tall (timer-mini.png). LessonView.tsx:218-219 puts a spacer and then {endButton} last in the focus bar. With lessonBarSide = right (styles.css:463, side column, End lesson at the bottom, x W-264..W-14, y H-66..H-10) or bottom (458, End lesson at the far right of the bottom row), the card sits right on top of Start/End lesson. TimerMini.tsx:44-47 and NoiseMini.tsx:34-37 run `if (focusMode) setFocusMode(false); openPlugin(...)`, and the whole card body is that button (TimerMini.tsx:55, NoiseMini.tsx:44). So a tap meant for End lesson leaves teaching mode and runs restoreWindow(). In the strip the cards are drawn inline right above Batch entry (TeachingStrip.tsx:226-229). A stray tap there undocks the always-on-top window over the slides. Together the two cards take about 190 px of the strip's height, which leaves about 5 student rows on an 800 px panel.
- **Impact:** Teacher at the board, timer or noise meter running: reaching for End lesson or Batch entry throws the class-facing screen out of teaching mode and back into the full app, in front of the class.
- **Suggested fix:** (1) TimerMini.tsx and NoiseMini.tsx: while focusMode is on, the body tap should not call setFocusMode(false). Make the body a no-op or a pause toggle, and keep the explicit open_in_full button as the only way out. (2) App.tsx Overlays: add `bar-${userPrefs.lessonBarSide}` to `.mini-stack`. In styles.css move it to `left: 16px` for bar-right, and to `bottom: 92px` (above the bar) for bar-bottom. Or, when sideBar is true, render `<TimerMini inline/>` and `<NoiseMini inline/>` inside the LessonView focus-bar above the spacer, as the strip already does. (3) TeachingStrip.tsx:226-227: give the inline cards a compact one-line variant (`.timer-mini.inline.compact`, about 48 px: label · time · pause) and separate them from .strip-foot with a divider.

### `touch-bathroom-bar-squeezes-room-plan` — In the default side-column teaching mode, 'Out now' becomes a column that shrinks and moves the room plan

- **Severity / effort:** high / M
- **Where:** LessonView teaching mode (bar-left / bar-right), bathroom bar; TeachingStrip
- **Evidence:** LessonView.tsx:264-281 renders `.bathroom-bar` as a direct child of the shell, between .focus-bar and .seating-canvas. With the default lessonBarSide 'left' (types.ts:388) the shell is `.focus-layout.bar-left { flex-direction: row }` (styles.css:462-463). `.bathroom-bar` (531) has no flex/width rule for this case, so it takes its max-content width (the '🚻 Out now:' label plus chips: about 260 px for one student, about 430 px for two). `.focus-canvas-wrap { flex: 1 }` (451, 471) gives the room plan whatever is left. No screenshot shows this: bathroom-bar.png was taken on the normal Lesson page (guide.shots.ts:231-235). The strip has no 'Out now' list at all. A trip can only be ended by finding the student's row (TeachingStrip.tsx:208), which may be scrolled out of view.
- **Impact:** Every time a boy leaves for the bathroom mid-lesson, the whole room plan on the board shrinks (by roughly 25–45%) and jumps sideways, so the seat under the teacher's finger moves.
- **Suggested fix:** LessonView.tsx: when `sideBar` is true, render the Out-now chips inside .focus-bar as their own bar-group ('Out now', full-width chips) instead of as a flex sibling. For top/bottom bars keep the current row and add `.focus-layout > .bathroom-bar { flex: none; }`. TeachingStrip.tsx: add the same 'Out now' chips (tap = back) under .strip-head so trips can be ended without scrolling.

### `touch-randomise-no-undo` — Randomise permanently replaces the saved seating plan (and starts the lesson) with no Undo

- **Severity / effort:** high / M
- **Where:** Lesson toolbar / teaching-mode Seating group (useSeatingShuffle), also Start lesson and batch Cancel
- **Evidence:** useSeatingShuffle.ts:75-84: when the shuffle finishes it calls markSeated(), overwrites the plan with `setSeating([...cur.seating.filter(s => s.planName !== activePlan), ...result.assignments])`, then `startLesson()` (which marks every unmarked student P, appStore.ts:450-455). The toast has no action. SeatingView.tsx:100-104, by contrast, gives Clear seats an Undo. In teaching mode Randomise sits in the side column just under Pick a student (teaching-room-plan.png, y≈281 vs 189-244). After one Randomise the class is locked behind the reseat PIN, so a hand-made plan can't simply be re-run either. Same pattern: Start lesson (useLessonSession.ts:129-132) has no Undo, and BatchPanel's Cancel (BatchPanel.tsx:72-74) sits 8 px from Save and drops a whole selection with no way back.
- **Impact:** One stray tap at the board destroys a carefully hand-built seating plan, marks the register, and locks reseating until the PIN is typed, all in front of the boys.
- **Suggested fix:** useSeatingShuffle.ts: before setSeating, capture `previousPlan = cur.seating.filter(s => s.planName === activePlan)`, `wasRunning = cur.lessonRunning()` and the previous attendance. Pass `{ label: 'Undo', run }` to showToast. The run restores the plan, calls unlockSeating(), and if !wasRunning calls stopLesson() and restores the attendance. Add a similar Undo to the Start lesson toast in useLessonSession.ts:129-132. BatchPanel.tsx: when n ≥ 3, label the button 'Discard (n)' and show a toast with 'Restore selection'.

### `touch-strip-ignores-ui-scale` — The docked strip's width ignores the display-size setting, so at 125–175% its controls are clipped

- **Severity / effort:** high / M
- **Where:** TeachingStrip at userPrefs.uiScale > 1 (teachingWindow.ts, strip CSS)
- **Evidence:** teachingWindow.ts:11-13 `stripWidth = clamp(240, screenW*0.18, 340)` logical px, with no uiScale term. App.tsx:108-116 applies `zoom: uiScale` to <html>. A 1080p panel at 150% Windows scaling (or 4K at 300%) is 1280 logical px wide, which gives a 240 px window. At uiScale 1.5 that is 160 CSS px of layout. The head row then needs 'events' (~36) + 6 + four 32 px icons with 4 px gaps (140) = 182 px in 140 px (TeachingStrip.tsx:98-125; styles.css:1173-1175 has no wrap). The last icon, Exit, is cut off by `.focus-shell.strip-mode { overflow: hidden }` (1156). Already at uiScale 1.25 the student sheet's content box is 156 px (`.strip-sheet` left/right 6 px, popover padding 12, styles.css:1222). The non-wrapping `.att-seg` is 4×48 = 192 px (374), so 'E' and part of 'L' go out of view. Names are cut to about 70 px.
- **Impact:** A teacher who turns on 'Make everything bigger for a large touch panel' finds the side panel clipped: Exit and the Excused/Late buttons are out of reach mid-lesson.
- **Suggested fix:** teachingWindow.ts: change to `stripWidth(screenW, uiScale)` returning `round(min(340*s, max(240*s, screenW*0.18*s)))`, capped at about 30% of the screen. Pass userPrefs.uiScale from setFocusMode/flipSide (appStore.ts:363, TeachingStrip.tsx:61-65), and call enterDock() again when uiScale changes while docked. As a CSS safety net: `.strip-head-row { flex-wrap: wrap }`, and `.strip-sheet .att-seg { display: grid; grid-template-columns: repeat(4, 1fr); width: 100% }` with `.att-seg .att-btn { width: auto }`.

### `touch-popover-positive-negative-adjacent` — Seat pop-up: negative buttons sit right under positive ones, and the pop-up has no height limit

- **Severity / effort:** medium / M · **needs the teacher’s decision**
- **Where:** StudentActions (seat pop-up and strip sheet)
- **Evidence:** StudentActions.tsx:66-85 renders positives then negatives in one uninterrupted stack. seat-popover.png shows '+1 Asked and answered' directly above '-1 Talking / off task' with the same 6 px gap (`.bh-btn` margin-bottom 6, styles.css:521) and buttons about 40 px tall (button min-height 40, padding 9). The colours alone separate them (purple vs brown). `.behaviour-popover` (styles.css:515-518) is a fixed 300 px wide with no max-height, and is 690 px tall with the 10 default buttons (seat-popover.png). LessonView.tsx:94-97 clamps `top` to ≥4, but when the pop-up is taller than the canvas (e.g. uiScale 1.5 on 1080p with a top bar: about 634 px of canvas) Close and the last negatives fall below the plan.
- **Impact:** Standing at the board with an outstretched arm, a 6 px slip turns praise into a public negative. Each mis-tap then has to be caught on the 6-second toast.
- **Suggested fix:** StudentActions.tsx: wrap the two lists in `<div className="bh-group pos">` / `<div className="bh-group neg">` with a 14 px gap and a small heading. On the room plan (`.behaviour-popover:not(.strip-sheet)`) lay the groups out as a 2-column grid (popover width about 460 px), which roughly halves the height and puts positives and negatives on different sides. Keep a single column with a divider in the strip. styles.css: `.behaviour-popover { max-height: calc(100% - 8px); overflow-y: auto }`, `.bh-btn { min-height: 48px }`, `.att-seg .att-btn { height: 48px }`.

### `touch-attendance-tap-no-feedback` — Late and Excused leave no mark on the seat or strip row, and attendance taps have no toast or Undo

- **Severity / effort:** medium / S
- **Where:** LessonView seats, TeachingStrip rows, useLessonSession.markAttendance
- **Evidence:** LessonView.tsx:308: the badge is shown only for a bathroom trip or `status === "A"`. TeachingStrip.tsx:200 and 209-213 likewise flag only 'A'. useLessonSession.ts:123-126 markAttendance writes with no showToast (compare logBehaviour at 98-101, which has Undo). Each tap also closes the pop-up straight away (LessonView.tsx:64-67, TeachingStrip.tsx:80-83). After tapping L or E, nothing on screen changes.
- **Impact:** When a latecomer arrives mid-explanation the teacher taps L, the pop-up vanishes and nothing confirms it. A mis-tap on A vs L goes unnoticed until the register is checked.
- **Suggested fix:** LessonView.tsx:308: add badges for 'L' (e.g. 'L' or the schedule icon) and 'E' (event_busy). TeachingStrip.tsx:209: show the same marks in the row. useLessonSession.ts:123: capture the previous entry and `showToast(`Marked ${label} — ${toastName(id)}`, { label: 'Undo', run: () => setAttendance(previous) })`.

### `touch-toast-covers-strip-footer-single-undo` — Undo toast covers the strip's lesson buttons for 6 s, and its Undo is a 36 px button that the next action replaces

- **Severity / effort:** medium / M
- **Where:** Toast (App Overlays) in the strip and room plan; lesson event counter
- **Evidence:** styles.css:257-259: `.toast { position: fixed; bottom: 24px; left: 50%; min-height: 48px; max-width: min(90vw, 640px) }`. In the 240 px strip window it is 216 px wide and usually wraps to 2 lines, covering y≈24–92 px from the bottom. .strip-foot's Start/End lesson button is at 10–50 px and Pick a student at 56–96 px (styles.css:1221, TeachingStrip.tsx:229-245), and z-index 100 takes the taps. appStore.ts:470-474 keeps an Undo toast for 6000 ms, and each new toast replaces the last, so only the most recent action can be undone. `.toast-action { min-height: 36px }` (styles.css:265). The only other fix is the Behaviour log (user guide 06-behaviour-log.md:24), which means leaving teaching mode. The event counter ('14 events', TeachingStrip.tsx:99-101; LessonView.tsx:188, 224) is plain text.
- **Impact:** After each recording in the side panel, End lesson / Pick a student can't be tapped for 6 s. A mis-tap noticed two actions later can't be fixed without leaving teaching mode.
- **Suggested fix:** styles.css: `.strip-mode .toast { top: 8px; bottom: auto; left: 6px; right: 6px; transform: none; max-width: none }` (also adjust the toast-in keyframe), and `.toast-action { min-height: 44px; padding: 0 16px; font-weight: 700 }`. In focus mode with bar-bottom, raise the toast above the bar. Make the event counter a button in LessonView and TeachingStrip that opens a 'This lesson' sheet: lessonEvents newest first, each row with ✕ that calls removeBehaviourEvent and shows Undo. That gives undo for any event of the lesson without leaving teaching mode.

### `touch-small-targets-live-lesson` — Several live-lesson controls are 18–38 px, and the strip's Exit sits 4 px from Full-screen

- **Severity / effort:** medium / S
- **Where:** Strip header, toast, picker options, timer/noise cards, strip colour swatches
- **Evidence:** Strip header icons: `button.small.icon-only` = 32×32 (styles.css:104-106) with `.strip-head-actions { gap: 4px }` (1175). Palette, dock-flip, Full-screen and Exit sit side by side (TeachingStrip.tsx:103-124; teaching-side-panel.png), and Exit (restores the window) is next to Full-screen (covers the slides). Picker 'Skip absent' / 'No repeats' are 18 px checkboxes in about 20 px labels (styles.css:134, 1122; StudentPicker.tsx:199-208). Timer/noise action buttons have `min-height: 0; flex: 1` (1062, 1091) and measure about 37 px in timer-mini.png and noise-mini.png. Strip swatches are 26 px (1197). Toast Undo is 36 px (265).
- **Impact:** Fingers on a wall panel, often reaching sideways from beside the board, miss small targets. Missing between Exit and Full-screen flips the window over the slides.
- **Suggested fix:** styles.css: `.strip-head-actions { gap: 8px }` and `.strip-head-actions button.small.icon-only { width: 44px; min-height: 44px }`. Wrap the head row and put Exit at the opposite end from Full-screen, or move Exit into .strip-foot under a divider. `.picker-options label { min-height: 44px; padding: 0 10px }` with 24 px checkboxes. `.timer-mini, .noise-mini { min-height: 104px }` so each action button is ≥44 px. `.strip-swatches .swatch { width: 36px; height: 36px }`.

### `touch-room-plan-height-fixed-offsets` — Room plan height uses fixed vh offsets, so batch/bathroom bars push rows off-screen, and swiping on the plan can't scroll

- **Severity / effort:** medium / M
- **Where:** LessonView room canvas (normal and teaching mode, top/bottom bar)
- **Evidence:** styles.css:477 `.seating-canvas .room-canvas { max-height: calc(100vh - 230px) }` and 453 `.focus-shell .room-canvas { max-height: calc(100vh - 74px) }` assume a fixed amount of chrome. They ignore the batch panel (about 110 px, LessonView.tsx:262), the Out-now bar (264-281), and a focus bar that wraps to two rows (`flex-wrap: wrap`, 449; it wraps at uiScale ≥1.75 or with a plan selector). batch-selecting.png shows the back row of desks cut off at the bottom edge while selecting. `.room-canvas { touch-action: none }` (383), which LayoutDesigner dragging needs, also stops a finger swipe on the plan from scrolling the page to reach those seats. These calc() values also take no account of the uiScale zoom (App.tsx:111); this needs checking at 150%.
- **Impact:** During batch entry the back row can't be tapped without scrolling, and scrolling only works if the teacher finds a strip of margin outside the plan.
- **Suggested fix:** Make the LessonView shell a flex column (or row for side bars) of 100% height, with `.seating-canvas { flex: 1; min-height: 0 }`. Have the SVG fill it (`width:100%; height:100%`; the default preserveAspectRatio letterboxes) instead of max-height calc(100vh − N) (styles.css:453, 476, 477). RoomCanvas.tsx: add an `editable` class to the svg and limit `touch-action: none` to `.room-canvas.editable`, using `touch-action: manipulation` for lesson/seating views.

### `touch-picker-in-strip-too-small` — Pick a student in the side panel shows the name at 40 px in a 240–340 px column

- **Severity / effort:** medium / M · **needs the teacher’s decision**
- **Where:** StudentPicker opened from TeachingStrip
- **Evidence:** TeachingStrip.tsx:265-272 renders StudentPicker inside the docked window, which is 240–340 logical px wide (teachingWindow.ts:11-13). `.picker-overlay { position: fixed; inset: 0 }` (styles.css:1099) fills only that window. `.picker-name { font-size: clamp(40px, 8vw, 110px) }` (1107) bottoms out at 40 px. The narrow-window rule (1228-1231) shrinks the card padding further. `.picker-name` has no overflow-wrap, so a long single name (e.g. a 10+ letter surname at 40 px bold, about 240 px) is wider than the about 200 px card. The user guide (05-lesson.md, Pick a student) promises a name 'large enough for the back row to read' (pick-a-student.png shows the 110 px room-plan version).
- **Impact:** Cold-calling from the side panel: the boys at the back can't read whose turn it is, which defeats the picker's purpose beside the slides.
- **Suggested fix:** In TeachingStrip, when the picker opens, call a new teachingWindow helper (e.g. `enterPresent()`: un-dock to a centred window about 60% of the screen, or enterFullscreen()). Call enterDock(userPrefs.dockSide) when it closes, so the picker gets the same 110 px treatment. Add `overflow-wrap: anywhere` to `.picker-name`.

### `touch-seat-names-small-no-autofit` — Seat names are about 12 px in the Lesson view because the whole 900×640 room is drawn even when the desks fill only part of it

- **Severity / effort:** medium / M · **needs the teacher’s decision**
- **Where:** RoomCanvas in LessonView / teaching room plan
- **Evidence:** LessonView.tsx:77 `effectiveCrop = roomConfig.crop ?? { x: 0, y: 0, w: ROOM_W, h: ROOM_H }` (room.ts: 900×640). In lesson.png the canvas is 1150×570 and height-limited (scale ≈0.89). Names (13 units, RoomCanvas.tsx:256) render at ≈11.6 px and surnames (10 units, 257) at ≈8.9 px, while the furniture uses only about x 385–1045 of 1150 px. In teaching-room-plan.png names are about 14 px with white bands left and below. useSeatingShuffle.ts:11-13 says the animation is so 'the class can see' the shuffle, so after Randomise the boys look to the board to find their seat.
- **Impact:** After a reshuffle, boys beyond the first rows can't read where they sit, and the teacher squints at 9 px surnames.
- **Suggested fix:** LessonView.tsx:77 (and SeatingView.tsx:188): when roomConfig.crop is null, compute the crop from the desks' bounding box (seatSlots plus the desk rects) with a margin of about 24 units, instead of the full room. Raise `.seat-surname` from 10 to 11.5 units (RoomCanvas.tsx:257). Consider a 'Seat names in teaching mode' size (default 1.25×) in Settings → Teaching mode, multiplied into seatFontScale when focusMode is on.

### `touch-emoji-as-icons` — 🚻 ✗ ✓ • are typed text glyphs and render inconsistently on Windows

- **Severity / effort:** low / S
- **Where:** Seat badges, Out-now bar, strip rows, picker tally, bathroom toasts
- **Evidence:** RoomCanvas.tsx:320-324 draws `content.badge` as SVG <text> with `.seat-badge { fill: var(--danger) }` (styles.css:397). LessonView.tsx:308 passes '🚻' or '✗'. On Windows WebView2, 🚻 comes from Segoe UI Emoji as a colour glyph that ignores `fill`, about 13 px in a seat corner. LessonView.tsx:266 '🚻 Out now:' and 276 '… ✓'. TeachingStrip.tsx:205 '✓'/'•' and 208-212 '🚻'/'✗'. StudentPicker.tsx:144-145 '✓ n' '✗ n'. Toasts in useLessonSession.ts:88, 91. Meanwhile the pop-up uses the Material `wc` icon (StudentActions.tsx:63), and Icon.tsx already holds `wc`, `close` and `check` paths (Icon.tsx:33-34, 89). bathroom-bar.png shows the emoji next to Material-styled chips.
- **Impact:** On the class-facing board the status marks change style from screen to screen. The colour bathroom pictogram ignores the app's status colours and is hard to tell apart at seat size.
- **Suggested fix:** Icon.tsx: export the PATHS lookup or an `IconGlyph({name, x, y, size})` that renders a nested `<svg x y width height viewBox="0 -960 960 960"><path d=…/></svg>`. Change SeatContent.badge to `IconName` and draw it with IconGlyph in RoomCanvas.tsx:320-324 (and the batch tick at 315-319). Replace the text glyphs in LessonView.tsx:266/276, TeachingStrip.tsx:205-212 and StudentPicker.tsx:144-145 with <Icon name="wc"|"close"|"check">. Drop the emoji from the toast strings in useLessonSession.ts:88/91.

### `touch-popover-title-full-name` — Seat pop-up always shows the full name, even when privacy mode shows first names only on seats

- **Severity / effort:** low / S
- **Where:** StudentActions header (class-facing pop-up)
- **Evidence:** StudentActions.tsx:32 renders `{studentName(student)}` (types.ts:419-421: always first + last). The seats (LessonView.tsx:305-307), the strip rows (TeachingStrip.tsx:207), the picker (StudentPicker.tsx:83) and the Out-now chips (LessonView.tsx:276) all respect `displayStudentName(s, userPrefs.seatNameStyle)` (privacy.ts:9-17). seat-popover.png shows 'Ella Evans'.
- **Impact:** A teacher who chose 'First name' or 'First name + initial' for the board still has surnames shown to the class every time a seat is tapped.
- **Suggested fix:** StudentActions.tsx:32: `{userPrefs.privacyMode ? displayStudentName(student, userPrefs.seatNameStyle) : studentName(student)}` (import displayStudentName from ../lib/privacy).

### `touch-escape-in-picker-exits-teaching-mode` — Esc in the picker (or with a seat pop-up open) also exits teaching mode

- **Severity / effort:** low / S
- **Where:** App focus-mode Escape handler vs StudentPicker / seat pop-up
- **Evidence:** App.tsx:96-103 exits teaching mode on any Escape unless `dialog` is set, using a bubbling window listener. StudentPicker.tsx:103-112 adds another bubbling window listener that closes the picker but does not stop propagation, so both run: the picker closes and setFocusMode(false) runs restoreWindow(). The seat pop-up and strip sheet have no Escape handler of their own, so Esc there also leaves teaching mode. useBatchEntry.ts:45-56 already shows the right pattern (capture phase + `e.stopImmediatePropagation()`). The user guide (05-lesson.md) documents Esc as 'Close' for the picker.
- **Impact:** A teacher using a keyboard or presenter at the panel presses Esc to dismiss the picker and the whole teaching layout collapses back to the full app.
- **Suggested fix:** StudentPicker.tsx:104-110: register with `window.addEventListener('keydown', onKey, true)` and call `e.stopImmediatePropagation()` before closing. Add the same capture-phase Escape handler in LessonView (when `popover` is set) and TeachingStrip (when `actionsFor` is set) to close the pop-up/sheet first.
