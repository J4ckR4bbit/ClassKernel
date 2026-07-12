import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "./fs";
import * as repo from "./repo";
import { AttendanceEntry, Mark, Student } from "./types";

const DIR = "/data";
const CLS = "7B-Science";

let fs: MemFS;

beforeEach(async () => {
  fs = new MemFS();
  setFS(fs);
  await repo.ensureDataDir(DIR);
  await repo.saveClassInfo(DIR, { name: CLS, year: "7", subject: "Science", room: "Lab 2", notes: "hello", archived: false });
});

describe("data folder", () => {
  it("seeds the default behaviour catalog", async () => {
    const codes = await repo.loadBehaviourCodes(DIR);
    expect(codes.length).toBeGreaterThan(4);
    expect(codes.some((c) => c.kind === "positive")).toBe(true);
    expect(codes.some((c) => c.points < 0)).toBe(true);
  });
});

describe("class.md", () => {
  it("round-trips info and notes through the front matter", async () => {
    const classes = await repo.listClasses(DIR);
    expect(classes).toHaveLength(1);
    expect(classes[0]).toMatchObject({ name: CLS, year: "7", subject: "Science", room: "Lab 2", notes: "hello" });
  });

  it("parses a file without front matter as pure notes", () => {
    const info = repo.parseClassMd("X", "just notes\nline 2");
    expect(info.notes).toBe("just notes\nline 2");
    expect(info.year).toBe("");
  });

  it("survives values containing colons", () => {
    const info = repo.parseClassMd("X", "---\nname: X\nroom: Block B: Lab 2\narchived: false\n---\n");
    expect(info.room).toBe("Block B: Lab 2");
  });
});

describe("students.csv", () => {
  it("round-trips students including commas, quotes and unicode", async () => {
    const students: Student[] = [
      { id: "s1", firstName: "Anna", lastName: "O'Brien", gender: "F", flags: "SEN;Medical", notes: 'says "hi", loves commas' },
      { id: "s2", firstName: "Zoë", lastName: "Müller", gender: "", flags: "", notes: "line1\nline2" },
    ];
    await repo.saveStudents(DIR, CLS, students);
    const loaded = await repo.loadStudents(DIR, CLS);
    expect(loaded).toEqual(students);
  });

  it("writes a header row even for an empty roster", async () => {
    await repo.saveStudents(DIR, CLS, []);
    const raw = await fs.readText(`${DIR}/classes/${CLS}/students.csv`);
    expect(raw.trim()).toBe("id,first_name,last_name,gender,flags,notes");
  });
});

describe("attendance.csv", () => {
  it("round-trips entries and defaults bad statuses to P", async () => {
    const entries: AttendanceEntry[] = [
      { date: "2026-07-01", studentId: "s1", status: "P", note: "" },
      { date: "2026-07-01", studentId: "s2", status: "A", note: "sick" },
    ];
    await repo.saveAttendance(DIR, CLS, entries);
    expect(await repo.loadAttendance(DIR, CLS)).toEqual(entries);
  });
});

describe("desks + seating", () => {
  it("round-trips desk geometry, colour and label boxes", async () => {
    await repo.saveDesks(DIR, CLS, [
      { id: "d1", label: "Front", shape: "double", x: 120, y: 140, w: 160, h: 60, rotation: 90, color: "#dcebf7" },
      { id: "d2", label: "Book corner", shape: "label", x: 0, y: 0, w: 140, h: 40, rotation: 0, color: "" },
    ]);
    const desks = await repo.loadDesks(DIR, CLS);
    expect(desks[0]).toMatchObject({ x: 120, y: 140, w: 160, h: 60, rotation: 90, shape: "double", color: "#dcebf7" });
    expect(desks[1]).toMatchObject({ shape: "label", label: "Book corner", color: "" });
  });

  it("loads pre-colour desks.csv files (missing color column)", async () => {
    await fs.writeAtomic(
      `${DIR}/classes/${CLS}/desks.csv`,
      "desk_id,label,shape,x,y,w,h,rotation\r\nd1,,single,20,40,80,60,0\r\n",
    );
    const desks = await repo.loadDesks(DIR, CLS);
    expect(desks[0].color).toBe("");
  });

  it("round-trips seat assignments per plan", async () => {
    await repo.saveSeating(DIR, CLS, [
      { planName: "Plan A", deskId: "d1", seatIndex: 0, studentId: "s1" },
      { planName: "Plan B", deskId: "d1", seatIndex: 1, studentId: "s2" },
    ]);
    const seats = await repo.loadSeating(DIR, CLS);
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.planName === "Plan B")?.seatIndex).toBe(1);
  });
});

