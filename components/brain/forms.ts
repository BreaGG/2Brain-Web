import type { Grouping, Model } from "@/lib/brain";
import { monthLabel, monthRange, monthKey } from "@/lib/brain";
import { squarify } from "@/lib/squarify";
import { OWN_TYPES, WEEKDAYS, weekdayOf, type AnswerKey, type AxisKey, type FormKey } from "@/lib/table";
import { FRAME_CY, rng, type Anatomy, type Layout, type LayoutLabel } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * The table builder's forms. Each one decides where every note and every
 * point of the record goes; the scene flies the points there.
 * Charts are drawn in a W × H box centred on the figure's own centre.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface FormSpec {
  across: AxisKey;
  down: AxisKey;
  form: FormKey;
  answer: AnswerKey | "";
  counts: boolean;
  /** The grouping the colours follow (folder, domain or type). */
  grouping: Grouping;
}

const W = 10;
const H = 6;
const CY = FRAME_CY;
const X0 = -W / 2;
const Y0 = CY - H / 2;
const DAY = 86400000;

type Vec = [number, number, number];
type Place = (note: number, isNote: boolean) => Vec;

interface Axis {
  labels: string[];
  of: Int32Array;
}

/* ── axes ─────────────────────────────────────────────────────────────────── */

function axisOf(model: Model, key: AxisKey): Axis {
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

/* ── helpers ──────────────────────────────────────────────────────────────── */

function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function smooth(v: number[], sigma: number) {
  if (sigma <= 0) return v.slice();
  const k = Math.ceil(sigma * 3);
  return v.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = -k; j <= k; j++) {
      const x = i + j;
      if (x < 0 || x >= v.length) continue;
      const g = Math.exp(-(j * j) / (2 * sigma * sigma));
      s += v[x] * g;
      w += g;
    }
    return w ? s / w : 0;
  });
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const step = (count: number, max: number) => Math.max(1, Math.ceil(count / max));

class Builder {
  labels: LayoutLabel[] = [];
  seg: number[] = [];
  segGroup: number[] = [];
  label(text: string, x: number, y: number, kind: LayoutLabel["kind"], z = 0, group?: number) {
    this.labels.push({ text, pos: [x, y, z], kind, group });
  }
  line(a: Vec, b: Vec, group = -1) {
    this.seg.push(...a, ...b);
    this.segGroup.push(group);
  }
  rect(x0: number, y0: number, x1: number, y1: number, group = -1) {
    this.line([x0, y0, 0], [x1, y0, 0], group);
    this.line([x1, y0, 0], [x1, y1, 0], group);
    this.line([x1, y1, 0], [x0, y1, 0], group);
    this.line([x0, y1, 0], [x0, y0, 0], group);
  }
}

/* ── the time axis shared by the answers ──────────────────────────────────── */

class Time {
  months: number[];
  at: Map<number, number>;
  M: number;
  constructor(model: Model) {
    this.months = monthRange(model);
    this.at = new Map(this.months.map((m, k) => [m, k]));
    this.M = Math.max(1, this.months.length);
  }
  /** Fractional month index of a date. */
  idx(t: number) {
    const d = new Date(t);
    return (this.at.get(monthKey(t)) ?? 0) + (d.getUTCDate() - 1) / 31;
  }
  x(t: number, r: () => number, spread: number) {
    const f = Math.min(this.M - 0.001, Math.max(0, this.idx(t) + (r() - 0.5) * spread));
    return X0 + (f / this.M) * W;
  }
  /** Value of a per-month series at an x position, interpolated. */
  at_(series: number[], x: number) {
    const f = ((x - X0) / W) * this.M - 0.5;
    const a = Math.max(0, Math.min(series.length - 1, Math.floor(f)));
    const b = Math.min(series.length - 1, a + 1);
    return lerp(series[a] ?? 0, series[b] ?? 0, Math.max(0, Math.min(1, f - a)));
  }
  ticks(b: Builder, y: number, max = 8) {
    const s = step(this.M, max);
    for (let m = 0; m < this.months.length; m += s) b.label(monthLabel(this.months[m]), X0 + (m / this.M) * W, y, "axis");
  }
}

