"use client";

import { createContext, useContext } from "react";
import type { GroupBy, Model } from "@/lib/brain";
import type { Settings } from "@/lib/settings";

export type PaneId = "navigator" | "numbers" | "timeline" | "you" | "lab" | "review" | "files" | "learn" | "add" | "note";

export type Focus =
  | { kind: "none" }
  | { kind: "note"; i: number }
  | { kind: "groups"; groupBy: GroupBy; keys: number[] }
  | { kind: "set"; ids: number[]; label: string; source?: string };

export const NAV: { id: PaneId | "brain"; label: string; accent: string; hint: string }[] = [
  { id: "brain", label: "Brain", accent: "var(--l0)", hint: "The whole record, as a brain" },
  { id: "navigator", label: "Navigator", accent: "var(--l1)", hint: "Folders and every note in them" },
  { id: "numbers", label: "Numbers", accent: "var(--l2)", hint: "The record, counted" },
  { id: "timeline", label: "Timeline", accent: "var(--l3)", hint: "What you wrote and when" },
  { id: "you", label: "You", accent: "var(--l5)", hint: "Your hubs and what to work on next" },
  { id: "lab", label: "Lab", accent: "var(--l6)", hint: "Table builder, gestures and link analysis" },
  { id: "review", label: "Review", accent: "spectrum", hint: "Ghost links, orphans and missing fields" },
  { id: "files", label: "Files", accent: "#ffffff", hint: "Every file in the wiki" },
  { id: "learn", label: "Learn", accent: "var(--l4)", hint: "How your brain works" },
];

export const ADD_ACCENT = "var(--l7)";

export interface AppApi {
  model: Model;
  settings: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  resetSettings: () => void;
  /** CSS colour per group for the current grouping. */
  colors: string[];
  colorOf: (noteIndex: number) => string;
  groupOf: Int32Array;
  pane: PaneId | null;
  openPane: (p: PaneId | null) => void;
  noteIdx: number | null;
  openNote: (i: number, opts?: { focus?: boolean }) => void;
  openSlug: (slug: string) => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  lightSet: (ids: number[], label: string, source?: string) => void;
  openCommand: (q?: string) => void;
  repo: { owner: string; repo: string } | null;
  usingSample: boolean;
  gestures: boolean;
  setGestures: (v: boolean) => void;
  replaceSettings: (s: Settings) => void;
  /** New notes can be written to the wiki repository from here. */
  writable: boolean;
  startTour: () => void;
  /** Showing the built-in demo brain instead of the wiki. */
  demo: boolean;
  setDemo: (v: boolean) => void;
}

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp outside <AppCtx>");
  return v;
}
