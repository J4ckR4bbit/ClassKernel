import { describe, expect, it } from "vitest";
import { MemFS, setFS } from "../fs";
import * as repo from "../repo";
import { DEFAULT_BEHAVIOURS, DEFAULT_COGNITIVE_LEVELS, DEFAULT_ROOM_CONFIG, DEFAULT_SEATING_PREFS, DEFAULT_USER_PREFS } from "../types";
import { conflictCopyPath, hasExplicitPolicy, isIgnoredDir, isIgnoredFile, policyFor } from "./policy";

describe("policyFor", () => {
  it("merges the log-style files row by row, wherever they sit", () => {
    for (const path of [
      "classes/7B Science/attendance.csv",
      "classes/7B Science/behaviour.csv",
      "classes/7B Science/lessons.csv",
      "classes/7B Science/marks.csv",
      "classes/7B Science/question_marks.csv",
      "classes/7B Science/students.csv",
      "behaviours.csv",
      "settings.csv",
      "topics.csv",
    ]) {
      expect(policyFor(path).kind, path).toBe("union");
    }
  });

  it("treats layouts and seating as whole documents", () => {
    // Row-merging these would produce overlapping desks and double-seated
    // students, which is worse than a conflict copy.
    for (const path of [
      "classes/7B Science/desks.csv",
      "classes/7B Science/room.csv",
      "classes/7B Science/seating.csv",
      "classes/7B Science/class.md",
      "layouts/Lab 2/desks.csv",
    ]) {
      expect(policyFor(path).kind, path).toBe("whole");
    }
  });

  it("falls back to whole-file for anything it has not been taught", () => {
    expect(policyFor("classes/7B/something_new.csv").kind).toBe("whole");
  });

  it("keys attendance by date and student so one row per student per day survives", () => {
    const policy = policyFor("classes/7B/attendance.csv");
    expect(policy).toEqual({ kind: "union", key: ["date", "student_id"] });
  });
});

describe("policy coverage", () => {
  it("has a rule for every file the repository layer writes", async () => {
    // Drive one save of each kind through an in-memory FS, then check that
    // whatever landed on disk has an explicit merge rule. A new data file added
    // later fails here until someone decides how it should merge.
    const fs = new MemFS();
    setFS(fs);
    const dir = "/data";
    const cls = "7B";
    await repo.ensureDataDir(dir);
    await repo.saveClassInfo(dir, { name: cls, year: "7", subject: "Science", room: "L2", notes: "", archived: false });
    await repo.saveStudents(dir, cls, []);
    await repo.saveAttendance(dir, cls, []);
    await repo.saveBehaviourEvents(dir, cls, []);
    await repo.saveDesks(dir, cls, []);
    await repo.saveRoomConfig(dir, cls, DEFAULT_ROOM_CONFIG);
    await repo.saveSeating(dir, cls, []);
    await repo.saveSeatingPrefs(dir, cls, DEFAULT_SEATING_PREFS);
    await repo.saveLessons(dir, cls, []);
    await repo.saveAssessments(dir, cls, []);
    await repo.saveMarks(dir, cls, []);
    await repo.saveAssessmentQuestions(dir, cls, []);
    await repo.saveQuestionMarks(dir, cls, []);
    await repo.saveBehaviourCodes(dir, DEFAULT_BEHAVIOURS);
    await repo.saveCognitiveLevels(dir, DEFAULT_COGNITIVE_LEVELS);
    await repo.saveTopics(dir, []);
    await repo.saveUserPrefs(dir, DEFAULT_USER_PREFS);
    await repo.saveTimerPresets(dir, []);
    await repo.saveLayoutTemplate(dir, "Lab 2", [], DEFAULT_ROOM_CONFIG);

    const written = [...fs.files.keys()]
      .map((p) => p.slice(dir.length + 1))
      .filter((p) => !isIgnoredFile(p.split("/").pop() ?? p));
    expect(written.length).toBeGreaterThan(10);
    expect(written.filter((p) => !hasExplicitPolicy(p))).toEqual([]);
  });
});

describe("what sync ignores", () => {
  it("skips per-device backups and interrupted writes", () => {
    expect(isIgnoredDir("backups")).toBe(true);
    expect(isIgnoredFile("students.csv.tmp.classkernel")).toBe(true);
  });

  it("skips conflict copies so they cannot ping-pong between devices", () => {
    expect(isIgnoredFile(conflictCopyPath("desks.csv", "2026-07-25_143000"))).toBe(true);
  });

  it("syncs the real data files", () => {
    expect(isIgnoredFile("attendance.csv")).toBe(false);
    expect(isIgnoredDir("classes")).toBe(false);
  });
});

describe("conflictCopyPath", () => {
  it("puts the stamp before the extension, next to the original", () => {
    expect(conflictCopyPath("classes/7B/desks.csv", "2026-07-25_143000")).toBe(
      "classes/7B/desks.conflict-2026-07-25_143000.csv",
    );
  });

  it("handles a file with no extension", () => {
    expect(conflictCopyPath("classes/7B/NOTES", "s")).toBe("classes/7B/NOTES.conflict-s");
  });
});
