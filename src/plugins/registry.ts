// The plugin catalogue.
//
// A plugin is an extra teaching tool that ships inside the app but stays out of
// the way until a teacher switches it on in Settings → Tools (the interface
// calls them tools; the code and saved settings still say plugin). Each one is an
// ordinary React view, compiled in and lazily loaded, so it looks like the rest
// of the app and reaches the disk through the same audited Rust commands as
// everything else.
//
// Adding one is a few lines at the bottom of this file — see README.md.

import type { ComponentType } from "react";
import type { IconName } from "../components/Icon";

export interface PluginManifest {
  /**
   * Stable identifier. It is written into settings.csv, so renaming one turns
   * the plugin off for everyone who had it on.
   */
  id: string;
  name: string;
  /** One line, shown on the Home card. */
  tagline: string;
  /** A sentence or two for the Settings list: what it does and what it saves. */
  description: string;
  /**
   * Material Symbol for the Home card, the navigation drawer and Settings →
   * Tools. It must be one in components/Icon.tsx; add it there if not.
   */
  icon: IconName;
  /**
   * Loads the plugin's view. A dynamic import keeps each plugin in its own
   * chunk, so switching them on costs nothing until one is opened.
   */
  load: () => Promise<ComponentType>;
}

/** The test timer's id; the TimerMini pop-up opens and checks it by this. */
export const TEST_TIMER_ID = "test-timer";
/** The dashboards' id; student-name shortcuts elsewhere open it by this. */
export const DASHBOARDS_ID = "class-dashboards";
/** The parent reports' id; the dashboards offer printing only when it's on. */
export const PARENT_REPORTS_ID = "parent-reports";
/** The noise meter's id; the NoiseMini pop-up opens and checks it by this. */
export const NOISE_METER_ID = "noise-meter";

