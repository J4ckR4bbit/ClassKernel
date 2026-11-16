// The science tools, in the order they're listed on the home page.
//
// Each one is an ordinary React view in src/tools/<id>/, loaded on demand so
// opening the site costs only the list. The id is the tool's address
// (…/#/galvanic-cell): links teachers have bookmarked or shared rely on it, so
// never rename one. They are the same ids these tools had inside ClassKernel.

import type { ComponentType } from "react";
import type { IconName } from "@classkernel/ui/Icon";

export interface ToolManifest {
  id: string;
  name: string;
  /** One line, shown on the home page's card. */
  tagline: string;
  /** A Material Symbol from packages/ui/src/Icon.tsx; add it there if not. */
  icon: IconName;
  load: () => Promise<ComponentType>;
}

export const TOOLS: ToolManifest[] = [
  {
    id: "chemistry-reference",
    name: "Chemistry reference",
    tagline: "The periodic table, substances and bonds, polyatomic ions, a quiz, the data sheet and an equation balancer.",
    icon: "table_chart",
    load: () => import("./tools/chemistry/ChemistryReference").then((m) => m.default),
  },
  {
    id: "titration",
    name: "Titration simulator",
    tagline: "A burette, a flask, an indicator, and the pH curve as you go.",
    icon: "experiment",
    load: () => import("./tools/titration/Titration").then((m) => m.default),
  },
  {
    id: "galvanic-cell",
    name: "Galvanic cell animator",
    tagline: "Watch a galvanic cell work, with the reading following the Nernst equation.",
    icon: "science",
    load: () => import("./tools/galvanic-cell/GalvanicCell").then((m) => m.default),
  },
  {
    id: "practical-graph",
    name: "Practical graph plotter",
    tagline: "Plot readings, fit the line, read off the gradient.",
    icon: "show_chart",
    load: () => import("./tools/practical-graph/PracticalGraph").then((m) => m.default),
  },
  {
    id: "motion-graph",
    name: "Motion graph builder",
    tagline: "One journey, three graphs that always agree.",
    icon: "speed",
    load: () => import("./tools/motion-graph/MotionGraph").then((m) => m.default),
  },
  {
    id: "graph-paper",
    name: "Graph paper generator",
    tagline: "Build printable axes and grids at an exact mm size.",
    icon: "grid_on",
    load: () => import("./tools/graph-paper/GraphPaper").then((m) => m.default),
  },
];

export function toolById(id: string): ToolManifest | undefined {
  return TOOLS.find((t) => t.id === id);
}
