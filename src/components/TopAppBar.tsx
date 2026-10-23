import { useAppPick } from "../store/appStore";
import { useSubPageStore } from "../store/subPage";
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
  const { view, activePlugin, setView } = useAppPick("view", "activePlugin", "setView");
  // A screen opened within the page (the markbook, one test's marks): "← Marks › Markbook".
  const sub = useSubPageStore((st) => st.page);
  const title = pageTitle(view, activePlugin);
  const back = sub
    ? { label: `Back to ${title}`, go: sub.onBack }
    : view === "plugin"
      ? { label: "Back to Home", go: () => setView("home") }
      : view === "roster" || view === "layout"
        ? { label: "Back to Settings", go: () => setView("settings") }
        : null;
  return (
    <header className="top-bar no-print">
      {back && (
        <button className="icon-btn" onClick={back.go} aria-label={back.label} title={back.label}>
          <Icon name="arrow_back" />
        </button>
      )}
      <h1 className="top-bar-title">
        {sub ? (
          <>
            <span className="top-bar-parent">{title}</span>
            <span className="top-bar-sep" aria-hidden>
              ›
            </span>
            {sub.title}
            {sub.detail && <span className="top-bar-detail"> ({sub.detail})</span>}
          </>
        ) : (
          title
        )}
      </h1>
      <div className="spacer" />
      <ClassPicker />
    </header>
  );
}
