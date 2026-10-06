import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, getFS, setFS } from "./fs";
import * as repo from "./repo";
import { AttendanceEntry, BathroomVisit, DEFAULT_USER_PREFS, Mark, Student } from "./types";

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

describe("bathroom.csv", () => {
  it("round-trips visits and keeps an unfinished visit open", async () => {
    const visits: BathroomVisit[] = [
      { date: "2026-07-01", studentId: "s1", start: "2026-07-01T09:00:00.000Z", end: "2026-07-01T09:04:30.000Z" },
      { date: "2026-07-01", studentId: "s2", start: "2026-07-01T09:10:00.000Z", end: "" },
    ];
    await repo.saveBathroomVisits(DIR, CLS, visits);
    expect(await repo.loadBathroomVisits(DIR, CLS)).toEqual(visits);
  });

  it("writes the finished duration into the CSV for Excel", async () => {
    await repo.saveBathroomVisits(DIR, CLS, [
      { date: "2026-07-01", studentId: "s1", start: "2026-07-01T09:00:00.000Z", end: "2026-07-01T09:04:30.000Z" },
      { date: "2026-07-01", studentId: "s2", start: "2026-07-01T09:10:00.000Z", end: "" },
    ]);
    const raw = await fs.readText(`${DIR}/classes/${CLS}/bathroom.csv`);
    const lines = raw.trim().split("\r\n");
    expect(lines[0]).toBe("date,student_id,start,end,duration_seconds");
    expect(lines[1].endsWith(",270")).toBe(true); // 4m30s
    expect(lines[2].endsWith(",")).toBe(true); // still out: duration left blank
  });
});

