# 9. Teaching tools

[← Dashboards and parent reports](08-dashboards-and-reports.md) · [Contents](../README.md) · Next: [Settings →](10-settings.md)

ClassKernel ships with extra tools that stay **switched off** until you want them, so the app is exactly as simple
as you need. Switch any of them on under [Settings → Tools](10-settings.md#tools). They then appear as cards under
**Tools** on Home and in the expanded navigation drawer.

<img src="../images/nav-drawer.png" alt="The navigation drawer listing the switched-on tools" align="right" height="600">

| Tool | In one line |
| --- | --- |
| [Class & student dashboards](08-dashboards-and-reports.md#class--student-dashboards) | How the class and each student are doing. |
| [Parent reports](08-dashboards-and-reports.md#parent-reports) | One-page A4 reports for parent evenings. |
| [Test timer](#test-timer) | A big countdown with reading and writing time. |
| [Clock](#clock) | A full-screen classroom clock. |
| [Stopwatch](#stopwatch) | A lab stopwatch with laps. |
| [Class noise meter](#class-noise-meter) | Warns the class when it's too loud. |

Each tool opens full-page with a **←** back to Home in the top bar. Tools are built into the app, so they work
offline like everything else.

**The science tools** — the chemistry reference, titration simulator, galvanic cell animator, practical graph
plotter, motion graph builder and graph paper generator — are a website of their own,
**[ClassKernel Science](../science/README.md)**, so they open on any computer with nothing to install. The last card
under **Tools** on Home (and **Open** beside *Science tools* in Settings → Tools) opens it in your browser; it needs
the internet.

<br clear="right">

## Test timer

A big countdown for tests and timed tasks.

![Setting up the test timer](../images/test-timer-setup.png)

**Setting up**

- **Reading time** and **Writing time** in minutes. Set either to 0 to leave that phase out.
- **Display style**: **Countdown circle**, **Hourglass** (falling pixels) or **Flip clock**.
- **Chime** at each phase change and when time is up.
- **Saved timers**: **Save current settings** stores the setup as a preset (e.g. *10 read · 40 write*); choose one
  from **Load a preset…** next time. Each preset has a **Delete** button.

Press **Start**.

![The test timer running](../images/test-timer-running.png)

**While it runs**

The screen shows the phase (*Reading time*, *Writing time*, then *Time's up*), the time now, and when the phase
**ends**. The colour moves from green through blue and orange to red as each phase runs down.

| Button | What it does |
| --- | --- |
| **Pause** / **Resume** | Stops and restarts the countdown. |
| **+1 min** | Adds a minute to the current phase. |
| **Skip phase** / **End** | Jumps to the next phase, or ends the last. |
| **Fullscreen** | Fills the screen. |
| **Stop** | Stops the timer and goes back to the setup. |

**On other screens** the timer keeps running as a small pop-up in the bottom-right corner (inside the side panel in
teaching mode). It has a pause button, and tapping it (or its open button) returns to the full timer. When time is
up the pop-up turns red and stays until you close it.

![The test timer's pop-up](../images/timer-mini.png)

## Clock

A full-screen classroom clock.

![The clock, analog face](../images/clock-analog.png)

| Control | Choices |
| --- | --- |
| **Analog** / **Digital** | A round face, or the timer's flip digits. |
| **Time zone** | The app's time zone (Settings → General) or any other — handy for a field trip or an overseas exam centre. |
| **24-hour** / **12-hour** | Hour format. |
| **Seconds**, **Date** | Show or hide them. |
| **Fullscreen** | Fills the screen. |

![The clock, digital face](../images/clock-digital.png)

The clock saves nothing to your data; this computer just remembers the face and options you last chose.

## Stopwatch

A seven-segment LED-style stopwatch to hundredths of a second, for practicals and races.

![The stopwatch with laps](../images/stopwatch.png)

| Button | Key | What it does |
| --- | --- | --- |
| **Start** / **Pause** / **Resume** | **Space** | Starts and pauses. |
| **Lap** | **L** | Records a lap while running. |
| **Restart** | **R** | Clears the time and laps. |
| **Fullscreen** | | Fills the screen. |

Laps are listed newest first, with each lap's time and the running total; the **fastest** and **slowest** laps are
marked. The stopwatch keeps running if you leave the screen. Nothing is saved.

## Class noise meter

Listens through the computer's microphone and shows the class how loud the room is against a limit you set.
**Nothing is recorded or saved**; the microphone is only open while the meter runs.

![The class noise meter](../images/noise-meter.png)

**Reading the display**

- The big figure is the noise as a **percentage of your limit**: 100% means *at the limit*, so "stay under 100" is
  the whole rule for the class. The **dB(A)** reading is under it.
- The status reads *Nice and quiet*, *Getting close…* (within 5 dB(A) of the limit) or *Too loud!*, and the colours
  go green, amber, red to match.
- The **bar** runs from 0 to 150% of the limit, with the limit marked at 100%.
- The **graph** shows the last 5 minutes in dB(A), with the limit as a dashed line.
- When the room stays over the limit for a second, the screen **flashes red** with a *TOO LOUD — bring it down*
  banner. It clears after two seconds back under the limit.

**Controls**

| Control | What it does |
| --- | --- |
| **Start** / **Stop** | Opens and closes the microphone. |
| **Show to class** | Fills the screen with just the display (right). **✕** or **Esc** returns to the controls. |
| **Keep below − +** | The limit in dB(A) (30 to 110; 65 to start with). |
| **Microphone** | Appears when the computer has more than one. |
| **This session** | The peak level, the number of alarms and the time over the limit. **Reset** clears them. |
| **Calibrate** | A PC microphone can't measure true loudness by itself. Once per microphone, while the meter runs, hold a phone sound-meter app beside the computer, type its reading and press **Set**. Until then the display says *Not calibrated — readings are approximate*. |

![The noise meter shown to the class](../images/noise-meter-class-view.png)

**On other screens** the meter keeps listening, as a small pop-up in the bottom-right corner (inside the side panel
in teaching mode) showing the % and dB(A) in the same colours, with **Stop** and a button back to the meter. It
stacks with the test timer's pop-up. Switching the tool off in Settings also stops it.

![The noise meter's pop-up](../images/noise-mini.png)
