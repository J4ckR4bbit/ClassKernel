# 7. Marks

[← Behaviour log](06-behaviour-log.md) · [Contents](../README.md) · Next: [Dashboards and parent reports →](08-dashboards-and-reports.md)

Open **Marks** in the navigation rail. It lists the class's assessments, newest first.

![The list of assessments](../images/marks-list.png)

| Column / button | Shows / does |
| --- | --- |
| **Content area** | The area the test covers (e.g. *Physics*), or — for mixed. |
| **Out of** | The total. For a test marked per question, the sum of its questions. |
| **Questions** | 1 for a single mark; otherwise the number of questions. |
| **Marked** | How many students have a mark. |
| **Class mean** | The average percentage of the marks entered. |
| **Enter marks** | Opens mark entry. |
| **Questions** | (Per-question tests only) edit the questions. |
| **✕** | Deletes the assessment and every mark entered for it (asks first). |

## New assessment

Press **New assessment**.

![The New assessment dialog](../images/new-assessment.png)

| Field | Notes |
| --- | --- |
| **Title** | e.g. *Waves & sound test*. |
| **Date** | Defaults to today. |
| **Content area** | From the topic bank for the class's grade (Settings → Assessments). Choose *none / mixed* for a test across areas. |
| **Number of questions** | **1** records a single mark per student. **More than 1** records a mark per question, each tagged with a topic and cognitive level. |
| **Out of** | Only for a single mark. For per-question tests the total is added up from the questions. |
| **Category** | Free text, e.g. *Test*, *Quiz*, *Homework*, *Exam*, *Project*. The dashboards compare means by category. |

A single-mark assessment goes straight to mark entry (**Create & mark**). A per-question test goes to its question
setup first (**Set up questions**).

## Setting up questions

![Setting up a test's questions](../images/question-setup.png)

For each question, give:

- **Topic** — type, or choose from the suggestions. Suggestions come from the class grade's topic bank, filtered to
  the test's content area; you can still type a topic that isn't in the bank.
- **Marks** — what the question is out of.
- **Cognitive level** — from the list under Settings → Assessments (by default L1 *Recall* to L4
  *Evaluation / Synthesis*).

**Add question** adds a row; **✕** removes one. The total at the top right updates as you go. Press
**Start marking** when done. You can come back with **Questions** on the list (or **Edit questions** while
marking).

The topic and level tags are what let the dashboards and parent reports show strengths by topic and by cognitive
level.

## Entering marks: one mark per student

![Quick marking: one mark per student](../images/quick-marking.png)

Built for working through a pile of scripts:

- Type a mark and press **Enter** (or **↓**) to jump to the next student. **↑** goes back.
- The percentage appears beside each mark. A mark over the total shows **> max!**.
- Leave a box blank for a student who was absent or didn't write.
- An optional **comment** per student shows on their dashboard.
- **The student you're typing in is highlighted yellow**; a student turns **grey** once their mark is in. The count
  at the top right (*23/24 entered*) shows how many are done.
- A light tint down the name column — blue at the top, through green, yellow and orange, to red at the bottom —
  shows how far down the list you are at a glance.

Press **Done** to finish. Every mark is saved the moment you type it.

## Entering marks: per question

![The per-question marking grid](../images/marking-grid.png)

The grid is laid out like a mark sheet: one row per student (by surname), one column per question, with each
question's maximum (e.g. */6*) and topic short label under its number.

**Moving around**

| Key | Moves |
| --- | --- |
| **Enter** | Across to the next question (at the end of a row, to the next student). Under Settings → Assessments you can make Enter move **down** instead. |
| **Tab** | Always the other way to Enter. **Shift** reverses either. |
| **Arrow keys** | One cell. |

**While you mark**

- A mark above the question's maximum is corrected to the maximum; a negative one to 0.
- Leave a cell blank for a question not answered.
- The row you're typing in is **yellow**; a row turns **grey** once every question has a mark. The surname column
  carries the same blue-to-red position tint.
- **Total**, **%**, **level or symbol** and **rank** fill in on the right as you type. Students on the same total
  share the average of their places (two students tied for 10th and 11th both show *10.5*).
- The tiles on top show the share still **left to enter**, the **class mean** so far and the **top** student.
- The **Average (mark)** and **Average (%)** rows at the bottom show how each question went.
- Only the student rows scroll; the title, headings and average rows stay in place.

Press **Done** to finish.

## Levels or symbols

Results are shown everywhere (marking grid, dashboards, parent reports and spreadsheet exports) on one scale,
chosen under [Settings → Assessments](10-settings.md#assessments):

| Level | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **%** | 80+ | 70–79 | 60–69 | 50–59 | 40–49 | 30–39 | below 30 |

| Symbol | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- |
| **%** | 80+ | 70–79 | 60–69 | 50–59 | 40–49 | below 40 |
