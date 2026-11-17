import type { GroupBy } from "./brain";
import type { PaletteId, ThemeId } from "./palettes";

export type LabelMode = "lit" | "all" | "none";
export type LabelSize = "auto" | "small" | "large";

export interface Settings {
  theme: ThemeId;
  ground: number; // 0..100 — brightness of the ground glow behind the body
  palette: PaletteId;
  form: number; // 0 = anatomy, 1 = layout
  tableBuilder: boolean;
  focusBrain: boolean;
  notes: boolean;
  record: boolean;
  ghosts: boolean;
  groupBy: GroupBy;
  split: boolean;
  labels: LabelMode;
  labelSize: LabelSize;
  hideUnsorted: boolean;
  turning: boolean;
  speed: number; // percent
  links: boolean;
  outline: boolean;
  outlineOpacity: number; // percent
  pointSize: number; // percent
  activity: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "original",
  ground: 35,
  palette: "default",
  form: 0,
  tableBuilder: false,
  focusBrain: false,
  notes: true,
  record: true,
  ghosts: false,
  groupBy: "folder",
  split: false,
  labels: "lit",
  labelSize: "auto",
  hideUnsorted: false,
  turning: true,
  speed: 100,
  links: true,
  outline: true,
  outlineOpacity: 100,
  pointSize: 100,
  activity: true,
};

const KEY = "2brain.view.v2";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}
