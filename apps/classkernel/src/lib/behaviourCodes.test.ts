import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, getFS, setFS } from "./fs";
import * as repo from "./repo";
import { applyRenames, cleanCode, describeRenames, shortenCodes } from "./behaviourCodes";
import { BehaviourCode, DEFAULT_BEHAVIOURS } from "./types";
import { BC } from "./behaviourColours";

const b = (code: string, kind: "positive" | "negative" = "negative"): BehaviourCode => ({
  code,
  label: code,
  kind,
  points: kind === "positive" ? 1 : -1,
  color: BC.red,
  icon: "",
});

describe("behaviour codes of three characters", () => {
  it("cleans a typed code: upper case, no spaces, three characters", () => {
    expect(cleanCode(" +hw ")).toBe("+HW");
    expect(cleanCode("kind")).toBe("KIN");
    expect(cleanCode("")).toBe("");
  });

  it("shortens longer codes to their sign and two letters, leaving short ones alone", () => {
    const renames = shortenCodes([b("TALK"), b("HELP", "positive"), b("HW+", "positive"), b("Q-")]);
    expect([...renames]).toEqual([
      ["TALK", "-TA"],
      ["HELP", "+HE"],
    ]);
  });

  it("keeps every code unique, trying other letters and then a digit", () => {
    const renames = shortenCodes([b("-TA"), b("TALK"), b("TALL"), b("TTTT")]);
    expect(renames.get("TALK")).toBe("-TL"); // -TA is taken
    expect(renames.get("TALL")).toBe("-T1"); // -TA and -TL are taken: a digit
    expect(renames.get("TTTT")).toBe("-TT");
    const all = ["-TA", ...renames.values()];
    expect(new Set(all).size).toBe(all.length);
  });

  it("needs nothing for the defaults", () => {
    expect(shortenCodes(DEFAULT_BEHAVIOURS).size).toBe(0);
    expect(DEFAULT_BEHAVIOURS.every((c) => c.code.length <= 3 && c.icon)).toBe(true);
  });

  it("applies and describes renames", () => {
    const renames = new Map([["TALK", "-TA"]]);
    expect(applyRenames([b("TALK"), b("EFF")], renames).map((c) => c.code)).toEqual(["-TA", "EFF"]);
    expect(describeRenames(new Map([["TALK", "-TA"], ["HELP", "+HE"]]))).toBe("TALK → -TA, HELP → +HE");
  });
});

describe("behaviours.csv and the class logs", () => {
  const DIR = "/data";
  beforeEach(async () => {
    setFS(new MemFS());
    await repo.ensureDataDir(DIR);
    for (const name of ["7B", "8C"]) {
      await repo.saveClassInfo(DIR, { name, year: "7", subject: "", room: "", notes: "", archived: name === "8C", color: "" });
    }
  });

  it("reads a file from before icons, giving known behaviours their default icon", async () => {
    await getFS().writeAtomic(
      `${DIR}/behaviours.csv`,
      "code,label,kind,points,color\nTALK,Talking / off task,negative,-1,#b45309\nX,Something else,negative,-1,\n",
    );
    const codes = await repo.loadBehaviourCodes(DIR);
    expect(codes.map((c) => c.icon)).toEqual(["record_voice_over", ""]);
  });

  it("keeps a chosen icon, and a blank one, through a save", async () => {
    await repo.saveBehaviourCodes(DIR, [{ ...b("-TA"), icon: "warning" }, { ...b("+HE", "positive"), label: "Helping others" }]);
    const codes = await repo.loadBehaviourCodes(DIR);
    expect(codes.map((c) => c.icon)).toEqual(["warning", ""]);
  });

  it("renames codes in every class's log, archived ones too", async () => {
    const ev = (code: string) => ({ timestamp: `t-${code}`, studentId: "s1", code, points: -1, note: "" });
    await repo.saveBehaviourEvents(DIR, "7B", [ev("TALK"), ev("EFF")]);
    await repo.saveBehaviourEvents(DIR, "8C", [ev("TALK")]);
    const changed = await repo.renameBehaviourCodesInClasses(DIR, new Map([["TALK", "-TA"]]));
    expect(changed).toBe(2);
    expect((await repo.loadBehaviourEvents(DIR, "7B")).map((e) => e.code)).toEqual(["-TA", "EFF"]);
    expect((await repo.loadBehaviourEvents(DIR, "8C")).map((e) => e.code)).toEqual(["-TA"]);
    // Nothing left to rename: nothing rewritten.
    expect(await repo.renameBehaviourCodesInClasses(DIR, new Map([["TALK", "-TA"]]))).toBe(0);
  });
});
