import { useEffect, useRef } from "react";
import { create } from "zustand";

/** A screen opened from within a page (the markbook, an assessment's marks), shown in the top bar. */
export interface SubPage {
  title: string;
  /** Shown quietly after the title, e.g. "out of 50". */
  detail?: string;
  onBack: () => void;
}

export const useSubPageStore = create<{ page: SubPage | null }>(() => ({ page: null }));

/**
 * While this screen is open, the top bar names it after its page and carries
 * its way back — "← Marks › Markbook" — in the same place as every other
 * Back, instead of a button partway down the page. A null title: no
 * sub-page open.
 */
export function useSubPage(title: string | null, onBack: () => void, detail?: string) {
  // The latest callback, so the bar needn't be updated on every render.
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (title === null) return;
    const page: SubPage = { title, detail, onBack: () => back.current() };
    useSubPageStore.setState({ page });
    return () => {
      if (useSubPageStore.getState().page === page) useSubPageStore.setState({ page: null });
    };
  }, [title, detail]);
}
