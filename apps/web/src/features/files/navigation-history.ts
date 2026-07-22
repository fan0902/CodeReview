import type { SourceLocation } from "@cr/contracts";

export type NavigationHistoryState = {
  entries: SourceLocation[];
  cursor: number;
};

export function visitHistory(
  state: NavigationHistoryState,
  location: SourceLocation,
): NavigationHistoryState {
  const entries = state.entries.slice(0, state.cursor + 1);
  entries.push(location);
  return { entries, cursor: entries.length - 1 };
}

export function backHistory(state: NavigationHistoryState): {
  state: NavigationHistoryState;
  location: SourceLocation | null;
} {
  if (state.cursor <= 0) return { state, location: null };
  const next = { ...state, cursor: state.cursor - 1 };
  return { state: next, location: next.entries[next.cursor] ?? null };
}

export function forwardHistory(state: NavigationHistoryState): {
  state: NavigationHistoryState;
  location: SourceLocation | null;
} {
  if (state.cursor >= state.entries.length - 1) {
    return { state, location: null };
  }
  const next = { ...state, cursor: state.cursor + 1 };
  return { state: next, location: next.entries[next.cursor] ?? null };
}

export function createNavigationHistory() {
  let state: NavigationHistoryState = { entries: [], cursor: -1 };
  return {
    visit(location: SourceLocation) {
      state = visitHistory(state, location);
    },
    back() {
      const result = backHistory(state);
      state = result.state;
      return result.location;
    },
    forward() {
      const result = forwardHistory(state);
      state = result.state;
      return result.location;
    },
  };
}
