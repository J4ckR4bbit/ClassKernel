import { useApp } from "../store/appStore";
import { pluginById } from "../plugins/registry";
import Icon from "./Icon";
import ClassPicker from "./ClassPicker";
import { DESTINATIONS, SETTINGS_DESTINATION } from "./NavRail";

// The bar across the top of every page: where you are on the left, and which
// class you are working with on the right. Choosing the class here, once,
// replaces the class list the old sidebar carried and the "Editing class"
// pickers inside Settings.

function pageTitle(view: string, activePlugin: string | null): string {
  if (view === "home") return "ClassKernel";
  if (view === "plugin") return (activePlugin && pluginById(activePlugin)?.name) || "Tool";
  if (view === "roster") return "Students";
  if (view === "layout") return "Room layout";
  const d = [...DESTINATIONS, SETTINGS_DESTINATION].find((x) => x.views.includes(view as never));
  return d?.name ?? "";
}

export default function TopAppBar() {
  const { view, activePlugin, setView } = useApp();
  const back = view === "plugin" || view === "roster" || view === "layout";
  return (
    <header className="top-bar no-print">
      {back && (
        <button
          className="icon-btn"
          onClick={() => setView(view === "plugin" ? "home" : "settings")}
          aria-label={view === "plugin" ? "Back to Home" : "Back to Settings"}
          title={view === "plugin" ? "Back to Home" : "Back to Settings"}
        >
          <Icon name="arrow_back" />
        </button>
      )}
      <h1 className="top-bar-title">{pageTitle(view, activePlugin)}</h1>
      <div className="spacer" />
      <ClassPicker />
    </header>
  );
}
