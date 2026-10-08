import { useApp } from "../store/appStore";

/**
 * Switch the open class from inside a class-based plugin. Plugins open from
 * Tools on Home, which isn't tied to a class, so they carry their own picker.
 */
export default function ClassPicker() {
  const { classes, currentClass, openClass } = useApp();
  const active = classes.filter((c) => !c.archived);
  if (active.length === 0) return null;
  return (
    <select
      className="class-picker"
      value={currentClass ?? ""}
      onChange={(e) => e.target.value && void openClass(e.target.value)}
      aria-label="Class"
    >
      {!currentClass && <option value="">Choose a class…</option>}
      {active.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
