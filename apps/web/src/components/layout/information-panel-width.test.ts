import { describe, expect, it } from "vitest";
import {
  DEFAULT_INFORMATION_PANEL_WIDTH,
  clampInformationPanelWidth,
  readInformationPanelWidth,
  writeInformationPanelWidth,
} from "./information-panel-width.js";

describe("information panel width", () => {
  it("clamps the panel between 320 pixels and half the workspace", () => {
    expect(clampInformationPanelWidth(200, 1440)).toBe(320);
    expect(clampInformationPanelWidth(540, 1440)).toBe(540);
    expect(clampInformationPanelWidth(900, 1440)).toBe(720);
  });

  it("persists a valid width and rejects invalid saved values", () => {
    const storage = new MapStorage();

    writeInformationPanelWidth(536, storage);

    expect(readInformationPanelWidth(storage)).toBe(536);
    storage.setItem("cr.informationPanelWidth", "not-a-number");
    expect(readInformationPanelWidth(storage)).toBe(DEFAULT_INFORMATION_PANEL_WIDTH);
    storage.setItem("cr.informationPanelWidth", "200");
    expect(readInformationPanelWidth(storage)).toBe(DEFAULT_INFORMATION_PANEL_WIDTH);
  });
});

class MapStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
