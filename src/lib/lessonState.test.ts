import { describe, expect, it } from "vitest";
import { isSeatingLocked, localDate } from "./lessonState";

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
