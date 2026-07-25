// How each file in the data folder should be reconciled when two devices have
// both changed it since the last sync.
//
// Most ClassKernel CSVs are *keyed sets of rows* — a register, a mark sheet, a
// student list — so the two sides can be unioned and nothing is lost. That is
// what makes desktop-plus-Android usable: mark a register on your phone and log
// behaviour on the laptop in the same lesson, and both survive.
//
// The exceptions are files that are a single document rather than a set of
// rows. Row-merging a room layout or a seating plan would produce overlapping
// desks and double-seated students, so those take newest-wins and the losing
// version is kept beside it as a .conflict- copy for the teacher to look at.

export type MergePolicy =
  | { kind: "union"; key: string[] }
  | { kind: "whole" };

/** Keyed by file name; the same names appear under classes/<name>/ and at the root. */
const UNION_KEYS: Record<string, string[]> = {
  // Per class
  "attendance.csv": ["date", "student_id"],
  "behaviour.csv": ["timestamp", "student_id", "code"],
  "lessons.csv": ["session_id", "student_id"],
  "marks.csv": ["assessment_id", "student_id"],
  "question_marks.csv": ["assessment_id", "student_id", "q_number"],
  "students.csv": ["id"],
  "assessments.csv": ["assessment_id"],
  "assessment_questions.csv": ["assessment_id", "q_number"],
  "seating_prefs.csv": ["type", "a", "b"],
  // App-wide
  "behaviours.csv": ["code"],
  "cognitive_levels.csv": ["code"],
  "topics.csv": ["grade", "area", "subtopic"],
  "timer_presets.csv": ["name"],
  "settings.csv": ["key"],
};

/**
 * Whole-document files. desks/room/seating describe one coherent arrangement,
 * and class.md is free prose.
 */
const WHOLE_FILES = new Set(["desks.csv", "room.csv", "seating.csv", "class.md"]);

export function baseName(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? relPath : relPath.slice(i + 1);
}

export function policyFor(relPath: string): MergePolicy {
  // A saved room template is a document, even though it reuses desks.csv /
  // room.csv names that are whole-file anyway.
  if (relPath.startsWith("layouts/")) return { kind: "whole" };

  const name = baseName(relPath);
  const key = UNION_KEYS[name];
  if (key) return { kind: "union", key };
  if (WHOLE_FILES.has(name)) return { kind: "whole" };
  // Anything new that nobody taught this table about: treat it as a document.
  // Newest-wins plus a conflict copy is the option that cannot lose data
  // silently.
  return { kind: "whole" };
}

/**
 * False when `policyFor` fell through to its default rather than matching a
 * rule. A test uses this to catch a new data file being added to the repository
 * layer without anyone deciding how it should merge.
 */
export function hasExplicitPolicy(relPath: string): boolean {
  if (relPath.startsWith("layouts/")) return true;
  const name = baseName(relPath);
  return name in UNION_KEYS || WHOLE_FILES.has(name);
}

// ---------- what sync ignores ----------

const IGNORED_DIRS = new Set([
  // Per-device rolling snapshots: large, and each machine wants its own.
  "backups",
  // Spreadsheet exports (Settings → Export). Generated output, not source
  // data: regenerable from what is synced, and .xlsx is a binary zip that the
  // text-based sync below cannot carry anyway.
  "exports",
]);

/**
 * Sync moves text. Everything the app treats as data is .csv or .md, and the
 * engine reads and writes it as UTF-8 strings, so a binary file is not merely
 * unsupported — reading one fails outright and would leave sync stuck
 * reporting an error every pass. Spreadsheet exports normally land in
 * `exports/`, but the Save-as dialog lets them go anywhere, so filter on the
 * extension too.
 */
const BINARY_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".zip", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".docx"];

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith(".");
}

export function isIgnoredFile(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    name.startsWith(".") ||
    name.endsWith(".tmp.classkernel") ||
    // Conflict copies stay on the machine that produced them; uploading them
    // would let them ping-pong between devices forever.
    name.includes(".conflict-") ||
    name === META_FILE ||
    BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
}

/**
 * A small marker written into the Drive folder describing the layout, so the
 * future Android app can check what it is looking at before touching anything.
 * Remote-only — it deliberately has no local counterpart.
 */
export const META_FILE = "ck-meta.json";
export const SCHEMA_VERSION = 1;

export function metaContents(folderName: string): string {
  return (
    JSON.stringify(
      {
        app: "ClassKernel",
        schema_version: SCHEMA_VERSION,
        folder_name: folderName,
        description:
          "Classroom data as plain CSV/Markdown. Paths are relative to this folder and " +
          "also recorded on each file as appProperties.ck_rel_path.",
      },
      null,
      2,
    ) + "\n"
  );
}

/** Name for the losing side of a whole-file conflict: desks.conflict-<stamp>.csv */
export function conflictCopyPath(relPath: string, stamp: string): string {
  const dot = relPath.lastIndexOf(".");
  const slash = relPath.lastIndexOf("/");
  if (dot > slash) return `${relPath.slice(0, dot)}.conflict-${stamp}${relPath.slice(dot)}`;
  return `${relPath}.conflict-${stamp}`;
}
