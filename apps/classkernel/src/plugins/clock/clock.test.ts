import { describe, expect, it } from "vitest";
import { clockParts, digitalText, handAngles, offsetLabel, zoneCity } from "./clock";

// 08:30:15 UTC on a Wednesday.
const instant = new Date("2026-10-07T08:30:15.250Z");

describe("time in a zone", () => {
  it("reads the wall clock in the zone asked for, not the machine's", () => {
    expect(clockParts(instant, "Africa/Johannesburg")).toMatchObject({ hours: 10, minutes: 30, seconds: 15 });
    expect(clockParts(instant, "UTC")).toMatchObject({ hours: 8, minutes: 30, seconds: 15 });
    // Half-hour zone, and a date on the other side of midnight.
    expect(clockParts(instant, "Asia/Kolkata")).toMatchObject({ hours: 14, minutes: 0 });
    expect(clockParts(new Date("2026-10-07T23:30:00Z"), "Africa/Johannesburg").hours).toBe(1);
  });

  it("follows daylight saving where the zone has it", () => {
    // New York is UTC−4 in October and UTC−5 in January.
    expect(clockParts(instant, "America/New_York").hours).toBe(4);
    expect(clockParts(new Date("2026-01-07T08:30:15Z"), "America/New_York").hours).toBe(3);
  });

  it("writes the date for the zone in full", () => {
    expect(clockParts(instant, "Africa/Johannesburg").dateLine).toBe("Wednesday 7 October 2026");
    expect(clockParts(new Date("2026-10-07T23:30:00Z"), "Africa/Johannesburg").dateLine).toBe("Thursday 8 October 2026");
  });
});

describe("hand angles", () => {
  it("creeps the hour and minute hands between marks", () => {
    const a = handAngles({ hours: 10, minutes: 30, seconds: 15 });
    expect(a.hour).toBeCloseTo(300 + 15 + 0.125);
    expect(a.minute).toBeCloseTo(180 + 1.5);
    expect(a.second).toBe(90);
  });

  it("treats the afternoon like the morning and sweeps the second hand when asked", () => {
    expect(handAngles({ hours: 15, minutes: 0, seconds: 0 }).hour).toBe(90);
    expect(handAngles({ hours: 0, minutes: 0, seconds: 0 })).toEqual({ hour: 0, minute: 0, second: 0 });
    expect(handAngles({ hours: 0, minutes: 0, seconds: 30 }, 500).second).toBeCloseTo(183);
  });
});

describe("digital face", () => {
  it("writes 24-hour time with or without seconds", () => {
    expect(digitalText({ hours: 14, minutes: 5, seconds: 9 }, { hour12: false, showSeconds: false })).toEqual({ text: "14:05", suffix: "" });
    expect(digitalText({ hours: 7, minutes: 5, seconds: 9 }, { hour12: false, showSeconds: true })).toEqual({ text: "07:05:09", suffix: "" });
  });

  it("writes 12-hour time with midnight and noon as 12", () => {
    expect(digitalText({ hours: 0, minutes: 5, seconds: 0 }, { hour12: true, showSeconds: false })).toEqual({ text: "12:05", suffix: "AM" });
    expect(digitalText({ hours: 12, minutes: 0, seconds: 0 }, { hour12: true, showSeconds: false })).toEqual({ text: "12:00", suffix: "PM" });
    expect(digitalText({ hours: 13, minutes: 7, seconds: 3 }, { hour12: true, showSeconds: true })).toEqual({ text: "01:07:03", suffix: "PM" });
  });
});

describe("zone labels", () => {
  it("names the city and the offset", () => {
    expect(zoneCity("Africa/Johannesburg")).toBe("Johannesburg");
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneCity("UTC")).toBe("UTC");
    expect(offsetLabel(instant, "Africa/Johannesburg")).toBe("GMT+2");
    expect(offsetLabel(instant, "Asia/Kolkata")).toBe("GMT+5:30");
  });
});
