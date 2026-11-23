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
  /**
   * True for a tool that is about a class's records (the dashboards, the
   * parent reports). Those stay in the desktop app; every other tool is also
   * on the tools website (see src/tools/ToolsApp.tsx).
   */
  needsClassData?: boolean;
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
    needsClassData: true,
  },
  {
    id: PARENT_REPORTS_ID,
    name: "Parent reports",
    tagline: "One-page A4 reports for parent evenings.",
    description:
      "Prints a one-page report per student — for one child or the whole class — with a parent-friendly summary, marks against the class average, topic strengths, behaviour, questions answered, attendance and trips outside the classroom. Choose the period and sections, type a teacher's comment on each page (saved with the class in report_comments.csv), and there are lines for notes during the meeting. With the dashboards on too, each dashboard gets a Print button.",
    icon: "print",
    load: () => import("../components/report/ParentReportsView").then((m) => m.default),
    needsClassData: true,
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
    id: "slope-simulator",
    name: "Block on a slope",
    tagline: "Will it slide? A block on a slope, with its free-body diagrams.",
    description:
      "Set up an inclined-plane question — the block's mass, the angle, μₛ and μₖ (or frictionless), an applied force parallel to the slope or at an angle to it, a starting push, or a hanging mass over a pulley at the top — and run it: the block stays put while static friction can hold it, or slides, speeds up, slows down and stops, exactly as Fnet = ma says. Tilt the slope until it slips (tan θ = μₛ) or cut the string mid-run. Beside the picture, the free-body diagrams drawn the IEB way (a dot, arrows away from it, to scale, labelled Fg, FN, Ff or in words) with the weight resolved along the slope; under it a velocity–time graph and the memo: the components of the weight, the normal force, static or kinetic friction and why, Newton's second law for each body and where it stops. Examples follow the papers' slope questions. Question mode hides the numbers; Show to class fills the screen. Saves the sketch and the diagrams as 300 dpi PNGs; nothing is saved to your data.",
    icon: "signal_cellular_0_bar",
    load: () => import("./slope/SlopeSimulator").then((m) => m.default),
  },
  {
    id: "collisions",
    name: "Collisions and impulse",
    tagline: "Two trolleys collide: momentum, kinetic energy and the impulse, before and after.",
    description:
      "Two trolleys on a frictionless track, A on the left and B on the right. Choose what happens — they stick together, an elastic collision, A's velocity after is given (as the papers usually give it), or a spring pushes them apart — with their masses, velocities and the contact time, or start from an example. Run it and watch them collide, slowed down through the contact, with their velocity arrows; the graphs draw velocity and momentum against time (the total momentum a flat line) and the force on each during the contact, equal and opposite, the area under it — the impulse — shaded, with the average force Δp/Δt. Compare at double the contact time keeps the first force graph dashed: the same area, half the height. The memo works it the IEB way: a sign convention (right or left positive), Σp before = Σp after solved for the unknown, the kinetic energy before and after to decide elastic or inelastic, Δp of each, and the impulse and average force with Newton's third law; it says when the numbers can't happen (A passing through B, or kinetic energy gained in a collision). Question mode hides what happens after; Show to class fills the screen. Saves the sketch and the graphs as 300 dpi PNGs; nothing is saved to your data.",
    icon: "compare_arrows",
    load: () => import("./collisions/CollisionsView").then((m) => m.default),
  },
  {
    id: "generator",
    name: "Generator",
    tagline: "Turn the coil and watch Φ, ΔΦ/Δt and the emf drawn against time.",
    description:
      "An AC generator with slip rings, or a DC one with a split-ring commutator, drawn the way the papers draw it: a coil between N and S, brushes to the terminals X and Y and a centre-zero meter, with a view along the axis showing the coil, the normal, θ and the induced current (⊙ / ⊗). Turn it steadily at a chosen speed and direction, or drag the crank to turn it by hand — fast, slow, backwards or not at all — and the flux (Φ = BA cos θ), the rate of change of flux and the emf (emf = −N ΔΦ/Δt) are drawn against time as it turns, with the moments the coil is perpendicular or parallel to the field marked. Keep a set of graphs dashed and compare — Compare at half speed does it in one go: half the peak, twice the period. Notes beside it give Faraday's and Lenz's laws in the SAG's words. Saves the generator and the graphs as 300 dpi PNGs; nothing is saved to your data.",
    icon: "wind_power",
    load: () => import("./generator/GeneratorView").then((m) => m.default),
  },
  {
    id: "circuit-builder",
    name: "Circuit builder",
    tagline: "Build an exam-style circuit, switch it on and read the meters.",
    description:
      "Draw a circuit the way the exam papers do — black-and-white IEC symbols on a grid: cells and batteries (with internal resistance), resistors, lamps, rheostats, ammeters, voltmeters, switches, fuses and diodes — or start from an example (series and parallel lamps, internal resistance, two switches, a rheostat, diodes, a fuse, meters connected wrongly). Run it and every ammeter and voltmeter shows its reading, each lamp glows with the power it uses, and the current moves round the wires (conventional or electron flow). Tap a switch to open or close it, slide the rheostat, change any value and watch the readings follow. Under the circuit, the memo: each meter, the cell's terminal voltage and lost volts, and V, I and P for every part. Question mode hides the readings; Show to class fills the screen. Saves the diagram as a 300 dpi PNG for a paper, with or without the readings, and the circuit itself as a file to open again. Nothing is saved to your data; this computer remembers the circuit you were last working on.",
    icon: "electrical_services",
    load: () => import("./circuit-builder/CircuitBuilder").then((m) => m.default),
  },
  {
    id: "photoelectric",
    name: "Photoelectric effect and spectra",
    tagline: "Shine light on a metal: photons in, electrons out — and the lines atoms give out.",
    description:
      "A vacuum photocell for the board: choose the metal (or type a paper's work function) and the light — its wavelength or frequency, and its intensity — and watch the photons arrive and the photoelectrons leave for the collector, or nothing happen below the threshold frequency however bright the light. A microammeter reads the photocurrent. Beside it, the graphs the papers ask about: Eₖ(max) against frequency (gradient h, f₀ on one axis and −W₀ on the other, with a second metal's parallel line to compare) and Eₖ(max) and the current against intensity. The memo works it all with the data sheet's constants — nm to m, f = c/λ, E = hf, eV to J, f₀ and λ₀, E = W₀ + Eₖ(max) and v_max. A second tab, Emission spectra, has hydrogen's energy-level diagram: tap a level to excite the electron or make it fall, or run the discharge tube, and the photon given out and its line on the spectrum appear, with the working; and the line spectra of hydrogen, helium, neon, sodium and mercury tubes, with a mystery tube to identify. Question mode hides the answers; Show to class fills the screen. Saves the pictures and graphs as 300 dpi PNGs; nothing is saved to your data.",
    icon: "flare",
    load: () => import("./photoelectric/PhotoelectricView").then((m) => m.default),
  },
  {
    id: "reaction-rates",
    name: "Reaction rates",
    tagline: "Collision theory in a beaker: who collides, who reacts, and the Maxwell–Boltzmann curve.",
    description:
      "A metal reacting with an acid, seen as particles: the acid's particles move through the solution, each with its reactive end, glowing when it has at least the activation energy, and hit the metal at the bottom of the beaker. A collision with enough energy and the right orientation is effective — the metal atom dissolves and a bubble of gas forms; the others bounce off, marked as not enough energy or the wrong way round. Change the temperature, the acid's concentration, the surface area of the metal (one lump, six pieces or a powder, the same mass each way) or add a catalyst, and watch the rate change. Beside it, the Maxwell–Boltzmann distribution drawn from the beaker's own particles, with Eₐ (and the catalyst's lower Eₐ) and the particles beyond it shaded, and the gas formed against time, levelling off when the limiting reagent runs out. Keep one run dashed, change one condition and run again to compare the curves; the notes explain the difference by collision theory. Question mode hides the explanations; Show to class fills the screen. Saves the beaker and the graphs as 300 dpi PNGs; nothing is saved to your data.",
    icon: "bubble_chart",
    load: () => import("./reaction-rates/ReactionRates").then((m) => m.default),
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
    id: "electrolytic-cell",
    name: "Electrolytic cell",
    tagline: "Switch on the supply and see what forms at each electrode, and how much.",
    description:
      "An electrolytic cell for the board: a DC supply and an ammeter, one beaker and two electrodes. Choose a set-up — CuCl₂ or CuSO₄ with carbon electrodes, copper electrodes, refining impure copper (with the anode sludge), copper-, silver- or nickel-plating a spoon, brine in the chlor-alkali membrane cell, dilute NaCl, acidified water with the gases collected (2 : 1), KI, molten NaCl or molten PbBr₂ — or pick your own electrolyte, concentration and electrodes, and the tool works out what is reduced and oxidised from the standard electrode potentials (concentrated chloride gives Cl₂, dilute gives O₂). Switch on and watch the electrons, the ions moving to the electrodes, the bubbles, the metal plating out, the anode dissolving and the colour fading; set the current and switch off after a set time. Under the picture, the memo: the competing species at each electrode and why one wins, the half-reactions and net equation, the least voltage needed and Faraday's law (Q = It, n(e⁻), the mass plated and the gas volume at STP), with the usual exam points. Question mode hides the answers but leaves what the class can see; Show to class fills the screen. Saves a PNG of the picture; nothing is saved to your data.",
    icon: "bolt",
    load: () => import("./electrolytic-cell/ElectrolyticCell").then((m) => m.default),
  },
  {
    id: "chemistry-reference",
    name: "Chemistry reference",
    tagline: "The periodic table, colour-coded, with every element's details a tap away.",
    description:
      "An interactive periodic table for the board: the data sheet's symbols, masses and electronegativities, coloured by group (alkali metals, halogens, noble gases…), by state at room temperature or by metal / non-metal, with highlights for the diatomic, ferromagnetic and radioactive elements. A simplified view shows the first 20 elements and the ones the course keeps meeting. Tap an element for its shell diagram, Aufbau diagram, electron configuration in spdf notation, electronegativity, ionisation energies, melting and boiling points, oxidation states and notes. A second tab, Substances & bonds, draws the common inorganic and organic substances with their bonds, average bond enthalpies and δ+ / δ− polarity; a third, Polyatomic ions, lists the syllabus table and the usual extras with Lewis diagrams, formal charges, the salts they form and their solubility. Then a Quiz on all of it, the data sheet's tables (tap two half-reactions to make a cell) and an equation balancer with reaction types and oxidation numbers. Show to class fills the screen. Nothing is saved to your data.",
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

/** The tools that work without any class data: the ones on the tools website. */
export function webTools(): PluginManifest[] {
  return PLUGINS.filter((p) => !p.needsClassData);
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
