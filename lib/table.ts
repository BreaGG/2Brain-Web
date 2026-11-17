/* The table builder: what can go on its axes, the forms it can take and the
 * questions its answers put to the record. Pure data — no three.js here. */

import type { Grouping, Model } from "./brain";
import { monthKey, monthLabel, monthRange } from "./brain";

export type AxisKey = "month" | "year" | "weekday" | "folder" | "domain" | "type" | "links" | "length" | "none";
export type FormKey = "grid" | "ribbon" | "wheel" | "spheres" | "shells" | "clusters" | "folders";
export type AnswerKey = "stream" | "flow" | "waves" | "chord" | "clock" | "calendar" | "returns" | "lifelines" | "balance";
export type SizeKey = "same" | "words" | "links";

export const AXES: { value: AxisKey; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "weekday", label: "Weekday" },
  { value: "folder", label: "Folder" },
  { value: "domain", label: "Domain" },
  { value: "type", label: "Type" },
  { value: "links", label: "Links" },
  { value: "length", label: "Length" },
  { value: "none", label: "Nothing" },
];

export const FORMS: { value: FormKey; label: string; hint: string }[] = [
  { value: "grid", label: "Grid", hint: "One box per cell, sized by what it holds" },
  { value: "ribbon", label: "Ribbon", hint: "A ribbon per row, thick where it is busy" },
  { value: "wheel", label: "Wheel", hint: "Across goes round, down goes out" },
  { value: "spheres", label: "Spheres", hint: "A sphere per column, a shell per row" },
  { value: "shells", label: "Shells", hint: "One sphere, a shell per column" },
  { value: "clusters", label: "Clusters", hint: "A cloud per cell" },
  { value: "folders", label: "Folders", hint: "Every folder as a box, every note inside it" },
];

export const ANSWERS: { value: AnswerKey; label: string; question: string }[] = [
  { value: "stream", label: "Stream", question: "How has the mix of what you write about shifted over time?" },
  { value: "flow", label: "Flow", question: "Where does what I write come from, and where does it go?" },
  { value: "waves", label: "Waves", question: "When was each area active, and which rose as another fell?" },
  { value: "chord", label: "Chord", question: "Which areas feed which?" },
  { value: "clock", label: "Clock", question: "What is my rhythm by weekday and season?" },
  { value: "calendar", label: "Calendar", question: "What did I write, day by day, across the whole record?" },
  { value: "returns", label: "Returns", question: "Which notes do I keep coming back to?" },
  { value: "lifelines", label: "Lifelines", question: "How long does an area of thought live?" },
  { value: "balance", label: "Balance", question: "How much is my own thinking, and how much comes from sources?" },
];

/** Note types that hold the person's own thinking rather than a summary of someone else's. */
export const OWN_TYPES = new Set(["concept", "synthesis", "page", "meta"]);

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SEASONS = ["winter", "spring", "summer", "autumn"];

export const weekdayOf = (t: number) => (new Date(t).getUTCDay() + 6) % 7;

const DAY = 86400000;

