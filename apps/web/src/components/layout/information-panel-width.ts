export const DEFAULT_INFORMATION_PANEL_WIDTH = 420;
export const MIN_INFORMATION_PANEL_WIDTH = 320;
export const INFORMATION_PANEL_STORAGE_KEY = "cr.informationPanelWidth";

type WidthStorage = Pick<Storage, "getItem" | "setItem">;

export function clampInformationPanelWidth(
  width: number,
  workspaceWidth: number,
): number {
  const maximum = Math.max(
    MIN_INFORMATION_PANEL_WIDTH,
    Math.floor(workspaceWidth * 0.5),
  );
  return Math.round(
    Math.min(maximum, Math.max(MIN_INFORMATION_PANEL_WIDTH, width)),
  );
}

export function readInformationPanelWidth(
  storage: WidthStorage | undefined = safeStorage(),
): number {
  if (!storage) return DEFAULT_INFORMATION_PANEL_WIDTH;
  const width = Number(storage.getItem(INFORMATION_PANEL_STORAGE_KEY));
  return Number.isFinite(width) && width >= MIN_INFORMATION_PANEL_WIDTH
    ? Math.round(width)
    : DEFAULT_INFORMATION_PANEL_WIDTH;
}

export function writeInformationPanelWidth(
  width: number,
  storage: WidthStorage | undefined = safeStorage(),
): void {
  storage?.setItem(INFORMATION_PANEL_STORAGE_KEY, String(Math.round(width)));
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
