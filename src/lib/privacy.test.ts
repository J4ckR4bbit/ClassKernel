import { describe, expect, it } from "vitest";
import { displayStudentName, seatSurname, textColorFor } from "./privacy";
import { DEFAULT_BEHAVIOURS, Student } from "./types";

const student = (firstName: string, lastName: string): Student => ({
  id: "s",
  firstName,
  lastName,
  gender: "",
  flags: "",
  notes: "",
});

describe("displayStudentName", () => {
  const amelia = student("Amelia", "Adams");

  it("renders each style", () => {
    expect(displayStudentName(amelia, "full")).toBe("Amelia Adams");
    expect(displayStudentName(amelia, "firstInitial")).toBe("Amelia A.");
    expect(displayStudentName(amelia, "first")).toBe("Amelia");
  });

  it("copes with missing name parts", () => {
    expect(displayStudentName(student("Amelia", ""), "firstInitial")).toBe("Amelia");
    expect(displayStudentName(student("", "Adams"), "first")).toBe("Adams");
    expect(displayStudentName(student("", ""), "full")).toBe("");
  });
});

describe("seatSurname", () => {
  const amelia = student("Amelia", "Adams");

  it("matches the style's second line", () => {
    expect(seatSurname(amelia, "full")).toBe("Adams");
    expect(seatSurname(amelia, "firstInitial")).toBe("A.");
    expect(seatSurname(amelia, "first")).toBe("");
  });
});

describe("textColorFor", () => {
  it("uses dark text on light backgrounds and white on dark ones", () => {
    expect(textColorFor("#ffffff")).not.toBe("#fff");
    expect(textColorFor("#ffe680")).not.toBe("#fff"); // pale yellow
    expect(textColorFor("#000000")).toBe("#fff");
    expect(textColorFor("#21343f")).toBe("#fff");
  });

  it("keeps readable text on every default behaviour colour", () => {
    for (const c of DEFAULT_BEHAVIOURS) {
      expect(["#fff", "#1d2733"]).toContain(textColorFor(c.color));
    }
  });

  it("falls back to white for malformed input", () => {
    expect(textColorFor("")).toBe("#fff");
    expect(textColorFor("red")).toBe("#fff");
  });
});
