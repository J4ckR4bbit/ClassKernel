import { describe, expect, it } from "vitest";
import { isLessonRunning, isSeatingLocked, lessonStartedMessage, localDate, markUnmarkedPresent } from "./lessonState";

// Build ISO strings from local times so the tests hold in any time zone.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

describe("isSeatingLocked", () => {
  const today = "2026-10-05";

  it("is unlocked until seats are assigned", () => {
    expect(isSeatingLocked(null, null, today)).toBe(false);
    expect(isSeatingLocked(null, at(2026, 10, 5, 8), today)).toBe(false);
  });

  it("locks after an assignment in the current lesson", () => {
    expect(isSeatingLocked(at(2026, 10, 5, 9), null, today)).toBe(true);
    expect(isSeatingLocked(at(2026, 10, 5, 9), at(2026, 10, 5, 8), today)).toBe(true);
  });

  it("lifts when the lesson is ended after the assignment", () => {
    expect(isSeatingLocked(at(2026, 10, 5, 9), at(2026, 10, 5, 9, 45), today)).toBe(false);
  });

  it("lifts on a new day even if the lesson was never ended", () => {
    expect(isSeatingLocked(at(2026, 10, 4, 14), null, today)).toBe(false);
    expect(isSeatingLocked(at(2026, 10, 4, 14), at(2026, 10, 4, 8), today)).toBe(false);
  });

  it("uses the local date, not the UTC one", () => {
    // 00:30 local is still "today" locally even where UTC is the day before.
    expect(localDate(at(2026, 10, 5, 0, 30))).toBe(today);
    expect(isSeatingLocked(at(2026, 10, 5, 0, 30), null, today)).toBe(true);
  });
});

describe("isLessonRunning", () => {
  const today = "2026-10-05";

  it("runs from Start lesson until End lesson", () => {
    expect(isLessonRunning(null, null, today)).toBe(false);
    expect(isLessonRunning(at(2026, 10, 5, 9), null, today)).toBe(true);
    expect(isLessonRunning(at(2026, 10, 5, 9), at(2026, 10, 5, 8), today)).toBe(true);
    expect(isLessonRunning(at(2026, 10, 5, 9), at(2026, 10, 5, 9, 45), today)).toBe(false);
  });

  it("stops on a new day even if the lesson was never ended", () => {
    expect(isLessonRunning(at(2026, 10, 4, 14), null, today)).toBe(false);
  });
});

describe("markUnmarkedPresent", () => {
  const date = "2026-10-05";

  it("marks everyone without a mark today present, and keeps the marks already made", () => {
    const attendance = [
      { date, studentId: "a", status: "A" as const, note: "" },
      { date: "2026-10-02", studentId: "b", status: "A" as const, note: "" },
    ];
    const { attendance: next, added } = markUnmarkedPresent(attendance, ["a", "b", "c"], date);
    expect(added).toBe(2);
    expect(next.filter((e) => e.date === date).map((e) => [e.studentId, e.status])).toEqual([
      ["a", "A"],
      ["b", "P"],
      ["c", "P"],
    ]);
    expect(next).toContainEqual(attendance[1]);
  });

  it("changes nothing once everyone has a mark", () => {
    const attendance = [{ date, studentId: "a", status: "L" as const, note: "" }];
    const result = markUnmarkedPresent(attendance, ["a"], date);
    expect(result).toEqual({ attendance, added: 0 });
  });
});

describe("lessonStartedMessage", () => {
  it("says how many were marked present", () => {
    expect(lessonStartedMessage("Lesson started", 24)).toBe("Lesson started — 24 marked present");
    expect(lessonStartedMessage("Lesson started", 0)).toBe("Lesson started — attendance already taken");
  });
});
