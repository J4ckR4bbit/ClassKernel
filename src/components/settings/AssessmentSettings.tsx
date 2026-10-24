import { useMemo } from "react";
import { useAppPick } from "../../store/appStore";
import { gradesInTopics } from "../../lib/topics";
import TopicBankEditor from "./TopicBankEditor";
import CognitiveLevelsEditor from "./CognitiveLevelsEditor";
import MarkEntrySettings from "./MarkEntrySettings";
import WeightingSettings from "./WeightingSettings";

/**
 * App-wide assessment settings: the per-grade topic bank used by question
 * dropdowns, the editable cognitive-level list, and the marking-grid key
 * behaviour. All shared across classes.
 */
export default function AssessmentSettings() {
  const { classes, topics, userPrefs } = useAppPick("classes", "topics", "userPrefs");
  const links = userPrefs.topicLinks;

  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const c of classes) if (c.year) set.add(c.year);
    for (const g of gradesInTopics(topics)) set.add(g);
    for (const g of Object.keys(links)) set.add(g);
    return [...set].sort();
  }, [classes, topics, links]);

  return (
    <>
      <TopicBankEditor grades={grades} />
      <CognitiveLevelsEditor />
      <MarkEntrySettings />
      <WeightingSettings grades={grades} />
    </>
  );
}