/* ── build ────────────────────────────────────────────────────────────────── */

export function buildForm(model: Model, anat: Anatomy, spec: FormSpec): Layout {
  const r = rng(7 + model.notes.length * 31 + spec.form.length * 7 + (spec.answer ? spec.answer.length * 131 : 0));
  const n = anat.n;
  const recPer = new Float32Array(n);
  for (let k = 0; k < anat.recCount; k++) recPer[anat.recNote[k]]++;
  const weight = (i: number) => recPer[i] + 1;
  const b = new Builder();
  let flat = true;
  let place: Place;

  const undatedPile = (cx: number, cy: number): Place | null => {
    if (!model.notes.some((x) => x.date == null)) return null;
    b.label("Undated", cx, cy - 0.5, "axis");
    return () => [cx + gauss(r) * 0.16, cy + gauss(r) * 0.16, gauss(r) * 0.08];
  };

  const key = spec.answer ? `answer:${spec.answer}:${spec.grouping.list.length}` : `form:${spec.form}:${spec.across}:${spec.down}:${spec.counts}`;

  if (spec.answer) {
    place = answerPlace(model, spec, r, b, weight, undatedPile);
  } else if (spec.form === "folders") {
    place = foldersPlace(model, spec, r, b, weight);
  } else {
    const A = axisOf(model, spec.across);
    const D = axisOf(model, spec.down);
    const na = A.labels.length;
    const nd = D.labels.length;
    const cellOf = (i: number) => A.of[i] * nd + D.of[i];
    const cnt = new Float32Array(na * nd);
    const notesIn = new Int32Array(na * nd);
    for (let i = 0; i < n; i++) {
      cnt[cellOf(i)] += weight(i);
      notesIn[cellOf(i)]++;
    }
    const max = Math.max(1, ...cnt);
    const countLabel = (c: number, x: number, y: number) => {
      if (spec.counts && notesIn[c]) b.label(String(notesIn[c]), x, y, "count");
    };

    switch (spec.form) {
      case "grid":
      case "clusters": {
        flat = spec.form === "grid";
        const cs = Math.min(W / na, H / nd);
        const left = (-cs * na) / 2;
        const top = CY + (cs * nd) / 2;
        const cx = (a: number) => left + (a + 0.5) * cs;
        const cy = (d: number) => top - (d + 0.5) * cs;
        place = (i) => {
          const c = cellOf(i);
          const a = Math.floor(c / nd);
          const d = c % nd;
          if (spec.form === "grid") {
            const s = Math.max(cs * 0.05, cs * 0.46 * Math.sqrt(cnt[c] / max));
            return [cx(a) + (r() - 0.5) * 2 * s, cy(d) + (r() - 0.5) * 2 * s, (r() - 0.5) * 0.08];
          }
          const s = Math.max(cs * 0.04, cs * 0.2 * Math.cbrt(cnt[c] / max));
          return [cx(a) + gauss(r) * s, cy(d) + gauss(r) * s, gauss(r) * s];
        };
        const sa = step(na, 14);
        for (let a = 0; a < na; a += sa) b.label(A.labels[a], cx(a) - cs * 0.4, top - nd * cs - 0.18, "axis");
        const sd = step(nd, 18);
        for (let d = 0; d < nd; d += sd) b.label(D.labels[d], left - 0.12, cy(d), "axisL");
        for (let c = 0; c < na * nd; c++) countLabel(c, cx(Math.floor(c / nd)) - cs * 0.42, cy(c % nd) + cs * 0.38);
        if (spec.form === "grid") for (let d = 0; d <= nd; d++) b.line([left, top - d * cs, 0], [left + na * cs, top - d * cs, 0]);
        break;
      }
      case "ribbon": {
        const csx = W / na;
        const rh = H / nd;
        const top = CY + H / 2;
        const th = (a: number, d: number) => (a < 0 || a >= na ? 0 : (rh * 0.92 * cnt[a * nd + d]) / max);
        place = (i) => {
          const c = cellOf(i);
          const a = Math.floor(c / nd);
          const d = c % nd;
          const f = r();
          const nb = f < 0.5 ? a - 1 : a + 1;
          const k = Math.abs(f - 0.5);
          const t = th(a, d) * (1 - k) + th(nb, d) * k;
          return [X0 + (a + f) * csx, top - (d + 0.5) * rh + (r() - 0.5) * t, (r() - 0.5) * 0.08];
        };
        const sa = step(na, 10);
        for (let a = 0; a < na; a += sa) b.label(A.labels[a], X0 + a * csx, Y0 - 0.2, "axis");
        const sd = step(nd, 18);
        for (let d = 0; d < nd; d += sd) b.label(D.labels[d], X0 - 0.15, top - (d + 0.5) * rh, "axisL");
        break;
      }
      case "wheel": {
        const R0 = 0.8;
        const R = 3.2;
        const rw = (R - R0) / nd;
        const sector = (Math.PI * 2) / na;
        place = (i) => {
          const c = cellOf(i);
          const a = Math.floor(c / nd);
          const d = c % nd;
          const ang = Math.PI / 2 - (a + 0.05 + r() * 0.9) * sector;
          const rr = R0 + (d + 0.08 + r() * 0.84) * rw;
          return [rr * Math.cos(ang), CY + rr * Math.sin(ang), (r() - 0.5) * 0.08];
        };
        const sa = step(na, 16);
        for (let a = 0; a < na; a += sa) {
          const ang = Math.PI / 2 - (a + 0.5) * sector;
          b.label(A.labels[a], (R + 0.3) * Math.cos(ang), CY + (R + 0.3) * Math.sin(ang), Math.cos(ang) < -0.2 ? "axisL" : "axis");
        }
        const sd = step(nd, 10);
        for (let d = 0; d < nd; d += sd) b.label(D.labels[d], -0.12, CY + R0 + (d + 0.5) * rw, "axisL");
        break;
      }
      case "spheres": {
        flat = false;
        const cols = na <= 6 ? na : Math.ceil(Math.sqrt(na * 1.8));
        const rows = Math.ceil(na / cols);
        const cs = Math.min(W / cols, H / rows);
        const colCnt = new Float32Array(na);
        for (let c = 0; c < na * nd; c++) colCnt[Math.floor(c / nd)] += cnt[c];
        const cmax = Math.max(1, ...colCnt);
        const centre = (a: number): Vec => [((a % cols) - (cols - 1) / 2) * cs, CY + ((rows - 1) / 2 - Math.floor(a / cols)) * cs, 0];
        const rad = (a: number) => Math.max(cs * 0.08, cs * 0.42 * Math.cbrt(colCnt[a] / cmax));
        place = (i) => {
          const c = cellOf(i);
          const a = Math.floor(c / nd);
          const d = c % nd;
          const [x, y, z] = centre(a);
          const rr = rad(a) * (0.2 + (0.8 * (d + 0.15 + r() * 0.7)) / nd);
          const u = r() * 2 - 1;
          const t = r() * Math.PI * 2;
          const s = Math.sqrt(1 - u * u);
          return [x + rr * s * Math.cos(t), y + rr * u, z + rr * s * Math.sin(t)];
        };
        for (let a = 0; a < na; a++) b.label(A.labels[a], centre(a)[0] - cs * 0.3, centre(a)[1] - cs * 0.47, "axis");
        break;
      }
      case "shells": {
        flat = false;
        const R0 = 0.35;
        const R = 3.1;
        place = (i) => {
          const c = cellOf(i);
          const a = Math.floor(c / nd);
          const d = c % nd;
          const rr = R0 + ((a + 0.15 + r() * 0.6) / na) * (R - R0);
          const phi = ((d + 0.1 + r() * 0.8) / nd) * Math.PI;
          const t = r() * Math.PI * 2;
          return [rr * Math.sin(phi) * Math.cos(t), CY + rr * Math.cos(phi), rr * Math.sin(phi) * Math.sin(t)];
        };
        const sa = step(na, 8);
        for (let a = 0; a < na; a += sa) b.label(A.labels[a], R0 + ((a + 0.45) / na) * (R - R0), CY, "axis");
        break;
      }
      default:
        place = () => [0, CY, 0];
    }
  }

  /* fill */
  const noteLayout = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) noteLayout.set(place(i, true), i * 3);
  const recLayout = new Float32Array(anat.recCount * 3);
  for (let k = 0; k < anat.recCount; k++) recLayout.set(place(anat.recNote[k], false), k * 3);

  /* frame: everything drawn plus its labels */
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (let i = 0; i < n; i++) grow(noteLayout[i * 3], noteLayout[i * 3 + 1]);
  for (let k = 0; k < anat.recCount; k += 7) grow(recLayout[k * 3], recLayout[k * 3 + 1]);
  for (const l of b.labels) {
    const w = Math.min(2.4, l.text.length * 0.075);
    grow(l.kind === "axisL" ? l.pos[0] - w : l.pos[0], l.pos[1]);
    grow(l.kind === "axisL" ? l.pos[0] : l.pos[0] + w, l.pos[1]);
  }
  const mx = (x1 - x0) * 0.06 + 0.3;
  const my = (y1 - y0) * 0.06 + 0.3;

  return {
    key,
    noteLayout,
    recLayout,
    labels: b.labels,
    frame: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + mx * 2, h: y1 - y0 + my * 2 },
    flat,
    scaffold: b.seg.length ? { pos: new Float32Array(b.seg), group: new Int32Array(b.segGroup) } : null,
  };
}

