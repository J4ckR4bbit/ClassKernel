// Analytics over the per-lesson seating history (lessons.csv). Powers the
// "how often has each student sat here", "which desk do they behave best at"
// and "which pairings turn disruptive" views.

import { LessonRecord } from "./types";

/** How many times each student has sat at each desk label. */
export function deskSitCounts(lessons: LessonRecord[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const l of lessons) {
    const label = l.deskLabel || l.deskId;
    const byDesk = out.get(l.studentId) ?? new Map<string, number>();
    byDesk.set(label, (byDesk.get(label) ?? 0) + 1);
    out.set(l.studentId, byDesk);
  }
  return out;
}

export interface DeskStat {
  deskLabel: string;
  sessions: number;
  avgPoints: number;
  totalPoints: number;
}

/** Per-desk behaviour for one student, most-sat desks first. */
export function studentDeskStats(lessons: LessonRecord[], studentId: string): DeskStat[] {
  const rows = lessons.filter((l) => l.studentId === studentId);
  const byDesk = new Map<string, { sessions: number; total: number }>();
  for (const r of rows) {
    const label = r.deskLabel || r.deskId;
    const agg = byDesk.get(label) ?? { sessions: 0, total: 0 };
    agg.sessions++;
    agg.total += r.points;
    byDesk.set(label, agg);
  }
  return [...byDesk.entries()]
    .map(([deskLabel, a]) => ({ deskLabel, sessions: a.sessions, totalPoints: a.total, avgPoints: a.total / a.sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.deskLabel.localeCompare(b.deskLabel));
}

/** Mean behaviour points per lesson, per student, across all recorded lessons. */
export function studentOverallAverages(lessons: LessonRecord[]): Map<string, number> {
  const agg = new Map<string, { sessions: number; total: number }>();
  for (const l of lessons) {
    const a = agg.get(l.studentId) ?? { sessions: 0, total: 0 };
    a.sessions++;
    a.total += l.points;
    agg.set(l.studentId, a);
  }
  return new Map([...agg.entries()].map(([id, a]) => [id, a.total / a.sessions]));
}

export interface PairInsight {
  a: string;
  b: string;
  /** Lessons the two shared a desk. */
  sessions: number;
  /** Mean points of the two students while sitting together. */
  avgTogether: number;
  /** Mean of the two students' own overall averages. */
  avgOverall: number;
  /** avgTogether − avgOverall. Negative means they behave worse together. */
  delta: number;
}

/**
 * For every pair of students who have shared a desk, compare how the pair
 * behaves together with how those two behave on average. A markedly negative
 * delta over enough shared lessons is a candidate for the "keep apart" list.
 */
export function pairInsights(lessons: LessonRecord[]): PairInsight[] {
  const overall = studentOverallAverages(lessons);
  // Group rows by the actual desk occupied in a given lesson session.
  const groups = new Map<string, { studentId: string; points: number }[]>();
  for (const l of lessons) {
    const key = `${l.sessionId}|${l.deskId}`;
    const g = groups.get(key) ?? [];
    g.push({ studentId: l.studentId, points: l.points });
    groups.set(key, g);
  }

  const pairAgg = new Map<string, { a: string; b: string; sessions: number; total: number }>();
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i].studentId, members[j].studentId].sort();
        if (a === b) continue;
        const key = `${a}|${b}`;
        const agg = pairAgg.get(key) ?? { a, b, sessions: 0, total: 0 };
        agg.sessions++;
        // Points earned by the pair in this shared lesson (mean of the two).
        agg.total += (members[i].points + members[j].points) / 2;
        pairAgg.set(key, agg);
      }
    }
  }

  const out: PairInsight[] = [];
  for (const { a, b, sessions, total } of pairAgg.values()) {
    const avgTogether = total / sessions;
    const avgOverall = ((overall.get(a) ?? 0) + (overall.get(b) ?? 0)) / 2;
    out.push({ a, b, sessions, avgTogether, avgOverall, delta: avgTogether - avgOverall });
  }
  return out.sort((x, y) => x.delta - y.delta);
}

/** Pairs worth reviewing for the keep-apart list: enough shared lessons and a clearly worse-together score. */
export function disruptivePairs(lessons: LessonRecord[], minSessions = 2, threshold = 0.75): PairInsight[] {
  return pairInsights(lessons).filter((p) => p.sessions >= minSessions && p.delta <= -threshold);
}
