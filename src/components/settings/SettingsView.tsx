import { Fragment, useMemo, useState } from "react";
import { useAppPick } from "../../store/appStore";
import RosterView from "../RosterView";
import LayoutDesigner from "../LayoutDesigner";
import ExportView from "../ExportView";
import Icon, { IconName } from "../Icon";
import GeneralTab from "./GeneralTab";
import BehaviourButtonsTab from "./BehaviourButtonsTab";
import TeachingModeSettings from "./TeachingModeSettings";
import AssessmentSettings from "./AssessmentSettings";
import PluginSettings from "./PluginSettings";
import SeatingRulesEditor from "./SeatingRulesEditor";

type SettingsTab = "general" | "students" | "layout" | "seating" | "assessments" | "tools" | "export" | "behaviour" | "teaching";

// App-wide tabs first, then the ones that belong to the class chosen in the
// app bar, so it is clear which settings follow the class and which don't.
const TABS: Array<{ id: SettingsTab; label: string; icon: IconName; perClass: boolean }> = [
  { id: "general", label: "General", icon: "tune", perClass: false },
  { id: "behaviour", label: "Behaviour", icon: "thumbs_up_down", perClass: false },
  { id: "teaching", label: "Teaching mode", icon: "co_present", perClass: false },
  { id: "assessments", label: "Assessments", icon: "quiz", perClass: false },
  { id: "tools", label: "Tools", icon: "build", perClass: false },
  { id: "export", label: "Export", icon: "download", perClass: false },
  { id: "students", label: "Students", icon: "group", perClass: true },
  { id: "layout", label: "Room layout", icon: "grid_view", perClass: true },
  { id: "seating", label: "Seating rules", icon: "rule", perClass: true },
];

export default function SettingsView() {
  const { classes, currentClass } = useAppPick("classes", "currentClass");
  const active = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const [tab, setTab] = useState<SettingsTab>("general");
  const perClass = TABS.find((t) => t.id === tab)?.perClass;

  return (
    <div>
      <div className="md-tabs" role="tablist" aria-label="Settings">
        {TABS.map((t, i) => (
          <Fragment key={t.id}>
            {t.perClass && !TABS[i - 1]?.perClass && <span className="md-tab-divider" aria-hidden />}
            <button
              role="tab"
              aria-selected={tab === t.id}
              className={`md-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={20} />
              {t.label}
            </button>
          </Fragment>
        ))}
      </div>

      {perClass && currentClass && (
        <p className="settings-for muted">
          For <b>{currentClass}</b> — change the class from the menu at the top right.
        </p>
      )}

      {tab === "general" && <GeneralTab />}
      {tab === "behaviour" && <BehaviourButtonsTab />}
      {tab === "teaching" && <TeachingModeSettings />}
      {tab === "assessments" && <AssessmentSettings />}
      {tab === "tools" && <PluginSettings />}
      {tab === "export" && <ExportView />}
      {perClass &&
        (active.length === 0 ? (
          <div className="panel muted">Create a class first, then set it up here.</div>
        ) : !currentClass ? (
          <div className="panel muted">
            Pick a class from the menu at the top right to edit its {TABS.find((t) => t.id === tab)?.label.toLowerCase()}.
          </div>
        ) : tab === "students" ? (
          <RosterView />
        ) : tab === "layout" ? (
          <LayoutDesigner />
        ) : (
          <SeatingRulesEditor />
        ))}
    </div>
  );
}
