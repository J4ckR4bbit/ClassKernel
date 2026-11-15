import { describe, expect, it } from "vitest";
import { classNameTaken, safeClassName } from "./classNames";

describe("class names", () => {
  it("drops what Windows won't have in a folder name", () => {
    expect(safeClassName('  10A: "Physics" <P1>  ')).toBe("10A Physics P1");
    expect(safeClassName("11B/12B")).toBe("11B12B");
    expect(safeClassName("Gr. 10 Phys. ")).toBe("Gr. 10 Phys");
    expect(safeClassName(" ?*| ")).toBe("");
  });

  it("finds a class of the same name, whatever its capitals", () => {
    const classes = [{ name: "10A" }, { name: "7B-Science" }];
    expect(classNameTaken("10a", classes)).toBe(classes[0]);
    expect(classNameTaken(" 7b-science ", classes)).toBe(classes[1]);
    expect(classNameTaken("10B", classes)).toBeUndefined();
  });

  it("lets a class be renamed to its own name in other capitals", () => {
    const classes = [{ name: "10a" }, { name: "10B" }];
    expect(classNameTaken("10A", classes, "10a")).toBeUndefined();
    expect(classNameTaken("10b", classes, "10a")).toBe(classes[1]);
  });
});