/* ── folders: a treemap of folders, every note a box inside its folder ──── */

function foldersPlace(model: Model, spec: FormSpec, r: () => number, b: Builder, weight: (i: number) => number): Place {
  const fg = model.groups.folder;
  const members: number[][] = fg.list.map(() => []);
  model.notes.forEach((_, i) => members[fg.of[i]].push(i));
  const fw = members.map((m) => m.reduce((s, i) => s + weight(i), 0));
  const boxes = squarify(fw, W, H);
  const noteBox: number[][] = [];
  const top = CY + H / 2;
  for (const fb of boxes) {
    const x0 = X0 + fb.x;
    const y0 = top - fb.y;
    const pad = Math.min(0.06, fb.w * 0.05, fb.h * 0.05);
    const head = Math.min(0.24, fb.h * 0.25);
    b.rect(x0 + 0.01, y0 - 0.01, x0 + fb.w - 0.01, y0 - fb.h + 0.01);
    const g = fg.list[fb.i];
    b.label(spec.counts ? `${g.label} · ${g.notes}` : g.label, x0 + 0.04, y0 - 0.1, "box");
    const ms = members[fb.i];
    const inner = squarify(
      ms.map((i) => weight(i)),
      Math.max(0.01, fb.w - pad * 2),
      Math.max(0.01, fb.h - pad - head),
    );
    for (const nb of inner) {
      noteBox[ms[nb.i]] = [x0 + pad + nb.x, y0 - head - nb.y, nb.w, nb.h];
    }
  }
  return (i, isNote) => {
    const bx = noteBox[i];
    if (!bx) return [0, CY, 0];
    const [x, y, w, h] = bx;
    if (isNote) return [x + w / 2, y - h / 2, 0.02];
    const ix = Math.min(0.03, w * 0.12);
    const iy = Math.min(0.03, h * 0.12);
    return [x + ix + r() * (w - ix * 2), y - iy - r() * (h - iy * 2), (r() - 0.5) * 0.05];
  };
}

