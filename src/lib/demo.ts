// Demo dataset used when the app runs in a plain browser (no Tauri backend).
// Lets the whole UI be exercised — and screenshotted in CI — without a disk.

import { newId, nowIso } from "./id";
import * as repo from "./repo";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  BathroomVisit,
  BehaviourEvent,
  Desk,
  LessonRecord,
  Mark,
  QuestionMark,
  SeatAssignment,
  Student,
  TopicEntry,
  ANSWERED_BEHAVIOUR,
  ANSWER_BEHAVIOURS,
  NO_ANSWER_BEHAVIOUR,
} from "./types";

export const DEMO_DIR = "/demo/ClassroomData";

const FIRST = ["Amelia", "Ben", "Chloe", "Daniel", "Ella", "Finn", "Grace", "Harry", "Isla", "Jack", "Katie", "Liam", "Mia", "Noah", "Olivia", "Priya", "Quinn", "Ruby", "Sam", "Tara", "Umar", "Violet", "Will", "Xena"];
const LAST = ["Adams", "Baker", "Clark", "Davies", "Evans", "Foster", "Green", "Hughes", "Irwin", "Jones", "Khan", "Lewis", "Morris", "Nolan", "Owen", "Patel", "Quirke", "Reid", "Smith", "Turner", "Usman", "Vance", "Walsh", "Young"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoData(): Promise<string> {
  const rand = mulberry32(42);
  const dataDir = DEMO_DIR;
  await repo.ensureDataDir(dataDir);

  const className = "7B-Science";
  await repo.saveClassInfo(dataDir, {
    name: className,
    year: "7",
    subject: "Science",
    room: "Lab 2",
    notes: "# Class notes\n\nDemo class generated automatically. Pick a real data folder to start fresh.",
    archived: false,
    color: "#1d63b0",
  });

  const students: Student[] = [];
  for (let i = 0; i < 24; i++) {
    students.push({
      id: newId("s"),
      firstName: FIRST[i],
      lastName: LAST[(i * 7) % LAST.length],
      adamNo: String(21403 + i * 17),
      gender: i % 2 ? "M" : "F",
      flags: i === 3 ? "SEN" : i === 11 ? "Medical" : "",
      notes: "",
    });
  }
  await repo.saveStudents(dataDir, className, students);

  // Four weeks of attendance.
  const attendance: AttendanceEntry[] = [];
  for (let d = 27; d >= 0; d--) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const date = day.toISOString().slice(0, 10);
    for (const s of students) {
      const r = rand();
      attendance.push({ date, studentId: s.id, status: r < 0.9 ? "P" : r < 0.95 ? "L" : r < 0.98 ? "A" : "E", note: "" });
    }
  }
  await repo.saveAttendance(dataDir, className, attendance);

  // A simple room: teacher desk + 4 rows of 3 double desks + a label box.
  const desks: Desk[] = [
    { id: newId("d"), label: "Teacher", shape: "teacher", x: 340, y: 20, w: 140, h: 60, rotation: 0, color: "", textColor: "", stripColor: "" },
    { id: newId("d"), label: "Book corner", shape: "label", x: 720, y: 40, w: 140, h: 40, rotation: 0, color: "", textColor: "", stripColor: "" },
  ];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      desks.push({
        id: newId("d"),
        label: "",
        shape: "double",
        x: 120 + col * 220,
        y: 140 + row * 110,
        w: 160,
        h: 60,
        rotation: 0,
        color: row === 0 && col === 0 ? "#dcebf7" : "",
        textColor: "",
        stripColor: "",
      });
    }
  }
  await repo.saveDesks(dataDir, className, desks);

  const seating: SeatAssignment[] = [];
  let seatIdx = 0;
  for (const d of desks.filter((d) => d.shape === "double")) {
    for (let i = 0; i < 2 && seatIdx < students.length; i++) {
      seating.push({ planName: "Default", deskId: d.id, seatIndex: i, studentId: students[seatIdx++].id });
    }
  }
  await repo.saveSeating(dataDir, className, seating);

  // Per-class random-seating rules (shown in Settings): pin the SEN student to
  // the front, and start with no keep-apart pairs so the insights can suggest one.
  await repo.saveSeatingPrefs(dataDir, className, {
    apartPairs: [],
    togetherPairs: [],
    frontIds: [students[3].id],
  });

  // A few weeks of ended lessons so the seating insights have something to
  // chew on. Students[0] & [1] behave badly whenever they share the front desk,
  // but well once they're split up — exactly the pattern the analysis flags.
  const doubleDesks = desks.filter((d) => d.shape === "double");
  const deskLabel = new Map(doubleDesks.map((d, i) => [d.id, `Row ${Math.floor(i / 3) + 1}·${(i % 3) + 1}`]));
  const seatByDesk = new Map<string, SeatAssignment[]>();
  for (const s of seating) {
    const list = seatByDesk.get(s.deskId) ?? [];
    list.push(s);
    seatByDesk.set(s.deskId, list);
  }
  const troublemakers = new Set([students[0].id, students[1].id]);
  const lessons: LessonRecord[] = [];
  for (let sess = 0; sess < 5; sess++) {
    const sessionId = newId("les");
    const t = new Date();
    t.setDate(t.getDate() - (5 - sess) * 3);
    const timestamp = t.toISOString();
    const date = timestamp.slice(0, 10);
    const together = sess < 3; // first three lessons they sit together
    for (const seat of seating) {
      const s = students.find((st) => st.id === seat.studentId);
      if (!s) continue;
      let label = deskLabel.get(seat.deskId) ?? "Desk";
      let points = Math.round((rand() - 0.4) * 4);
      let seatmates = (seatByDesk.get(seat.deskId) ?? []).filter((x) => x.studentId !== seat.studentId).map((x) => x.studentId);
      if (troublemakers.has(seat.studentId)) {
        if (together) {
          label = "Row 1·1";
          points = -3;
          seatmates = [seat.studentId === students[0].id ? students[1].id : students[0].id];
        } else {
          // Split to opposite corners and settle down.
          label = seat.studentId === students[0].id ? "Row 4·3" : "Row 4·1";
          points = 3;
          seatmates = [];
        }
      }
      const deskId = troublemakers.has(seat.studentId) && !together ? `apart-${seat.studentId}` : seat.deskId;
      lessons.push({
        sessionId,
        date,
        timestamp,
        studentId: seat.studentId,
        deskId,
        deskLabel: label,
        seatmates: seatmates.join(";"),
        points,
        positives: points > 0 ? 1 : 0,
        negatives: points < 0 ? 1 : 0,
      });
    }
  }
  await repo.saveLessons(dataDir, className, lessons);

  const behaviourCodes = await repo.loadBehaviourCodes(dataDir);
  // Four weeks of behaviour. Most of it is spread across the class; a few
  // students lean one way so the dashboards have someone to point out.
  const conduct = behaviourCodes.filter((c) => !ANSWER_BEHAVIOURS.some((a) => a.code === c.code));
  const positives = conduct.filter((c) => c.points > 0);
  const negatives = conduct.filter((c) => c.points < 0);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const events: BehaviourEvent[] = [];
  for (let i = 0; i < 140; i++) {
    const s = i % 7 === 0 ? students[i % 2] : i % 11 === 0 ? students[6] : pick(students);
    const leansBad = s === students[0] || s === students[1];
    const leansGood = s === students[6] || s === students[9];
    const good = leansBad ? rand() < 0.2 : leansGood ? rand() < 0.9 : rand() < 0.6;
    const code = pick(good ? positives : negatives);
    const daysAgo = Math.floor(rand() * 28);
    const t = new Date();
    t.setDate(t.getDate() - daysAgo);
    events.push({ timestamp: t.toISOString(), studentId: s.id, code: code.code, points: code.points, note: "" });
  }
  events.push({ timestamp: nowIso(), studentId: students[0].id, code: "EFF", points: 1, note: "Excellent start" });
  await repo.saveBehaviourEvents(dataDir, className, events);

  // Timed bathroom trips over four weeks; one student goes far more often.
  const bathroom: BathroomVisit[] = Array.from({ length: 14 }, (_, i) => {
    const out = new Date();
    out.setDate(out.getDate() - Math.floor(i * 1.9));
    out.setHours(10, 5 + (i % 5) * 9, 0, 0);
    const back = new Date(out.getTime() + (2 + (i % 4) * 2) * 60000 + 24000);
    return {
      date: out.toISOString().slice(0, 10),
      studentId: students[i % 3 === 0 ? 4 : (i * 5) % students.length].id,
      start: out.toISOString(),
      end: back.toISOString(),
    };
  });
  await repo.saveBathroomVisits(dataDir, className, bathroom);

  // App-wide topic bank for this grade, used by the multi-question test below
  // and by the New assessment dialog's content-area / topic dropdowns.
  const topics: TopicEntry[] = [
    { grade: "7", area: "Physics", subtopic: "Forces", short: "For" },
    { grade: "7", area: "Physics", subtopic: "Energy", short: "Nrg" },
    { grade: "7", area: "Physics", subtopic: "Electricity", short: "Elec" },
    { grade: "7", area: "Chemistry", subtopic: "Particles", short: "Part" },
    { grade: "7", area: "Chemistry", subtopic: "Acids & Bases", short: "A&B" },
    { grade: "7", area: "Science Skills", subtopic: "Graphs", short: "Graph" },
    { grade: "7", area: "Science Skills", subtopic: "Variables", short: "Var" },
  ];
  await repo.saveTopics(dataDir, topics);

  // A per-student ability so a student marks consistently across assessments.
  const abilities = students.map((_, i) => 0.45 + 0.5 * rand() + (i % 5 === 0 ? -0.08 : 0));

  // One multi-question test (à la a physics class test) so the marking grid,
  // per-question stats and ranking are all demoable.
  const forcesId = newId("a");
  const forcesQuestions: AssessmentQuestion[] = [
    { assessmentId: forcesId, number: 1, topic: "Forces", marks: 6, cognitiveLevel: "L1" },
    { assessmentId: forcesId, number: 2, topic: "Forces", marks: 10, cognitiveLevel: "L2" },
    { assessmentId: forcesId, number: 3, topic: "Energy", marks: 8, cognitiveLevel: "L2" },
    { assessmentId: forcesId, number: 4, topic: "Energy", marks: 12, cognitiveLevel: "L3" },
    { assessmentId: forcesId, number: 5, topic: "Electricity", marks: 4, cognitiveLevel: "L1" },
    { assessmentId: forcesId, number: 6, topic: "Electricity", marks: 10, cognitiveLevel: "L4" },
  ];
  const forcesTotal = forcesQuestions.reduce((s, q) => s + q.marks, 0);
  const forces: Assessment = {
    id: forcesId,
    title: "Forces & energy test",
    date: shiftDate(-21),
    totalMarks: forcesTotal,
    category: "Test",
    questionCount: forcesQuestions.length,
    contentArea: "Physics",
    kind: "informal",
    weight: 1,
  };

  const singleAssessments: Assessment[] = [
    { id: newId("a"), title: "Cells test", date: shiftDate(-42), totalMarks: 40, category: "Test", questionCount: 1, contentArea: "", kind: "informal", weight: 1 },
    { id: newId("a"), title: "Energy project", date: shiftDate(-14), totalMarks: 50, category: "Project", questionCount: 1, contentArea: "Physics", kind: "informal", weight: 1 },
    { id: newId("a"), title: "Mid-term exam", date: shiftDate(-2), totalMarks: 80, category: "Exam", questionCount: 1, contentArea: "", kind: "exam", weight: 1 },
  ];
  const assessments: Assessment[] = [forces, ...singleAssessments];
  await repo.saveAssessments(dataDir, className, assessments);
  await repo.saveAssessmentQuestions(dataDir, className, forcesQuestions);

  const marks: Mark[] = [];
  const questionMarks: QuestionMark[] = [];

  // Single-mark assessments.
  students.forEach((s, i) => {
    singleAssessments.forEach((a, ai) => {
      if (rand() < 0.05) return; // occasional missing mark
      const drift = (ai - 1) * (i % 7 === 0 ? -0.05 : 0.02);
      const pct = Math.max(0.15, Math.min(0.99, abilities[i] + drift + (rand() - 0.5) * 0.16));
      marks.push({ assessmentId: a.id, studentId: s.id, mark: Math.round(pct * a.totalMarks), comment: "" });
    });
  });

  // The multi-question test: per-question marks plus each student's total.
  students.forEach((s, i) => {
    if (rand() < 0.1) return; // a couple didn't sit the test
    let total = 0;
    forcesQuestions.forEach((q) => {
      const pct = Math.max(0.1, Math.min(1, abilities[i] + (rand() - 0.5) * 0.28));
      const m = Math.round(pct * q.marks);
      questionMarks.push({ assessmentId: forcesId, studentId: s.id, number: q.number, mark: m });
      total += m;
    });
    marks.push({ assessmentId: forcesId, studentId: s.id, mark: total, comment: "" });
  });

  await repo.saveQuestionMarks(dataDir, className, questionMarks);

  // Cold-call answers from Pick a student, more often right for the stronger
  // students. A few students are never picked, so "Rarely asked" has names.
  for (let i = 0; i < 90; i++) {
    const si = Math.floor(rand() * (students.length - 3));
    const t = new Date();
    t.setDate(t.getDate() - Math.floor(rand() * 28));
    const right = rand() < abilities[si] + 0.1;
    const code = right ? ANSWERED_BEHAVIOUR : NO_ANSWER_BEHAVIOUR;
    events.push({ timestamp: t.toISOString(), studentId: students[si].id, code: code.code, points: code.points, note: "" });
  }
  await repo.saveBehaviourEvents(dataDir, className, events);
  await repo.saveMarks(dataDir, className, marks);

  return dataDir;
}

function shiftDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export { mulberry32 };
