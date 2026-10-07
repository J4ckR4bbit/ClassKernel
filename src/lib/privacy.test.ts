import { describe, expect, it } from "vitest";
import { displayStudentName, seatSurname } from "./privacy";
import { Student } from "./types";

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