/* ── answers ──────────────────────────────────────────────────────────────── */

function answerPlace(
  model: Model,
  spec: FormSpec,
  r: () => number,
  b: Builder,
  weight: (i: number) => number,
  undatedPile: (cx: number, cy: number) => Place | null,
): Place {
  const T = new Time(model);
  const g = spec.grouping;
  const G = Math.max(1, g.list.length);
  const notes = model.notes;
  const series = (pick: (i: number) => number, sigma: number) => {
    const s: number[][] = Array.from({ length: G }, () => new Array(T.M).fill(0));
    notes.forEach((x, i) => {
      if (x.date == null) return;
      const m = T.at.get(monthKey(x.date)) ?? 0;
      s[pick(i)][m] += weight(i);
    });
    return s.map((v) => smooth(v, sigma));
  };

  switch (spec.answer) {
    case "stream": {
      const s = series((i) => g.of[i], 0.9);
      const tot = new Array(T.M).fill(0).map((_, m) => s.reduce((a, v) => a + v[m], 0));
      const scale = (H * 0.95) / Math.max(1e-6, ...tot);
      const base = s.map((_, gi) => tot.map((t, m) => CY - (t * scale) / 2 + s.slice(0, gi).reduce((a, v) => a + v[m], 0) * scale));
      const pile = undatedPile(X0 + W + 0.6, CY);
      T.ticks(b, Y0 - 0.2);
      s.forEach((v, gi) => {
        const m = v.indexOf(Math.max(...v));
        if (v[m] * scale > 0.28) b.label(g.list[gi].label, X0 + ((m + 0.5) / T.M) * W, base[gi][m] + (v[m] * scale) / 2, "title", 0, gi);
      });
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return pile ? pile(i, isNote) : [0, CY, 0];
        const gi = g.of[i];
        const px = T.x(x.date, r, isNote ? 0 : 0.9);
        const lo = T.at_(base[gi], px);
        const th = T.at_(s[gi], px) * scale;
        return [px, lo + (isNote ? 0.5 : r()) * th, (r() - 0.5) * 0.06];
      };
    }
    case "waves": {
      const s = series((i) => g.of[i], 1.1);
      const scale = (H * 0.9) / Math.max(1e-6, ...s.flat());
      const zOf = (gi: number) => (gi - (G - 1) / 2) * 0.22;
      const pile = undatedPile(X0 + W + 0.6, Y0 + 0.3);
      T.ticks(b, Y0 - 0.2);
      s.forEach((v, gi) => {
        const steps = T.M * 4;
        let prev: [number, number, number] | null = null;
        for (let k = 0; k <= steps; k++) {
          const x = X0 + (k / steps) * W;
          const p: [number, number, number] = [x, Y0 + T.at_(v, x) * scale, zOf(gi)];
          if (prev) b.line(prev, p, gi);
          prev = p;
        }
        const m = v.indexOf(Math.max(...v));
        if (v[m] * scale > 0.2) b.label(g.list[gi].label, X0 + ((m + 0.5) / T.M) * W, Y0 + v[m] * scale + 0.15, "title", zOf(gi), gi);
      });
      b.line([X0, Y0, 0], [X0 + W, Y0, 0]);
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return pile ? pile(i, isNote) : [0, CY, 0];
        const gi = g.of[i];
        const px = T.x(x.date, r, isNote ? 0 : 0.9);
        const h = T.at_(s[gi], px) * scale;
        return [px, Y0 + h * (isNote ? 0.35 + r() * 0.5 : Math.sqrt(r())), zOf(gi) + (r() - 0.5) * 0.05];
      };
    }
    case "chord": {
      const R = 3;
      const gap = 0.06;
      const cnt = g.list.map((x) => x.notes);
      const span = Math.PI * 2 - gap * G;
      const total = Math.max(1, cnt.reduce((a, c) => a + c, 0));
      const start: number[] = [];
      let acc = Math.PI / 2;
      cnt.forEach((c, gi) => {
        start[gi] = acc;
        acc -= (c / total) * span + gap;
      });
      const slot = new Int32Array(notes.length);
      const seen = new Int32Array(G);
      const order = notes.map((_, i) => i).sort((a, c) => g.of[a] - g.of[c] || notes[c].in.length + notes[c].out.length - (notes[a].in.length + notes[a].out.length));
      for (const i of order) slot[i] = seen[g.of[i]]++;
      const angOf = (i: number, j: number) => {
        const gi = g.of[i];
        const w = (cnt[gi] / total) * span;
        return start[gi] - ((slot[i] + 0.5 + j) / Math.max(1, cnt[gi])) * w;
      };
      g.list.forEach((x, gi) => {
        const mid = start[gi] - ((cnt[gi] / total) * span) / 2;
        const rr = R + 0.75;
        b.label(x.label, rr * Math.cos(mid), CY + rr * Math.sin(mid), Math.cos(mid) < -0.2 ? "axisL" : "axis", 0, gi);
      });
      return (i, isNote) => {
        if (isNote) {
          const a = angOf(i, 0);
          return [R * Math.cos(a), CY + R * Math.sin(a), 0];
        }
        const a = angOf(i, (r() - 0.5) * 0.9);
        const rr = R + 0.08 + r() * 0.34;
        return [rr * Math.cos(a), CY + rr * Math.sin(a), (r() - 0.5) * 0.05];
      };
    }
    case "clock": {
      const ring = (w: number) => 0.9 + w * 0.34;
      for (let m = 0; m < 12; m++) {
        const a = Math.PI / 2 - ((m + 0.5) / 12) * Math.PI * 2;
        b.label(monthLabel(m, false), 3.55 * Math.cos(a), CY + 3.55 * Math.sin(a), Math.cos(a) < -0.2 ? "axisL" : "axis");
      }
      WEEKDAYS.forEach((w, k) => b.label(w, -0.08, CY + ring(k) + 0.12, "axisL"));
      for (let k = 0; k <= 7; k++) {
        const rr = ring(k) - 0.02;
        const steps = 96;
        for (let s = 0; s < steps; s++) {
          const a0 = (s / steps) * Math.PI * 2;
          const a1 = ((s + 1) / steps) * Math.PI * 2;
          if (k % 7 === 0) b.line([rr * Math.cos(a0), CY + rr * Math.sin(a0), 0], [rr * Math.cos(a1), CY + rr * Math.sin(a1), 0]);
        }
      }
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return [gauss(r) * 0.22, CY + gauss(r) * 0.22, 0];
        const d = new Date(x.date);
        const doy = (x.date - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY;
        const a = Math.PI / 2 - ((doy + (isNote ? 0.5 : r() * 2)) / 366) * Math.PI * 2;
        const rr = ring(weekdayOf(x.date)) + (isNote ? 0.15 : 0.03 + r() * 0.26);
        return [rr * Math.cos(a), CY + rr * Math.sin(a), (r() - 0.5) * 0.05];
      };
    }
    case "calendar": {
      const t0 = model.dateMin ?? 0;
      const t1 = model.dateMax ?? t0 + DAY;
      const spanT = Math.max(DAY, t1 - t0 + DAY);
      const gapA = 0.22;
      const ang = (t: number) => Math.PI / 2 - gapA / 2 - ((t - t0) / spanT) * (Math.PI * 2 - gapA);
      const R0 = 1.05;
      const R1 = 3.2;
      const rw = (R1 - R0) / G;
      const s = step(T.M, 12);
      for (let m = 0; m < T.months.length; m += s) {
        const a = ang(Date.UTC(Math.floor(T.months[m] / 12), T.months[m] % 12, 1));
        b.label(monthLabel(T.months[m]), (R1 + 0.3) * Math.cos(a), CY + (R1 + 0.3) * Math.sin(a), Math.cos(a) < -0.2 ? "axisL" : "axis");
        b.line([R0 * 0.96 * Math.cos(a), CY + R0 * 0.96 * Math.sin(a), 0], [R1 * 1.02 * Math.cos(a), CY + R1 * 1.02 * Math.sin(a), 0]);
      }
      g.list.forEach((x, gi) => b.label(x.label, -0.1, CY + R0 + (gi + 0.5) * rw, "axisL", 0, gi));
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return [gauss(r) * 0.25, CY + gauss(r) * 0.25, 0];
        const a = ang(x.date + (isNote ? 0.5 : r() * 2) * DAY);
        const rr = R0 + (g.of[i] + (isNote ? 0.5 : 0.1 + r() * 0.8)) * rw;
        return [rr * Math.cos(a), CY + rr * Math.sin(a), (r() - 0.5) * 0.05];
      };
    }
    case "returns": {
      const maxIn = Math.max(1, ...notes.map((x) => x.in.length));
      const u = (H * 0.85) / maxIn;
      const pile = undatedPile(X0 + W + 0.6, Y0 + 0.3);
      T.ticks(b, Y0 - 0.2);
      b.line([X0, Y0, 0], [X0 + W, Y0, 0]);
      b.line([X0, Y0, 0], [X0, Y0 + maxIn * u, 0]);
      b.label(`${maxIn} links in`, X0 - 0.12, Y0 + maxIn * u, "axisL");
      b.label("0", X0 - 0.12, Y0, "axisL");
      const xs = new Map<number, number>();
      [...notes]
        .filter((x) => x.date != null && x.in.length > 0)
        .sort((a, c) => c.in.length - a.in.length)
        .slice(0, 8)
        .forEach((x) => {
          const px = T.x(x.date!, () => 0.5, 0);
          xs.set(x.i, px);
          b.label(x.title, px, Y0 + (x.in.length + 0.4) * u + 0.12, "title", 0, g.of[x.i]);
        });
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return pile ? pile(i, isNote) : [0, CY, 0];
        const px = xs.get(i) ?? T.x(x.date, () => 0.5, 0);
        const h = (x.in.length + 0.4) * u;
        if (isNote) return [px, Y0 + h, 0];
        return [px + (r() - 0.5) * 0.08, Y0 + r() * h, (r() - 0.5) * 0.06];
      };
    }
    case "lifelines": {
      const rowH = Math.min(1.1, H / G);
      const top = CY + (G * rowH) / 2;
      const span = g.list.map(() => [Infinity, -Infinity]);
      notes.forEach((x, i) => {
        if (x.date == null) return;
        const s = span[g.of[i]];
        s[0] = Math.min(s[0], x.date);
        s[1] = Math.max(s[1], x.date);
      });
      const pile = undatedPile(X0 + W + 0.6, Y0 + 0.2);
      T.ticks(b, top - G * rowH - 0.25);
      g.list.forEach((x, gi) => {
        const y = top - (gi + 0.5) * rowH;
        b.label(x.label, X0 - 0.15, y, "axisL", 0, gi);
        const [a, c] = span[gi];
        if (!Number.isFinite(a)) return;
        const xa = T.x(a, () => 0.5, 0);
        const xc = T.x(c, () => 0.5, 0);
        b.line([xa, y, 0], [xc, y, 0], gi);
        const going = model.dateMax != null && model.dateMax - c < 60 * DAY;
        const months = Math.max(1, Math.round((c - a) / (30.4 * DAY)));
        b.label(going ? "still going" : `${months} month${months === 1 ? "" : "s"}`, xc + 0.12, y, "axis", 0, gi);
      });
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return pile ? pile(i, isNote) : [0, CY, 0];
        const y = top - (g.of[i] + 0.5) * rowH;
        return [T.x(x.date, r, isNote ? 0 : 0.5), y + (isNote ? 0 : gauss(r) * rowH * 0.09), (r() - 0.5) * 0.05];
      };
    }
    case "balance": {
      const s = series((i) => (OWN_TYPES.has(notes[i].type) ? 0 : 1), 0.8);
      const scale = (H * 0.45) / Math.max(1e-6, ...s[0], ...(s[1] ?? [0]));
      const pile = undatedPile(X0 + W + 0.6, CY);
      T.ticks(b, Y0 - 0.2);
      b.line([X0, CY, 0], [X0 + W, CY, 0]);
      b.label("Your own thinking", X0, CY + H * 0.47, "title");
      b.label("From sources and people", X0, CY - H * 0.47, "title");
      return (i, isNote) => {
        const x = notes[i];
        if (x.date == null) return pile ? pile(i, isNote) : [0, CY, 0];
        const own = OWN_TYPES.has(x.type);
        const px = T.x(x.date, r, isNote ? 0 : 0.9);
        const h = T.at_(s[own ? 0 : 1] ?? [], px) * scale;
        const y = (isNote ? 0.5 : Math.sqrt(r())) * h;
        return [px, own ? CY + y : CY - y, (r() - 0.5) * 0.06];
      };
    }
    default:
      return () => [0, CY, 0];
  }
}