describe("desks + seating", () => {
  it("round-trips desk geometry, colour and label boxes", async () => {
    await repo.saveDesks(DIR, CLS, [
      { id: "d1", label: "Front", shape: "double", x: 120, y: 140, w: 160, h: 60, rotation: 90, color: "#dcebf7", textColor: "#000000" },
      { id: "d2", label: "Book corner", shape: "label", x: 0, y: 0, w: 140, h: 40, rotation: 0, color: "", textColor: "" },
    ]);
    const desks = await repo.loadDesks(DIR, CLS);
    expect(desks[0]).toMatchObject({ x: 120, y: 140, w: 160, h: 60, rotation: 90, shape: "double", color: "#dcebf7" });
    expect(desks[0].textColor).toBe("#000000");
    expect(desks[1]).toMatchObject({ shape: "label", label: "Book corner", color: "" });
  });

  it("loads pre-colour desks.csv files (missing color columns)", async () => {
    await fs.writeAtomic(
      `${DIR}/classes/${CLS}/desks.csv`,
      "desk_id,label,shape,x,y,w,h,rotation\r\nd1,,single,20,40,80,60,0\r\n",
    );
    const desks = await repo.loadDesks(DIR, CLS);
    expect(desks[0].color).toBe("");
    expect(desks[0].textColor).toBe("");
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
      { id: "d1", label: "Front", shape: "double" as const, x: 120, y: 140, w: 160, h: 60, rotation: 0, color: "", textColor: "" },
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

describe("assessments.csv", () => {
  it("round-trips question count and content area", async () => {
    await repo.saveAssessments(DIR, CLS, [
      { id: "a1", title: "Phys Test 1", date: "2026-02-01", totalMarks: 85, category: "Test", questionCount: 6, contentArea: "Physics" },
    ]);
    const loaded = await repo.loadAssessments(DIR, CLS);
    expect(loaded[0]).toEqual({
      id: "a1",
      title: "Phys Test 1",
      date: "2026-02-01",
      totalMarks: 85,
      category: "Test",
      questionCount: 6,
      contentArea: "Physics",
    });
  });

  it("defaults questionCount to 1 for legacy rows without the column", async () => {
    // Simulate an old file that predates questionCount/content_area.
    await fs.writeAtomic(
      `${DIR}/classes/${CLS}/assessments.csv`,
      "assessment_id,title,date,total_marks,weight,category\r\na1,Old,2026-01-01,50,2,Quiz\r\n",
    );
    const loaded = await repo.loadAssessments(DIR, CLS);
    expect(loaded[0]).toMatchObject({ id: "a1", totalMarks: 50, questionCount: 1, contentArea: "" });
  });
});

describe("assessment_questions.csv + question_marks.csv", () => {
  it("round-trips question definitions", async () => {
    const questions = [
      { assessmentId: "a1", number: 1, topic: "Kinematics", marks: 6, cognitiveLevel: "L1" },
      { assessmentId: "a1", number: 2, topic: "Momentum", marks: 28, cognitiveLevel: "L3" },
    ];
    await repo.saveAssessmentQuestions(DIR, CLS, questions);
    expect(await repo.loadAssessmentQuestions(DIR, CLS)).toEqual(questions);
  });

  it("keeps empty per-question marks as null", async () => {
    const qm = [
      { assessmentId: "a1", studentId: "s1", number: 1, mark: 4 },
      { assessmentId: "a1", studentId: "s2", number: 1, mark: null },
      { assessmentId: "a1", studentId: "s3", number: 1, mark: 0 },
    ];
    await repo.saveQuestionMarks(DIR, CLS, qm);
    const loaded = await repo.loadQuestionMarks(DIR, CLS);
    expect(loaded.find((m) => m.studentId === "s2")?.mark).toBeNull();
    expect(loaded.find((m) => m.studentId === "s3")?.mark).toBe(0);
  });
});

describe("app-wide topic bank, cognitive levels, settings", () => {
  it("round-trips topics keyed by grade", async () => {
    const topics = [
      { grade: "12", area: "Physics", subtopic: "Kinematics", short: "Kin" },
      { grade: "12", area: "Chemistry", subtopic: "", short: "" }, // area placeholder
    ];
    await repo.saveTopics(DIR, topics);
    expect(await repo.loadTopics(DIR)).toEqual(topics);
  });

  it("seeds default cognitive levels and round-trips edits", async () => {
    const seeded = await repo.loadCognitiveLevels(DIR);
    expect(seeded.length).toBe(4);
    await repo.saveCognitiveLevels(DIR, [{ code: "L1", label: "Knowledge" }]);
    expect(await repo.loadCognitiveLevels(DIR)).toEqual([{ code: "L1", label: "Knowledge" }]);
  });

  it("round-trips the mark-grid navigation preference", async () => {
    expect((await repo.loadUserPrefs(DIR)).markGridEnter).toBe("across"); // default
    await repo.saveUserPrefs(DIR, { ...DEFAULT_USER_PREFS, markGridEnter: "down" });
    expect((await repo.loadUserPrefs(DIR)).markGridEnter).toBe("down");
  });

  it("defaults privacy on when settings.csv is missing or predates the privacy keys", async () => {
    // No settings file at all.
    const fresh = await repo.loadUserPrefs(DIR);
    expect(fresh.privacyMode).toBe(true);
    expect(fresh.seatNameStyle).toBe("full");
    expect(fresh.showSeatPoints).toBe(false);
    expect(fresh.popoverShowFlags).toBe(false);
    expect(fresh.popoverShowNotes).toBe(false);
    expect(fresh.uiScale).toBe(1);
    expect(fresh.enabledPlugins).toEqual([]);
    // A legacy file holding only the old key: privacy still defaults on.
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nmark_entry_enter,down\n");
    const legacy = await repo.loadUserPrefs(DIR);
    expect(legacy.markGridEnter).toBe("down");
    expect(legacy.privacyMode).toBe(true);
  });

  it("round-trips all privacy and display preferences", async () => {
    const prefs = {
      markGridEnter: "down" as const,
      privacyMode: false,
      seatNameStyle: "firstInitial" as const,
      showSeatPoints: true,
      popoverShowFlags: true,
      popoverShowNotes: true,
      uiScale: 1.5,
      lessonBarSide: "left" as const,
      enabledPlugins: ["graph-paper", "some-future-tool"],
      teachingStyle: "strip" as const,
      dockSide: "right" as const,
      reseatPinHash: "a".repeat(64),
      timeZone: "Africa/Johannesburg",
    };
    await repo.saveUserPrefs(DIR, prefs);
    expect(await repo.loadUserPrefs(DIR)).toEqual(prefs);
  });

  it("defaults teaching mode to the room plan with no reseat PIN", async () => {
    const fresh = await repo.loadUserPrefs(DIR);
    expect(fresh.teachingStyle).toBe("room");
    expect(fresh.dockSide).toBe("left");
    expect(fresh.reseatPinHash).toBe("");
    // A hand-edited PIN cell that isn't a hash is ignored rather than trusted.
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nreseat_pin,1234\n");
    expect((await repo.loadUserPrefs(DIR)).reseatPinHash).toBe("");
  });

  it("defaults to the device time zone and ignores unknown zones", async () => {
    expect((await repo.loadUserPrefs(DIR)).timeZone).toBe("");
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\ntime_zone,Mars/Olympus\n");
    expect((await repo.loadUserPrefs(DIR)).timeZone).toBe("");
  });

  it("treats a settings file with no plugin key as no plugins enabled", async () => {
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nui_scale,1\n");
    expect((await repo.loadUserPrefs(DIR)).enabledPlugins).toEqual([]);
    // An empty value is the same thing — every plugin switched back off.
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nplugins_enabled,\n");
    expect((await repo.loadUserPrefs(DIR)).enabledPlugins).toEqual([]);
  });

  it("falls back to a top lesson bar when the setting is missing or unknown", async () => {
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nui_scale,1\n");
    expect((await repo.loadUserPrefs(DIR)).lessonBarSide).toBe("top");
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nlesson_bar_side,sideways\n");
    expect((await repo.loadUserPrefs(DIR)).lessonBarSide).toBe("top");
  });

  it("clamps a bad ui_scale back into range", async () => {
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nui_scale,9\n");
    expect((await repo.loadUserPrefs(DIR)).uiScale).toBe(2);
    await getFS().writeAtomic(`${DIR}/settings.csv`, "key,value\nui_scale,-3\n");
    expect((await repo.loadUserPrefs(DIR)).uiScale).toBe(1);
  });
});

describe("backups", () => {
  it("restores a snapshot over the live files, taking a safety copy first", async () => {
    const s1: Student = { id: "s1", firstName: "Amelia", lastName: "Adams", gender: "", flags: "SEN", notes: "" };
    await repo.saveStudents(DIR, CLS, [s1]);
    // Fake the app-start snapshot of the current state (the desktop backend
    // does this in Rust; MemFS snapshots don't copy).
    const snap = `${DIR}/backups/2026-01-01_080000`;
    await getFS().writeAtomic(`${snap}/classes/${CLS}/students.csv`, await getFS().readText(`${DIR}/classes/${CLS}/students.csv`));
    // The live file is then wrecked.
    await repo.saveStudents(DIR, CLS, []);
    expect(await repo.loadStudents(DIR, CLS)).toHaveLength(0);
    expect(await repo.listBackups(DIR)).toEqual(["2026-01-01_080000"]);

    await repo.restoreBackup(DIR, "2026-01-01_080000", "pre-restore-test");
    expect(await repo.loadStudents(DIR, CLS)).toEqual([s1]);
    // The safety copy holds the pre-restore (empty) state and is listed.
    const safety = await getFS().readText(`${DIR}/backups/pre-restore-test/classes/${CLS}/students.csv`);
    expect(safety).not.toContain("s1");
    expect(await repo.listBackups(DIR)).toContain("pre-restore-test");
  });

  it("rejects a restore of a missing snapshot", async () => {
    await expect(repo.restoreBackup(DIR, "nope", "safety")).rejects.toThrow(/not found/i);
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
