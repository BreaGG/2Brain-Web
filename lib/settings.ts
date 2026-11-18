import type { GroupBy } from "./brain";
import type { PaletteId, ThemeId } from "./palettes";
import type { AnswerKey, AxisKey, FormKey, SizeKey } from "./table";

export type LabelMode = "lit" | "all" | "none";
export type LabelSize = "auto" | "small" | "large";
export type GroupLayout = "spheres" | "tree";
export type RecordOrder = "oldest" | "newest";

export interface Settings {
  theme: ThemeId;
  ground: number; // 0..100 — brightness of the ground glow behind the body
  palette: PaletteId;
  form: number; // 0 = anatomy, 1 = layout
  tableBuilder: boolean;
  tbAcross: AxisKey;
  tbDown: AxisKey;
  tbForm: FormKey;
  tbAnswer: AnswerKey | "";
  tbSize: SizeKey;
  tbFilter: string; // "all" | "type:<key>" | "folder:<key>"
  tbMono: boolean;
  tbCounts: boolean;
  focusBrain: boolean;
  /** Visual only: the brain becomes a cosmos, every section a galaxy. */
  cosmos: boolean;
  order: RecordOrder;
  limitRotation: boolean;
  notes: boolean;
  record: boolean;
  ghosts: boolean;
  groupBy: GroupBy;
  groupLayout: GroupLayout;
  split: boolean;
  labels: LabelMode;
  labelSize: LabelSize;
  hideUnsorted: boolean;
  turning: boolean;
  speed: number; // percent
  links: boolean;
  tracts: boolean;
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
  tbAcross: "month",
  tbDown: "folder",
  tbForm: "grid",
  tbAnswer: "",
  tbSize: "same",
  tbFilter: "all",
  tbMono: false,
  tbCounts: false,
  focusBrain: false,
  cosmos: false,
  order: "oldest",
  limitRotation: false,
  notes: true,
  record: true,
  ghosts: false,
  groupBy: "folder",
  groupLayout: "spheres",
  split: false,
  labels: "lit",
  labelSize: "auto",
  hideUnsorted: false,
  turning: true,
  speed: 100,
  links: true,
  tracts: true,
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
