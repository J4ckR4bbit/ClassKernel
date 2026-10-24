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

// ---------- grades sharing one list ----------
// A grade can use another grade's list instead of its own (settings.csv
// `topic_links`, e.g. "11=10;12=10"). The list stays under the grade that owns
// it in topics.csv; the grades sharing it have no rows of their own.

/** Grade → the grade whose topic list it uses. */
export type TopicLinks = Record<string, string>;

/** The topic rows and the sharing links, changed together. */
export interface TopicBank {
  topics: TopicEntry[];
  links: TopicLinks;
}

/** "8" before "10"; anything that isn't a number sorts as text. */
const byGrade = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** The grade whose list `grade` uses: itself, unless it shares another grade's. */
export function topicGrade(links: TopicLinks, grade: string): string {
  const seen = new Set<string>();
  let g = grade;
  // Follows a hand-edited chain (12 → 11 → 10), and stops at a loop.
  while (links[g] && !seen.has(g)) {
    seen.add(g);
    g = links[g];
  }
  return g;
}

/** Every grade using the same list as `grade`, itself included, in grade order. */
export function topicGroup(links: TopicLinks, grade: string): string[] {
  const owner = topicGrade(links, grade);
  const group = new Set([owner, grade]);
  for (const g of Object.keys(links)) if (topicGrade(links, g) === owner) group.add(g);
  return [...group].sort(byGrade);
}

/**
 * Make `grade` use `source`'s list. Its own list is dropped, and any grades that
 * were sharing it move to `source`'s list with it.
 */
export function shareTopics({ topics, links }: TopicBank, grade: string, source: string): TopicBank {
  const owner = topicGrade(links, source);
  if (owner === topicGrade(links, grade)) return { topics, links };
  const next: TopicLinks = { ...links, [grade]: owner };
  for (const g of Object.keys(links)) if (g !== grade && topicGrade(links, g) === grade) next[g] = owner;
  return { topics: topics.filter((t) => t.grade !== grade), links: next };
}

/** Stop `grade` sharing: it gets its own copy of the list, to change on its own from now on. */
export function unshareTopics({ topics, links }: TopicBank, grade: string): TopicBank {
  const owner = topicGrade(links, grade);
  if (owner === grade) return { topics, links };
  const next = { ...links };
  delete next[grade];
  const copy = topics.filter((t) => t.grade === owner).map((t) => ({ ...t, grade }));
  return { topics: [...topics.filter((t) => t.grade !== grade), ...copy], links: next };
}

/**
 * Remove a grade from the topic bank. Grades that shared its list keep it: the
 * first of them takes the list over, and the rest share that grade's.
 */
export function deleteGrade({ topics, links }: TopicBank, grade: string): TopicBank {
  const owner = topicGrade(links, grade);
  const heir = owner === grade ? topicGroup(links, grade).find((g) => g !== grade) : undefined;
  const next: TopicLinks = {};
  for (const [g, s] of Object.entries(links)) {
    if (g === grade || g === heir) continue;
    if (heir && topicGrade(links, g) === grade) next[g] = heir;
    else next[g] = s === grade ? owner : s;
  }
  const kept = topics.filter((t) => t.grade !== grade && t.grade !== heir);
  const handedOn = heir ? topics.filter((t) => t.grade === grade).map((t) => ({ ...t, grade: heir })) : [];
  return { topics: [...kept, ...handedOn], links: next };
}

/** Split pasted spreadsheet text into subtopic rows (line → Subtopic[\tShort]). */
export function parseTopicPaste(text: string): Array<{ subtopic: string; short: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [subtopic = "", short = ""] = line.split("\t");
      return { subtopic: subtopic.trim(), short: short.trim() };
    })
    .filter((r) => r.subtopic);
}
