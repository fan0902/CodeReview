import { create } from "zustand";
import type { SourceLocation } from "@cr/contracts";
import type { ProjectSummary } from "../api/client.js";
import {
  backHistory,
  forwardHistory,
  visitHistory,
  type NavigationHistoryState,
} from "../features/files/navigation-history.js";
import {
  readInformationPanelWidth,
  writeInformationPanelWidth,
} from "../components/layout/information-panel-width.js";

type WorkspaceState = {
  project: ProjectSummary | null;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  tabs: string[];
  activeLocation: SourceLocation | null;
  history: NavigationHistoryState;
  setProject: (project: ProjectSummary) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  visitLocation: (location: SourceLocation) => void;
  back: () => void;
  forward: () => void;
  closeTab: (path: string) => void;
  reset: () => void;
};

const initialState = {
  project: null,
  rightPanelOpen: true,
  rightPanelWidth: readInformationPanelWidth(),
  tabs: [] as string[],
  activeLocation: null as SourceLocation | null,
  history: { entries: [], cursor: -1 } as NavigationHistoryState,
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  ...initialState,
  setProject: (project) => set({ project }),
  toggleRightPanel: () =>
    set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelWidth: (width) => {
    writeInformationPanelWidth(width);
    set({ rightPanelWidth: width });
  },
  visitLocation: (location) =>
    set((state) => ({
      activeLocation: location,
      tabs: state.tabs.includes(location.path)
        ? state.tabs
        : [...state.tabs, location.path],
      history: visitHistory(state.history, location),
    })),
  back: () =>
    set((state) => {
      const result = backHistory(state.history);
      return { history: result.state, activeLocation: result.location ?? state.activeLocation };
    }),
  forward: () =>
    set((state) => {
      const result = forwardHistory(state.history);
      return { history: result.state, activeLocation: result.location ?? state.activeLocation };
    }),
  closeTab: (path) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab !== path);
      if (state.activeLocation?.path !== path) return { tabs };
      const fallback = tabs.at(-1);
      return {
        tabs,
        activeLocation: fallback ? { path: fallback, line: 1, column: 1 } : null,
      };
    }),
  reset: () => set({ ...initialState, history: { entries: [], cursor: -1 } }),
}));
