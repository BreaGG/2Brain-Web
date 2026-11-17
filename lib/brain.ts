import type { ParsedPage } from "./types";
import { buildSlugMap } from "./parser";

/* ───────────────────────────────────────────────────────────────────────────
 * The brain model: everything the interface draws is derived from here.
 *   notes   = wiki pages (points in the brain)
 *   record  = every passage of every page (points down the spine and body)
 *   links   = [[wiki links]] between notes
 * ─────────────────────────────────────────────────────────────────────────── */

export type GroupBy = "folder" | "domain" | "type";

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  folder: "Folder",
  domain: "Domain",
  type: "Type",
};

export interface Note {
  i: number;
  id: string; // slug
  title: string;
  type: string;
  folder: string;
  domain: string;
  domains: string[];
  date: number | null; // ms
  words: number;
  excerpt: string;
  out: number[]; // note indices this note links to
  in: number[]; // note indices linking here
  ghosts: string[]; // unresolved link targets
  isIndex: boolean;
}

export interface GroupInfo {
  key: string;
  label: string;
  notes: number;
  record: number; // passages
  words: number;
  unsorted: boolean;
}

export interface Grouping {
  list: GroupInfo[];
  of: Int32Array; // note index → group index
}

export interface Model {
  pages: ParsedPage[];
  notes: Note[];
  bySlug: Map<string, number>;
  links: [number, number][];
  ghostSlugs: { slug: string; from: number[] }[];
  groups: Record<GroupBy, Grouping>;
  totalWords: number;
  passages: number; // real passage count (≈ 12 words each)
  dateMin: number | null;
  dateMax: number | null;
}

const TYPE_LABEL: Record<string, string> = {
  concept: "Concepts",
  person: "People",
  "source-summary": "Sources",
  source: "Sources",
  synthesis: "Syntheses",
  meta: "Indexes",
  page: "Pages",
};

export const PASSAGE_WORDS = 12;

export function capital(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function typeLabel(t: string) {
  return TYPE_LABEL[t] ?? capital(t.replace(/-/g, " "));
}

export function singularType(t: string) {
  if (t === "source-summary") return "Source";
  if (t === "page") return "Page";
  if (t === "meta") return "Index";
  return capital(t.replace(/-/g, " "));
}

export function parseDate(s: string): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Markdown → plain text for one-line excerpts. */
export function plain(s: string) {
  return s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => (b ?? a.split("/").pop() ?? a).replace(/-/g, " "))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(s: string) {
  const m = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function buildModel(pages: ParsedPage[]): Model {
  const slugMap = buildSlugMap(pages);
  const bySlug = new Map<string, number>();
  pages.forEach((p, i) => bySlug.set(p.slug, i));

  const notes: Note[] = pages.map((p, i) => {
    const parts = p.slug.split("/");
    const folder = parts.length > 1 ? parts[0] : "root";
    return {
      i,
      id: p.slug,
      title: p.title,
      type: p.type || "page",
      folder,
      domain: p.domain[0] ?? "uncategorized",
      domains: p.domain,
      date: parseDate(p.lastUpdated),
      words: countWords(p.bodyContent),
      excerpt: plain(p.excerpt),
      out: [],
      in: [],
      ghosts: [],
      isIndex: parts[parts.length - 1] === "index",
    };
  });

  const links: [number, number][] = [];
  const seen = new Set<string>();
  const ghostMap = new Map<string, Set<number>>();
  pages.forEach((p, a) => {
    for (const l of p.links) {
      const target =
        slugMap.get(l.slug) ?? (l.folder ? slugMap.get(`${l.folder}/${l.slug}`) : undefined);
      if (!target) {
        const key = l.folder ? `${l.folder}/${l.slug}` : l.slug;
        if (!ghostMap.has(key)) ghostMap.set(key, new Set());
        ghostMap.get(key)!.add(a);
        if (!notes[a].ghosts.includes(key)) notes[a].ghosts.push(key);
        continue;
      }
      const b = bySlug.get(target)!;
      if (b === a) continue;
      const k = `${a}>${b}`;
      if (seen.has(k)) continue;
      seen.add(k);
      links.push([a, b]);
      notes[a].out.push(b);
      notes[b].in.push(a);
    }
  });

  const ghostSlugs = [...ghostMap.entries()]
    .map(([slug, from]) => ({ slug, from: [...from] }))
    .sort((x, y) => y.from.length - x.from.length || x.slug.localeCompare(y.slug));

  const totalWords = notes.reduce((s, n) => s + n.words, 0);
  const passages = notes.reduce((s, n) => s + Math.max(1, Math.ceil(n.words / PASSAGE_WORDS)), 0);

  const groups = {
    folder: makeGrouping(notes, (n) => n.folder, (k) => (k === "root" ? "Root" : capital(k.replace(/-/g, " "))), (k) => k === "root"),
    domain: makeGrouping(notes, (n) => n.domain, (k) => (k === "uncategorized" ? "Unsorted" : capital(k)), (k) => k === "uncategorized"),
    type: makeGrouping(notes, (n) => n.type, typeLabel, (k) => k === "page"),
  };

  let dateMin: number | null = null;
  let dateMax: number | null = null;
  for (const n of notes) {
    if (n.date == null) continue;
    if (dateMin == null || n.date < dateMin) dateMin = n.date;
    if (dateMax == null || n.date > dateMax) dateMax = n.date;
  }

  return { pages, notes, bySlug, links, ghostSlugs, groups, totalWords, passages, dateMin, dateMax };
}

function makeGrouping(
  notes: Note[],
  keyOf: (n: Note) => string,
  labelOf: (k: string) => string,
  isUnsorted: (k: string) => boolean,
): Grouping {
  const acc = new Map<string, GroupInfo>();
  for (const n of notes) {
    const k = keyOf(n);
    if (!acc.has(k)) acc.set(k, { key: k, label: labelOf(k), notes: 0, record: 0, words: 0, unsorted: isUnsorted(k) });
    const g = acc.get(k)!;
    g.notes++;
    g.words += n.words;
    g.record += Math.max(1, Math.ceil(n.words / PASSAGE_WORDS));
  }
  const list = [...acc.values()].sort(
    (a, b) => Number(a.unsorted) - Number(b.unsorted) || b.notes - a.notes || b.words - a.words || a.label.localeCompare(b.label),
  );
  const idx = new Map(list.map((g, i) => [g.key, i]));
  const of = new Int32Array(notes.length);
  notes.forEach((n, i) => (of[i] = idx.get(keyOf(n))!));
  return { list, of };
}

/* ── Date helpers ─────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(t: number | null) {
  if (t == null) return "";
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function fmtDate(t: number | null) {
  if (t == null) return "Undated";
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtMonth(t: number) {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthKey(t: number) {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function monthStart(key: number) {
  return Date.UTC(Math.floor(key / 12), key % 12, 1);
}

export function monthLabel(key: number, withYear = true) {
  return withYear ? `${MONTHS[key % 12]} ${Math.floor(key / 12)}` : MONTHS[key % 12];
}

/** Months spanned by the dated notes, inclusive. */
export function monthRange(model: Model): number[] {
  if (model.dateMin == null || model.dateMax == null) return [];
  const a = monthKey(model.dateMin);
  const b = monthKey(model.dateMax);
  const out: number[] = [];
  for (let k = a; k <= b; k++) out.push(k);
  return out;
}

export function fmtInt(n: number) {
  return n.toLocaleString("en-GB");
}
