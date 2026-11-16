// The IEB's Form F: the teacher's comment for a learner's application for
// accommodations or exemptions (Policy and procedures: accommodations and
// exemptions, for implementation from August 2024). Kept as a note of kind
// "formF", one notes.csv row per field below.

export type YesNo = "Yes" | "No" | "N/A" | "";

export interface FormFQuestion {
  key: string;
  text: string;
}

/** The checklist, worded as on the form; each is answered Yes, No or N/A. */
export const FORM_F_QUESTIONS: FormFQuestion[] = [
  { key: "q_reading", text: "Does the learner understand what they have read independently?" },
  { key: "q_spelling", text: "Are there frequent spelling errors in the learner's work?" },
  { key: "q_handwriting", text: "Is handwriting legible?" },
  { key: "q_oral", text: "Is oral work noticeably better than written work" },
  { key: "q_typed_expression", text: "Is expression better when typed on a computer?" },
  { key: "q_typed_speed", text: "Is the learner's output speed better when typed on a computer?" },
  { key: "q_unprompted", text: "Can the candidate complete work in class without prompting?" },
  { key: "q_focus", text: "Is the learner able to maintain focus throughout class time?" },
  {
    key: "q_quality_gap",
    text: "Is there a difference in quality of answers between classwork and controlled tasks/tests?",
  },
  { key: "q_incomplete", text: "Are controlled tasks/tests frequently incomplete?" },
  { key: "q_retention", text: "Are new concepts retained and applied without reteaching?" },
];

export const YES_NO: Array<Exclude<YesNo, "">> = ["Yes", "No", "N/A"];

/** The written fields, in the form's order (the checklist comes after "helpful"). */
export const FORM_F_DETAILS = [
  { key: "name", label: "Candidate's name" },
  { key: "grade", label: "Grade" },
  { key: "applied_for", label: "Accommodation(s)/exemption(s) applied for" },
  { key: "teacher", label: "Teacher" },
  { key: "subject", label: "Subject" },
  { key: "terms_taught", label: "For how many terms have you taught the candidate?" },
] as const;

export const FORM_F_HELPFUL = {
  key: "helpful",
  label: "Which accommodation/s, if any, would help this learner to show their full potential in your subject?",
} as const;

export const FORM_F_PERCENT = {
  key: "pct_not_completed",
  label: "Percentage of assessment not completed under controlled conditions?",
} as const;

/** What the app already knows, filled in for a new form. */
export function formFDefaults(known: { name: string; grade: string; subject: string; teacher: string }): Record<string, string> {
  return { name: known.name, grade: known.grade, subject: known.subject, teacher: known.teacher };
}

/** How many of the checklist's questions have an answer. */
export function formFAnswered(fields: Record<string, string>): number {
  return FORM_F_QUESTIONS.filter((q) => fields[q.key]).length;
}