export const PLUGINS: PluginManifest[] = [
  {
    id: DASHBOARDS_ID,
    name: "Class & student dashboards",
    tagline: "How the class and each student are doing — behaviour, answers and marks.",
    description:
      "Two dashboards for the open class. Class: a written summary, behaviour week by week, the top issues, students to watch, stars, best answerers, rarely asked, trips outside and attendance, plus the marks analysis. Student: everything recorded for one child, each assessment against the class average, and topic strengths. Filter to the last 2 weeks, 4 weeks or everything. It only reads your class data; nothing new is saved. While it's on, the chart button in the Students list and names in the Behaviour log open a student's dashboard.",
    icon: "bar_chart",
    load: () => import("../components/DashboardView").then((m) => m.default),
  },
  {
    id: PARENT_REPORTS_ID,
    name: "Parent reports",
    tagline: "One-page A4 reports for parent evenings.",
    description:
      "Prints a one-page report per student — for one child or the whole class — with a parent-friendly summary, marks against the class average, topic strengths, behaviour, questions answered, attendance and trips outside the classroom. Choose the period and sections, type a teacher's comment on each page (saved with the class in report_comments.csv), and there are lines for notes during the meeting. With the dashboards on too, each dashboard gets a Print button.",
    icon: "print",
    load: () => import("../components/report/ParentReportsView").then((m) => m.default),
  },
  {
    id: TEST_TIMER_ID,
    name: "Test timer",
    tagline: "A big countdown for tests, with reading and writing time.",
    description:
      "A full-screen countdown for exams and timed tasks, with optional reading and writing phases, a chime at each change, and three display styles: countdown circle, hourglass or flip clock. Save reusable presets. Leave the timer and it keeps running as a small pop-up in the corner, which turns red when time is up.",
    icon: "hourglass_top",
    load: () => import("./test-timer/TestTimer").then((m) => m.default),
  },
  {
    id: "clock",
    name: "Clock",
    tagline: "A big classroom clock — a round face or flip digits, in any time zone.",
    description:
      "A full-screen clock for the classroom wall: a round analog face or the test timer's flip digits, 24- or 12-hour, with or without seconds and the date. Follows the app's time zone or any other you pick. Nothing is saved to your data; this computer just remembers the face and options you last chose.",
    icon: "schedule",
    load: () => import("./clock/ClockView").then((m) => m.default),
  },
  {
    id: "stopwatch",
    name: "Stopwatch",
    tagline: "A seven-segment lab stopwatch with laps.",
    description:
      "A big LED-style stopwatch to hundredths of a second for practicals and races: start, pause, lap and restart, by button or with the Space, L and R keys. Laps are listed with their split and running total, the fastest and slowest marked. Keeps running if you leave the screen; nothing is saved.",
    icon: "timer",
    load: () => import("./stopwatch/StopwatchView").then((m) => m.default),
  },
  {
    id: "graph-paper",
    name: "Graph paper generator",
    tagline: "Build printable axes and grids at an exact mm size.",
    description:
      "Generates graph paper and axes to your own dimensions — block size in mm, minor squares, line weights, arrows, tick marks and colours — with a live preview. Saves a 300 dpi PNG that drops into Word or a worksheet at exactly the size shown.",
    icon: "grid_on",
    load: () => import("./graph-paper/GraphPaper").then((m) => m.default),
  },
  {
    id: "practical-graph",
    name: "Practical graph plotter",
    tagline: "Plot readings, fit the line, read off the gradient.",
    description:
      "Type or paste a table of readings and get the plotted graph: crosses for the points, a least-squares line of best fit, and its gradient, y-intercept and R² — with the option to force the line through the origin. Saves a 300 dpi PNG for a practical write-up or a memo.",
    icon: "show_chart",
    load: () => import("./practical-graph/PracticalGraph").then((m) => m.default),
  },
  {
    id: "motion-graph",
    name: "Motion graph builder",
    tagline: "One journey, three graphs that always agree.",
    description:
      "Describe a journey a stage at a time — how long it lasts, how fast it ends — and get the position, velocity and acceleration graphs derived from it, so the three can never contradict each other. Leave any of them blank for the question version and draw them all for the memo. Saves a 300 dpi PNG.",
    icon: "speed",
    load: () => import("./motion-graph/MotionGraph").then((m) => m.default),
  },
  {
    id: "galvanic-cell",
    name: "Galvanic cell animator",
    tagline: "Watch a galvanic cell work, with the reading following the Nernst equation.",
    description:
      "An animated galvanic cell for the board. Pick the two half-cells from the standard electrode potentials table and watch the electrons in the wire, the ions in the solutions and the salt bridge, and the voltmeter reading. Change a concentration, the temperature or the electrolyte, take the salt bridge out or make the electrodes bigger, and the reading follows the Nernst equation; Run the cell and it discharges to equilibrium. Under the picture, the memo: half-reactions, net equation, E°cell, cell notation, the Nernst working and the usual exam points. Question mode hides the answers; Show to class fills the screen. Saves a PNG of the picture; nothing is saved to your data.",
    icon: "science",
    load: () => import("./galvanic-cell/GalvanicCell").then((m) => m.default),
  },
  {
    id: "chemistry-reference",
    name: "Chemistry reference",
    tagline: "The periodic table, colour-coded, with every element's details a tap away.",
    description:
      "An interactive periodic table for the board: the data sheet's symbols, masses and electronegativities, coloured by group (alkali metals, halogens, noble gases…), by state at room temperature or by metal / non-metal, with highlights for the diatomic, ferromagnetic and radioactive elements. A simplified view shows the first 20 elements and the ones the course keeps meeting. Tap an element for its shell diagram, Aufbau diagram, electron configuration in spdf notation, electronegativity, ionisation energies, melting and boiling points, oxidation states and notes. Show to class fills the screen. Nothing is saved to your data.",
    icon: "table_chart",
    load: () => import("./chemistry/ChemistryReference").then((m) => m.default),
  },
  {
    id: "titration",
    name: "Titration simulator",
    tagline: "A burette, a flask, an indicator, and the pH curve as you go.",
    description:
      "A titration on the board: choose what goes in the burette and the flask (HCl, HNO₃, H₂SO₄, HF, ethanoic, methanoic, oxalic, phosphoric and carbonic acids; NaOH, KOH, Ba(OH)₂, Ca(OH)₂, Mg(OH)₂, ammonia, sodium carbonate, sodium hydrogen carbonate; water), their concentrations and the flask's volume, and an indicator (methyl orange, bromothymol blue, phenolphthalein, litmus and others, or universal indicator). Run titrant in a drop at a time, by a measured volume or with the tap open; stir to mix, or let it auto-mix; watch the flask's colour and the pH graph against volume added. The memo gives the mole ratio, the equivalence volumes and pH, and which indicator suits; an Unknown mode hides the flask's concentration for the class to find. Keeps going if you leave the screen; nothing is saved.",
    icon: "experiment",
    load: () => import("./titration/Titration").then((m) => m.default),
  },
  {
    id: NOISE_METER_ID,
    name: "Class noise meter",
    tagline: "Set a limit; the screen warns the class when it's too loud.",
    description:
      "Listens through the computer's microphone and shows the room's noise as a percentage of a limit you set (100 % = at the limit), with the dB(A) reading under it, a green / amber / red bar on the same scale and a graph of the last 5 minutes. When the class stays over the limit the screen flashes red with a “TOO LOUD” banner until it settles. It keeps listening when you go to another screen, with a small pop-up in the corner, until you press Stop. Can be calibrated against a phone sound-meter app. Nothing is recorded or saved.",
    icon: "graphic_eq",
    load: () => import("./noise-meter/NoiseMeter").then((m) => m.default),
  },
];

export function pluginById(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id);
}

/**
 * The plugins a teacher has switched on, in catalogue order. Ids left over from
 * a plugin that no longer ships are ignored here rather than deleted from
 * settings.csv, so downgrading the app doesn't quietly lose the choice.
 */
export function enabledPlugins(enabledIds: string[]): PluginManifest[] {
  return PLUGINS.filter((p) => enabledIds.includes(p.id));
}

/** Toggle one id, returning the new list to store in UserPrefs. */
export function togglePluginId(enabledIds: string[], id: string): string[] {
  return enabledIds.includes(id) ? enabledIds.filter((e) => e !== id) : [...enabledIds, id];
}
