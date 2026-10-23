import { describe, expect, it } from "vitest";
import { Student, sortByName } from "./types";

const s = (firstName: string, lastName: string): Student => ({ id: `${firstName}${lastName}`, firstName, lastName, adamNo: "", gender: "", flags: "", notes: "" });

describe("sortByName", () => {
  it("puts students in register order, by surname then first name, without touching the original", () => {
    const students = [s("Zola", "Ndlovu"), s("Ben", "Adams"), s("Amy", "Ndlovu")];
    expect(sortByName(students).map((x) => x.firstName)).toEqual(["Ben", "Amy", "Zola"]);
    expect(students[0].firstName).toBe("Zola");
  });
});
