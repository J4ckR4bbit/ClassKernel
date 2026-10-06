import { afterEach, describe, expect, it } from "vitest";
import { currentTimeZone, dateInZone, dateTimeInZone, isValidTimeZone, listTimeZones, setTimeZone, timeInZone } from "./time";
import { eventsOnDate } from "./stats";
import { isSeatingLocked } from "./lessonState";

afterEach(() => setTimeZone(""));

describe("time zone conversion", () => {
  it("shows a UTC timestamp in the chosen zone", () => {
    setTimeZone("Africa/Johannesburg"); // UTC+2, no daylight saving
    expect(timeInZone("2026-10-06T07:45:00.000Z")).toBe("09:45");
    expect(dateTimeInZone("2026-10-06T07:45:00.000Z")).toBe("2026-10-06 09:45");
    // 23:30 UTC is already the next day in Johannesburg.
    expect(dateInZone("2026-10-05T23:30:00.000Z")).toBe("2026-10-06");
  });

  it("follows daylight saving where the zone has it", () => {
    setTimeZone("America/New_York");
    expect(timeInZone("2026-01-15T15:00:00.000Z")).toBe("10:00"); // EST, UTC−5
    expect(timeInZone("2026-07-15T15:00:00.000Z")).toBe("11:00"); // EDT, UTC−4
  });

  it("re-dates cached timestamps when the zone changes", () => {
    setTimeZone("UTC");
    expect(timeInZone("2026-10-06T07:45:00.000Z")).toBe("07:45");
    setTimeZone("Asia/Kolkata");
    expect(timeInZone("2026-10-06T07:45:00.000Z")).toBe("13:15");
  });

  it("falls back to the device zone for blank or unknown zones", () => {
    expect(isValidTimeZone("Africa/Johannesburg")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    setTimeZone("Mars/Olympus");
    expect(currentTimeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("returns blanks for unreadable timestamps", () => {
    expect(timeInZone("not a date")).toBe("");
    expect(dateInZone("")).toBe("");
  });

  it("offers a sorted zone list that includes UTC and the device zone", () => {
    const zones = listTimeZones();
    expect(zones).toContain("UTC");
    expect(zones).toEqual([...zones].sort());
  });
});

describe("zone-aware lesson logic", () => {
  it("counts an evening event on the zone's own day", () => {
    setTimeZone("Africa/Johannesburg");
    const ev = { timestamp: "2026-10-05T23:30:00.000Z", studentId: "s", code: "X", points: 1, note: "" };
    expect(eventsOnDate([ev], "2026-10-06")).toHaveLength(1);
    expect(eventsOnDate([ev], "2026-10-05")).toHaveLength(0);
  });

  it("dates the seat lock in the chosen zone", () => {
    setTimeZone("Africa/Johannesburg");
    // Seated at 00:30 SAST on the 6th (22:30 UTC on the 5th): locked on the 6th.
    expect(isSeatingLocked("2026-10-05T22:30:00.000Z", null, "2026-10-06")).toBe(true);
    expect(isSeatingLocked("2026-10-05T22:30:00.000Z", null, "2026-10-05")).toBe(false);
  });
});