/** One sentence that answers the answer's question from the record. */
export function insight(model: Model, answer: AnswerKey, grouping: Grouping, axes?: { across: AxisKey; down: AxisKey }): string {
  const notes = model.notes;
  const dated = notes.filter((n) => n.date != null);
  const label = (g: number) => grouping.list[g]?.label ?? "—";
  switch (answer) {
    case "stream": {
      const total = grouping.list.reduce((s, g) => s + g.record, 0) || 1;
      const top = grouping.list.reduce((b, g, i) => (g.record > (grouping.list[b]?.record ?? -1) ? i : b), 0);
      return `${label(top)} holds ${Math.round((grouping.list[top].record / total) * 100)}% of the record.`;
    }
    case "flow": {
      const A = axisOf(model, axes?.across ?? "folder");
      const D = axisOf(model, axes?.down ?? "type");
      const c = new Map<string, number>();
      for (const n of notes) {
        const k = `${A.of[n.i]}|${D.of[n.i]}`;
        c.set(k, (c.get(k) ?? 0) + 1);
      }
      if (!c.size) return "Nothing to follow yet.";
      const [k, v] = [...c.entries()].sort((x, y) => y[1] - x[1])[0];
      const [a, d] = k.split("|").map(Number);
      const share = Math.round((v / Math.max(1, notes.length)) * 100);
      return `The widest band runs from ${A.labels[a]} to ${D.labels[d]}: ${v} notes, ${share}% of the record.`;
    }
    case "waves": {
      const c = new Map<string, number>();
      let best = "";
      let bv = 0;
      for (const n of dated) {
        const k = `${grouping.of[n.i]}|${monthKey(n.date!)}`;
        const v = (c.get(k) ?? 0) + Math.max(1, n.words);
        c.set(k, v);
        if (v > bv) {
          bv = v;
          best = k;
        }
      }
      if (!best) return "None of your notes is dated yet.";
      const [g, m] = best.split("|").map(Number);
      return `The biggest wave: ${label(g)} in ${monthLabel(m)}.`;
    }
    case "chord": {
      const c = new Map<string, number>();
      for (const [a, b] of model.links) {
        const ga = grouping.of[a];
        const gb = grouping.of[b];
        if (ga === gb) continue;
        const k = ga < gb ? `${ga}|${gb}` : `${gb}|${ga}`;
        c.set(k, (c.get(k) ?? 0) + 1);
      }
      if (!c.size) return "No link crosses from one area to another yet.";
      const [k, v] = [...c.entries()].sort((x, y) => y[1] - x[1])[0];
      const [a, b] = k.split("|").map(Number);
      return `Most links between areas join ${label(a)} and ${label(b)}: ${v} of them.`;
    }
    case "clock": {
      if (!dated.length) return "None of your notes is dated yet.";
      const wd = new Array(7).fill(0);
      const se = new Array(4).fill(0);
      for (const n of dated) {
        wd[weekdayOf(n.date!)]++;
        se[Math.floor(((new Date(n.date!).getUTCMonth() + 1) % 12) / 3)]++;
      }
      const w = wd.indexOf(Math.max(...wd));
      const s = se.indexOf(Math.max(...se));
      const full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][w];
      return `You write most on ${full}s, and most in ${SEASONS[s]}.`;
    }
    case "calendar": {
      if (dated.length < 2) return "Too few dated notes to draw a calendar.";
      const days = [...new Set(dated.map((n) => Math.floor(n.date! / DAY)))].sort((a, b) => a - b);
      let gap = 0;
      for (let i = 1; i < days.length; i++) gap = Math.max(gap, days[i] - days[i - 1]);
      const months = Math.round((days[days.length - 1] - days[0]) / 30.4) + 1;
      return `${days.length} days of writing over ${months} months; the longest quiet spell lasted ${gap} days.`;
    }
    case "returns": {
      const top = [...notes].sort((a, b) => b.in.length - a.in.length)[0];
      if (!top || !top.in.length) return "No note is linked to yet.";
      return `“${top.title}” is the note you come back to most: ${top.in.length} notes link to it.`;
    }
    case "lifelines": {
      if (!dated.length || model.dateMax == null) return "None of your notes is dated yet.";
      const last = new Map<number, number>();
      for (const n of dated) last.set(grouping.of[n.i], Math.max(last.get(grouping.of[n.i]) ?? 0, n.date!));
      const going = [...last.values()].filter((t) => model.dateMax! - t < 60 * DAY).length;
      return `${going} of ${last.size} areas are still going: something was written in them in the last two months.`;
    }
    case "balance": {
      let own = 0;
      let src = 0;
      for (const n of notes) {
        if (n.isIndex) continue;
        if (OWN_TYPES.has(n.type)) own += n.words;
        else src += n.words;
      }
      return `${Math.round((own / Math.max(1, own + src)) * 100)}% of the words are your own; the rest summarise sources and people.`;
    }
  }
}

/* ── axes ─────────────────────────────────────────────────────────────────── */

export interface Axis {
  labels: string[];
  of: Int32Array;
}

/* ── axes ─────────────────────────────────────────────────────────────────── */

export function axisOf(model: Model, key: AxisKey): Axis {
  const n = model.notes.length;
  const of = new Int32Array(n);
  const withUndated = (labels: string[], idx: (t: number) => number): Axis => {
    let undated = false;
    model.notes.forEach((x, i) => {
      if (x.date == null) {
        of[i] = -1;
        undated = true;
      } else of[i] = idx(x.date);
    });
    if (undated) {
      const u = labels.length;
      for (let i = 0; i < n; i++) if (of[i] < 0) of[i] = u;
      labels = [...labels, "Undated"];
    }
    return { labels, of };
  };
  const fromGrouping = (g: Grouping): Axis => ({ labels: g.list.map((x) => x.label), of: g.of });
  const buckets = (edges: number[], names: string[], v: (i: number) => number): Axis => {
    for (let i = 0; i < n; i++) {
      const x = v(i);
      let b = 0;
      while (b < edges.length && x >= edges[b]) b++;
      of[i] = b;
    }
    return { labels: names, of };
  };
  switch (key) {
    case "month": {
      const months = monthRange(model);
      const at = new Map(months.map((m, k) => [m, k]));
      return withUndated(months.map((m) => monthLabel(m)), (t) => at.get(monthKey(t)) ?? 0);
    }
    case "year": {
      const ys = [...new Set(model.notes.filter((x) => x.date != null).map((x) => new Date(x.date!).getUTCFullYear()))].sort();
      const at = new Map(ys.map((y, k) => [y, k]));
      return withUndated(ys.map(String), (t) => at.get(new Date(t).getUTCFullYear()) ?? 0);
    }
    case "weekday":
      return withUndated(WEEKDAYS.slice(), weekdayOf);
    case "folder":
      return fromGrouping(model.groups.folder);
    case "domain":
      return fromGrouping(model.groups.domain);
    case "type":
      return fromGrouping(model.groups.type);
    case "links":
      return buckets([1, 3, 6, 11], ["No links", "1–2", "3–5", "6–10", "11 or more"], (i) => model.notes[i].in.length + model.notes[i].out.length);
    case "length":
      return buckets([100, 300, 1000], ["Under 100 words", "100–300", "300–1,000", "Over 1,000"], (i) => model.notes[i].words);
    case "none":
      return { labels: ["All"], of };
  }
}
