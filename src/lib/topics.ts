// Small read helpers over the app-wide topic bank (topics.csv). Topics are a
// flat list of { grade, area, subtopic, short } rows; these turn that into the
// grade → area → subtopics views the assessment UI needs.

import { TopicEntry } from "./types";

/** Distinct grades that have any topic rows, sorted. */
export function gradesInTopics(topics: TopicEntry[]): string[] {
  return [...new Set(topics.map((t) => t.grade))].sort();
}

/** Content areas defined for a grade, in first-seen order. */
export function areasForGrade(topics: TopicEntry[], grade: string): string[] {
  const seen: string[] = [];
  for (const t of topics) {
    if (t.grade === grade && !seen.includes(t.area)) seen.push(t.area);
  }
  return seen;
}

export interface Subtopic {
  area: string;
  subtopic: string;
  short: string;
}

/** Subtopics for a grade, optionally limited to one content area. */
export function subtopicsForGrade(topics: TopicEntry[], grade: string, area?: string): Subtopic[] {
  return topics
    .filter((t) => t.grade === grade && t.subtopic && (!area || t.area === area))
    .map((t) => ({ area: t.area, subtopic: t.subtopic, short: t.short }));
}

/** The short label for a subtopic name (falls back to the name itself). */
export function shortLabel(topics: TopicEntry[], grade: string, subtopic: string): string {
  if (!subtopic) return "";
  const t = topics.find((t) => t.grade === grade && t.subtopic === subtopic);
  return t?.short || subtopic;
}