describe("room.csv", () => {
  const scales = { seatFontScale: 1, deskFontScale: 1, labelFontScale: 1 };

  it("defaults to front=top, no crop and 1x fonts when missing", async () => {
    const config = await repo.loadRoomConfig(DIR, CLS);
    expect(config).toEqual({ frontEdge: "top", crop: null, ...scales });
  });

  it("round-trips front edge and crop", async () => {
    await repo.saveRoomConfig(DIR, CLS, { frontEdge: "left", crop: { x: 40, y: 60, w: 500, h: 400 }, ...scales });
    expect(await repo.loadRoomConfig(DIR, CLS)).toEqual({
      frontEdge: "left",
      crop: { x: 40, y: 60, w: 500, h: 400 },
      ...scales,
    });
  });

  it("round-trips a cleared crop", async () => {
    await repo.saveRoomConfig(DIR, CLS, { frontEdge: "bottom", crop: { x: 0, y: 0, w: 300, h: 300 }, ...scales });
    await repo.saveRoomConfig(DIR, CLS, { frontEdge: "bottom", crop: null, ...scales });
    expect(await repo.loadRoomConfig(DIR, CLS)).toEqual({ frontEdge: "bottom", crop: null, ...scales });
  });

  it("round-trips per-room font scales", async () => {
    await repo.saveRoomConfig(DIR, CLS, {
      frontEdge: "top",
      crop: null,
      seatFontScale: 1.4,
      deskFontScale: 0.8,
      labelFontScale: 2,
    });
    const loaded = await repo.loadRoomConfig(DIR, CLS);
    expect(loaded.seatFontScale).toBe(1.4);
    expect(loaded.deskFontScale).toBe(0.8);
    expect(loaded.labelFontScale).toBe(2);
  });
});

describe("seating_prefs.csv", () => {
  it("round-trips keep-apart, keep-together and front rules", async () => {
    await repo.saveSeatingPrefs(DIR, CLS, {
      apartPairs: [["s1", "s2"]],
      togetherPairs: [["s3", "s4"]],
      frontIds: ["s5", "s6"],
    });
    const loaded = await repo.loadSeatingPrefs(DIR, CLS);
    expect(loaded.apartPairs).toEqual([["s1", "s2"]]);
    expect(loaded.togetherPairs).toEqual([["s3", "s4"]]);
    expect(loaded.frontIds).toEqual(["s5", "s6"]);
  });

  it("defaults to empty rules when missing", async () => {
    expect(await repo.loadSeatingPrefs(DIR, CLS)).toEqual({
      apartPairs: [],
      togetherPairs: [],
      frontIds: [],
    });
  });
});

describe("lessons.csv", () => {
  it("round-trips lesson seat/behaviour records", async () => {
    const records = [
      {
        sessionId: "les-1",
        date: "2026-07-01",
        timestamp: "2026-07-01T09:00:00.000Z",
        studentId: "s1",
        deskId: "d1",
        deskLabel: "Front left",
        seatmates: "s2;s3",
        points: -2,
        positives: 1,
        negatives: 2,
      },
    ];
    await repo.saveLessons(DIR, CLS, records);
    expect(await repo.loadLessons(DIR, CLS)).toEqual(records);
  });
});

describe("layout templates", () => {
  it("saves a room as a template and applies it to another class", async () => {
    const desks = [
      { id: "d1", label: "Front", shape: "double" as const, x: 120, y: 140, w: 160, h: 60, rotation: 0, color: "" },
    ];
    await repo.saveLayoutTemplate(DIR, "Exam rows", desks, {
      frontEdge: "top",
      crop: null,
      seatFontScale: 1.2,
      deskFontScale: 1,
      labelFontScale: 1,
    });
    expect(await repo.listLayoutTemplates(DIR)).toContain("Exam rows");
    const loaded = await repo.loadLayoutTemplate(DIR, "Exam rows");
    expect(loaded.desks).toEqual(desks);
    expect(loaded.config.seatFontScale).toBe(1.2);
    expect(loaded.config.crop).toBeNull();
  });

  it("deletes a template so it no longer lists", async () => {
    await repo.saveLayoutTemplate(DIR, "Temp", [], { frontEdge: "top", crop: null, seatFontScale: 1, deskFontScale: 1, labelFontScale: 1 });
    expect(await repo.listLayoutTemplates(DIR)).toContain("Temp");
    await repo.deleteLayoutTemplate(DIR, "Temp");
    expect(await repo.listLayoutTemplates(DIR)).not.toContain("Temp");
  });
});

describe("marks.csv", () => {
  it("keeps empty marks as null (not zero)", async () => {
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 34, comment: "good" },
      { assessmentId: "a1", studentId: "s2", mark: null, comment: "absent" },
      { assessmentId: "a1", studentId: "s3", mark: 0, comment: "" },
    ];
    await repo.saveMarks(DIR, CLS, marks);
    const loaded = await repo.loadMarks(DIR, CLS);
    expect(loaded.find((m) => m.studentId === "s2")?.mark).toBeNull();
    expect(loaded.find((m) => m.studentId === "s3")?.mark).toBe(0);
  });
});

describe("rename", () => {
  it("moves the whole class folder", async () => {
    await repo.saveStudents(DIR, CLS, [{ id: "s1", firstName: "A", lastName: "B", gender: "", flags: "", notes: "" }]);
    await repo.renameClass(DIR, CLS, "8A-Science");
    await repo.saveClassInfo(DIR, { name: "8A-Science", year: "8", subject: "Science", room: "", notes: "", archived: false });
    const students = await repo.loadStudents(DIR, "8A-Science");
    expect(students).toHaveLength(1);
  });
});
