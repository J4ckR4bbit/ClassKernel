import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CodeCount, StudentCount, WeekPoint, fmtNum, fmtPct } from "../../lib/insights";
import Icon, { IconName } from "../Icon";
import { shortDate } from "../../lib/format";

// Chart colours, checked with the dataviz palette validator on the light
// surface. Green/blue is the existing pair (student vs class). Positive vs
// negative behaviour is green/red; red–green is weak for deuteranopes, so the
// two are always also split by position (above / below the zero line).
export const C_PRIMARY = "#2e9455";
export const C_SECONDARY = "#3b6fd6";
export const C_NEGATIVE = "#c0322b";
// Grid and axis ink are the Material neutrals (surface-container-high and
// on-surface-variant), so the charts sit in the same greys as the rest. On
// screen they follow the theme (CSS variables work in SVG colour attributes).
export const C_GRID = "var(--chart-grid)";
export const C_INK = "var(--chart-ink)";
// A parent report is paper: always the light theme's greys.
export const PAPER_GRID = "#e5eae2";
export const PAPER_INK = "#414942";

/** The written analysis at the top of each tab. */
export function SummaryCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="summary-card" aria-label={title}>
      <h3>{title}</h3>
      {lines.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Positive entries above the line, negative below, one bar pair per week. */
export function WeeklyBehaviourChart({ weeks, height = 220 }: { weeks: WeekPoint[]; height?: number }) {
  if (weeks.length === 0) return <p className="muted">No behaviour recorded yet.</p>;
  const rows = weeks.map((w) => ({ week: `w/c ${shortDate(w.week)}`, Positive: w.positive, Negative: -w.negative }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} stackOffset="sign" barCategoryGap="20%">
        <CartesianGrid stroke={C_GRID} vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 10.5, fill: C_INK }} interval={rows.length <= 8 ? 0 : "preserveStartEnd"} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C_INK }} width={30} tickFormatter={(v: number) => fmtNum(Math.abs(v))} />
        <ReferenceLine y={0} stroke={C_INK} />
        <Tooltip formatter={(v: number, name: string) => [fmtNum(Math.abs(v)), name]} />
        <Legend />
        <Bar dataKey="Positive" stackId="b" fill={C_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Negative" stackId="b" fill={C_NEGATIVE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** How often each behaviour was logged, in the behaviour's own button colour. */
export function CodeCountChart({ counts, max = 8 }: { counts: CodeCount[]; max?: number }) {
  if (counts.length === 0) return <p className="muted">No behaviour recorded yet.</p>;
  const rows = counts.slice(0, max);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 34 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke={C_GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C_INK }} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: C_INK }} />
        <Tooltip formatter={(v: number) => [`${v} time${v === 1 ? "" : "s"}`, "Logged"]} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r) => (
            <Cell key={r.code} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One short ranked list of students; each name opens that student's tab. */
export function PeopleList({
  icon,
  title,
  hint,
  people,
  nameOf,
  onOpen,
  empty,
  tone,
  max = 6,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  people: StudentCount[];
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
  empty: string;
  tone?: "good" | "warn";
  max?: number;
}) {
  return (
    <div className={`panel people-list ${tone ?? ""}`}>
      <h3>
        <Icon name={icon} size={20} /> {title}
      </h3>
      {hint && <p className="muted people-hint">{hint}</p>}
      {people.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ol>
          {people.slice(0, max).map((p) => (
            <li key={p.studentId}>
              <button className="link-btn" onClick={() => onOpen(p.studentId)}>
                {nameOf(p.studentId)}
              </button>
              <span className="muted">{p.detail}</span>
            </li>
          ))}
          {people.length > max && <li className="muted">and {people.length - max} more</li>}
        </ol>
      )}
    </div>
  );
}

export { default as StatTile } from "../StatTile";
export { fmtPct, shortDate };
