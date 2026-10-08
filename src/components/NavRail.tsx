import { useApp, View } from "../store/appStore";
import { enabledPlugins } from "../plugins/registry";
import Icon, { IconName } from "./Icon";

// The app's main navigation: a Material navigation rail that expands into a
// drawer. Collapsed it is a column of icons with short labels; expanded it
// gives the full names and lists the teacher's tools (enabled plugins). The
// class itself is chosen from the top app bar, so this holds only places.

interface Destination {
  /** The views that count as this destination. */
  views: View[];
  icon: IconName;
  /** Short label under the icon on the rail. */
  label: string;
  /** Full name in the expanded drawer and the page title. */
  name: string;
}

export const DESTINATIONS: Destination[] = [
  { views: ["home"], icon: "home", label: "Home", name: "Home" },
  { views: ["attendance"], icon: "fact_check", label: "Attendance", name: "Attendance" },
  { views: ["seating"], icon: "event_seat", label: "Seats", name: "Seats" },
  { views: ["lesson"], icon: "school", label: "Lesson", name: "Lesson" },
  { views: ["behaviourLog"], icon: "thumbs_up_down", label: "Behaviour", name: "Behaviour log" },
  { views: ["assessments"], icon: "grading", label: "Marks", name: "Marks" },
  { views: ["notes"], icon: "sticky_note_2", label: "Notes", name: "Class notes" },
];

export const SETTINGS_DESTINATION: Destination = { views: ["settings"], icon: "settings", label: "Settings", name: "Settings" };

function NavItem({
  icon,
  label,
  active,
  expanded,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={expanded ? undefined : label}
    >
      <span className="nav-indicator">
        <Icon name={icon} filled={active} />
      </span>
      <span className="nav-label">{label}</span>
    </button>
  );
}

export default function NavRail({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { view, setView, activePlugin, openPlugin, userPrefs } = useApp();
  const tools = enabledPlugins(userPrefs.enabledPlugins);
  const item = (d: Destination) => (
    <NavItem
      key={d.name}
      icon={d.icon}
      label={expanded ? d.name : d.label}
      active={d.views.includes(view)}
      expanded={expanded}
      onClick={() => setView(d.views[0])}
    />
  );

  return (
    <nav className={`nav-rail no-print ${expanded ? "expanded" : ""}`} aria-label="Main">
      <div className="nav-head">
        <button
          className="icon-btn"
          onClick={onToggle}
          aria-label={expanded ? "Collapse the menu" : "Expand the menu"}
          aria-expanded={expanded}
          title={expanded ? "Collapse the menu" : "Expand the menu"}
        >
          <Icon name={expanded ? "menu_open" : "menu"} />
        </button>
        {expanded && (
          <div className="nav-brand">
            ClassKernel
            <small>fast · offline · portable</small>
          </div>
        )}
      </div>

      <div className="nav-items">{DESTINATIONS.map(item)}</div>

      {expanded && tools.length > 0 && (
        <div className="nav-items nav-tools">
          <div className="nav-section">Tools</div>
          {tools.map((p) => (
            <NavItem
              key={p.id}
              icon={p.icon}
              label={p.name}
              active={view === "plugin" && activePlugin === p.id}
              expanded
              onClick={() => openPlugin(p.id)}
            />
          ))}
        </div>
      )}

      <div className="nav-spacer" />
      <div className="nav-items">{item(SETTINGS_DESTINATION)}</div>
    </nav>
  );
}
