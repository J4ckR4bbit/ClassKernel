import { describe, expect, it } from "vitest";
import { deskSitCounts, disruptivePairs, pairInsights, studentDeskStats, studentOverallAverages } from "./lessons";
import { LessonRecord } from "./types";

const rec = (
  sessionId: string,
  studentId: string,
  deskId: string,
  deskLabel: string,
  seatmates: string,
  points: number,
): LessonRecord => ({
  sessionId,
  date: "2026-01-01",
  timestamp: `2026-01-01T09:00:00.000Z`,
  studentId,
  deskId,
  deskLabel,
  seatmates,
  points,
  positives: points > 0 ? 1 : 0,
  negatives: points < 0 ? 1 : 0,
});

// s1 & s2 sit together at "Front" for two lessons and behave badly (−3 each),
// then split to other desks and behave well (+4). They should surface as a
// disruptive pairing.
const lessons: LessonRecord[] = [
  rec("les-1", "s1", "d1", "Front", "s2", -3),
  rec("les-1", "s2", "d1", "Front", "s1", -3),
  rec("les-2", "s1", "d1", "Front", "s2", -3),
  rec("les-2", "s2", "d1", "Front", "s1", -3),
  rec("les-3", "s1", "d2", "Back", "s3", 4),
  rec("les-3", "s3", "d2", "Back", "s1", 1),
  rec("les-3", "s2", "d3", "Side", "s4", 4),
  rec("les-3", "s4", "d3", "Side", "s2", 2),
];

describe("deskSitCounts", () => {
  it("counts how often each student sat at each desk label", () => {
    const counts = deskSitCounts(lessons);
    expect(counts.get("s1")).toEqual(new Map([["Front", 2], ["Back", 1]]));
    expect(counts.get("s2")).toEqual(new Map([["Front", 2], ["Side", 1]]));
  });
});

describe("studentDeskStats", () => {
  it("summarises sessions and average points per desk, most-sat first", () => {
    const stats = studentDeskStats(lessons, "s1");
    expect(stats.map((s) => s.deskLabel)).toEqual(["Front", "Back"]);
    expect(stats[0]).toMatchObject({ deskLabel: "Front", sessions: 2, totalPoints: -6, avgPoints: -3 });
    expect(stats[1]).toMatchObject({ deskLabel: "Back", sessions: 1, avgPoints: 4 });
  });
});

describe("studentOverallAverages", () => {
  it("averages behaviour points per lesson across all recorded lessons", () => {
    const avgs = studentOverallAverages(lessons);
    expect(avgs.get("s1")).toBeCloseTo((-3 - 3 + 4) / 3);
    expect(avgs.get("s3")).toBe(1);
  });
});

describe("pairInsights / disruptivePairs", () => {
  it("flags the pair that behaves worse together than apart", () => {
    const insights = pairInsights(lessons);
    const worst = insights[0];
    expect([worst.a, worst.b].sort()).toEqual(["s1", "s2"]);
    expect(worst.sessions).toBe(2);
    expect(worst.avgTogether).toBe(-3);
    expect(worst.avgOverall).toBeCloseTo((-3 - 3 + 4) / 3);
    expect(worst.delta).toBeLessThan(0);
  });

  it("only returns pairs with enough shared lessons and a clear negative delta", () => {
    const flagged = disruptivePairs(lessons);
    expect(flagged).toHaveLength(1);
    expect([flagged[0].a, flagged[0].b].sort()).toEqual(["s1", "s2"]);
    // One-off pairings (s1+s3, s2+s4) are not flagged.
    expect(disruptivePairs(lessons).some((p) => p.a === "s3" || p.b === "s3")).toBe(false);
  });

  it("returns nothing when there is no history", () => {
    expect(disruptivePairs([])).toEqual([]);
    expect(pairInsights([])).toEqual([]);
  });
});
