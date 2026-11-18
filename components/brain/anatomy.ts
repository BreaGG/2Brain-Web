import type { GroupBy, Model } from "@/lib/brain";
import type { CosmosExtras } from "./cosmos";

/* ───────────────────────────────────────────────────────────────────────────
 * Real anatomy. The points come from /anatomy/atlas.bin (Z-Anatomy and
 * BodyParts3D, CC BY-SA — see public/anatomy/ATTRIBUTION.md):
 *   brain  20,000 points on the cortex, limbic structures, cerebellum, brainstem
 *   body   25,211 points on the brainstem, cord, roots, cranial nerves and the
 *          nerve trunks of the whole body, each linked to the point before it
 * Units: the brain is about 1.3 wide; the body is at true proportion to it.
 *
 * 2Brain places its own data on these points:
 *   notes  → points on the cortex; each folder gets one contiguous patch
 *   record → every brain point (the brain's matter) and every body point; the
 *            body is handed out in the order the notes were written, growing
 *            from the brainstem down the cord and out along the nerves.
 * ─────────────────────────────────────────────────────────────────────────── */

export const KIND_DUST = 0;
export const KIND_NERVE = 1;
export const KIND_SPINE = 2;
export const KIND_STEM = 3;
export const KIND_MATTER = 4;
export const KIND_FACE = 5;

export const REGIONS = ["Prefrontal", "Frontal", "Parietal", "Occipital", "Temporal", "Limbic", "Cerebellum", "Brainstem"];

/** What the camera frames at first: the top of the brain to just above the navel. */
export const FRAME = { top: 0.95, bottom: -5.6, width: 5.4 };
export const FRAME_CY = (FRAME.top + FRAME.bottom) / 2;
export const BRAIN_C = { x: 0, y: -0.12, z: 0 };
const SPLIT = 0.22;

export interface Atlas {
  brainN: number;
  brainPos: Float32Array;
  brainRegion: Uint8Array;
  bodyN: number;
  bodyPos: Float32Array;
  bodyPart: Uint8Array;
  bodyPrev: Int32Array;
}

export interface Anatomy {
  n: number;
  notePos: Float32Array;
  noteSplit: Float32Array; // notes with the hemispheres pulled apart
  noteRegion: Uint8Array;
  recCount: number;
  recNote: Int32Array;
  recPos: Float32Array;
  recKind: Uint8Array;
  recOrder: Float32Array; // 0..1, the order points appear in
  recSplit: Float32Array; // x offset when split (brain matter only)
  fibres: Uint32Array; // pairs of record indices along the nerves
}

export type LabelKind = "axis" | "axisL" | "title" | "box" | "count";

export interface LayoutLabel {
  text: string;
  pos: [number, number, number];
  kind: LabelKind;
  group?: number;
  /** Cosmos: the galaxy the label orbits with. */
  gal?: number;
}

/** Where every note and every record point goes when Form is at Layout. */
export interface Layout {
  key: string;
  noteLayout: Float32Array;
  recLayout: Float32Array;
  labels: LayoutLabel[];
  /** The box the camera frames, or null for the figure's own frame. */
  frame: { cx: number; cy: number; w: number; h: number } | null;
  /** Flat charts stop turning and face the camera. */
  flat: boolean;
  /** Guide lines: pairs of points, each segment coloured by a group (-1 for white). */
  scaffold: { pos: Float32Array; group: Int32Array } | null;
  /** Cosmos: groups of points that turn on their own axis (per group: centre, axis, rad/s). */
  spin?: {
    centre: Float32Array;
    axis: Float32Array;
    speed: Float32Array;
    /** Per group: rad/s round `origin`, about the vertical. */
    orbit: Float32Array;
    origin: [number, number, number];
    noteGal: Int32Array;
    recGal: Int32Array;
  };
  /** Cosmos only: glows and filaments. */
  cosmos?: CosmosExtras;
}

/** @deprecated use Layout */
export type Grouped = Layout;

/* ── loading ──────────────────────────────────────────────────────────────── */

let atlasPromise: Promise<Atlas> | null = null;

export function loadAtlas(): Promise<Atlas> {
  if (!atlasPromise) {
    atlasPromise = fetch("/anatomy/atlas.bin")
      .then((r) => {
        if (!r.ok) throw new Error(`atlas ${r.status}`);
        return r.arrayBuffer();
      })
      .then(decodeAtlas)
      .catch((e) => {
        atlasPromise = null;
        throw e;
      });
  }
  return atlasPromise;
}

export function decodeAtlas(buf: ArrayBuffer): Atlas {
  const v = new DataView(buf);
  const magic = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (magic !== "2BAT") throw new Error("not an atlas file");
  const S = v.getUint16(6, true);
  const brainN = v.getUint32(8, true);
  const bodyN = v.getUint32(12, true);
  const brainPos = new Float32Array(brainN * 3);
  const brainRegion = new Uint8Array(brainN);
  let o = 16;
  for (let i = 0; i < brainN; i++, o += 8) {
    brainPos[i * 3] = v.getInt16(o, true) / S;
    brainPos[i * 3 + 1] = v.getInt16(o + 2, true) / S;
    brainPos[i * 3 + 2] = v.getInt16(o + 4, true) / S;
    brainRegion[i] = v.getUint8(o + 6);
  }
  const bodyPos = new Float32Array(bodyN * 3);
  const bodyPart = new Uint8Array(bodyN);
  const bodyPrev = new Int32Array(bodyN);
  for (let i = 0; i < bodyN; i++, o += 10) {
    bodyPos[i * 3] = v.getInt16(o, true) / S;
    bodyPos[i * 3 + 1] = v.getInt16(o + 2, true) / S;
    bodyPos[i * 3 + 2] = v.getInt16(o + 4, true) / S;
    bodyPart[i] = v.getUint8(o + 6);
    const p = v.getUint16(o + 8, true);
    bodyPrev[i] = p === 65535 ? -1 : p;
  }
  return { brainN, brainPos, brainRegion, bodyN, bodyPos, bodyPart, bodyPrev };
}

/* ── building ─────────────────────────────────────────────────────────────── */

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d2 = (P: Float32Array, a: number, Q: Float32Array, b: number) => {
  const x = P[a * 3] - Q[b * 3];
  const y = P[a * 3 + 1] - Q[b * 3 + 1];
  const z = P[a * 3 + 2] - Q[b * 3 + 2];
  return x * x + y * y + z * z;
};

export function buildAnatomy(model: Model, atlas: Atlas, opts: { small: boolean; newestFirst?: boolean }): Anatomy {
  const r = rng(4242 + model.notes.length);
  const n = model.notes.length;
  const BP = atlas.brainPos;

  /* 1. Cortex points that can hold a note (not deep limbic, not brainstem). */
  const cortex: number[] = [];
  for (let i = 0; i < atlas.brainN; i++) {
    const reg = atlas.brainRegion[i];
    if (reg !== 5 && reg !== 7) cortex.push(i);
  }
  const C = cortex.length;

  /* 2. One contiguous patch of cortex per folder, sized by its notes. */
  const fg = model.groups.folder;
  const G = Math.max(1, fg.list.length);
  const counts = fg.list.map((g) => g.notes);
  const quota = counts.map((c) => Math.max(1, Math.round((C * c) / Math.max(1, n))));
  const seeds = farthestPoints(BP, cortex, G, pickFront(BP, cortex));
  const patchOf = new Int32Array(atlas.brainN).fill(-1);
  const patches: number[][] = Array.from({ length: G }, () => []);
  {
    const order = seeds.map((s) => {
      const idx = cortex.slice();
      const dist = new Float32Array(atlas.brainN);
      for (const p of idx) dist[p] = d2(BP, p, BP, s);
      return idx.sort((a, b) => dist[a] - dist[b]);
    });
    const ptr = new Int32Array(G);
    let left = C;
    while (left > 0) {
      let g = -1;
      let best = Infinity;
      for (let k = 0; k < G; k++) {
        if (ptr[k] >= C) continue;
        const ratio = patches[k].length / quota[k];
        if (ratio < best) {
          best = ratio;
          g = k;
        }
      }
      if (g < 0) break;
      const list = order[g];
      while (ptr[g] < C && patchOf[list[ptr[g]]] !== -1) ptr[g]++;
      if (ptr[g] >= C) continue;
      const p = list[ptr[g]++];
      patchOf[p] = g;
      patches[g].push(p);
      left--;
    }
  }

  /* 3. Notes: spread over their folder's patch, hubs nearest its middle. */
  const notePos = new Float32Array(n * 3);
  const noteRegion = new Uint8Array(n);
  const notesOf: number[][] = Array.from({ length: G }, () => []);
  for (let i = 0; i < n; i++) notesOf[fg.of[i] % G].push(i);
  for (let g = 0; g < G; g++) {
    const members = notesOf[g].sort((a, b) => model.notes[b].in.length + model.notes[b].out.length - (model.notes[a].in.length + model.notes[a].out.length));
    if (!members.length) continue;
    const patch = patches[g].length ? patches[g] : cortex;
    const picks = farthestPoints(BP, patch, Math.min(members.length, patch.length), centreOf(BP, patch));
    members.forEach((note, k) => {
      const p = picks[k % picks.length];
      const j = k >= picks.length ? 0.02 : 0;
      const [cx, cy, cz] = [BP[p * 3] - BRAIN_C.x, BP[p * 3 + 1] - BRAIN_C.y, BP[p * 3 + 2] - BRAIN_C.z];
      const out = 1.012 + j * r();
      notePos[note * 3] = BRAIN_C.x + cx * out + (r() - 0.5) * j;
      notePos[note * 3 + 1] = BRAIN_C.y + cy * out + (r() - 0.5) * j;
      notePos[note * 3 + 2] = BRAIN_C.z + cz * out + (r() - 0.5) * j;
      noteRegion[note] = atlas.brainRegion[p];
    });
  }
  const noteSplit = new Float32Array(notePos);
  for (let i = 0; i < n; i++) noteSplit[i * 3] += Math.sign(notePos[i * 3] || 1) * SPLIT;

  /* 4. The brain's matter: every brain point, owned by the nearest note of its patch. */
  const matter: number[] = [];
  const keepMatter = opts.small ? 0.5 : 1;
  for (let i = 0; i < atlas.brainN; i++) if (atlas.brainRegion[i] !== 7 && r() < keepMatter) matter.push(i);
  const brainStem: number[] = [];
  for (let i = 0; i < atlas.brainN; i++) if (atlas.brainRegion[i] === 7) brainStem.push(i);

  /* 5. The body, in growth order: brainstem, down the cord, out along the nerves. */
  const B = atlas.bodyN;
  const keepBody = opts.small ? 0.6 : 1;
  const keep = new Uint8Array(B);
  for (let i = 0; i < B; i++) keep[i] = atlas.bodyPrev[i] < 0 || r() < keepBody ? 1 : 0;
  const pathLen = new Float32Array(B).fill(-1);
  const rootY = new Float32Array(B);
  for (let i = 0; i < B; i++) {
    if (pathLen[i] >= 0) continue;
    const chain: number[] = [];
    let c = i;
    let guard = 0;
    while (c >= 0 && pathLen[c] < 0 && guard++ < B) {
      chain.push(c);
      c = atlas.bodyPrev[c];
    }
    let base = c >= 0 ? pathLen[c] : 0;
    let ry = c >= 0 ? rootY[c] : atlas.bodyPos[chain[chain.length - 1] * 3 + 1];
    for (let k = chain.length - 1; k >= 0; k--) {
      const p = chain[k];
      const q = atlas.bodyPrev[p];
      if (q >= 0 && pathLen[q] >= 0) {
        base = pathLen[q] + Math.sqrt(d2(atlas.bodyPos, p, atlas.bodyPos, q));
        ry = rootY[q];
      } else if (q < 0) {
        base = 0;
        ry = atlas.bodyPos[p * 3 + 1];
      }
      pathLen[p] = base;
      rootY[p] = ry;
    }
  }
  let stemTop = -Infinity;
  let stemLow = Infinity;
  let cordTop = -Infinity;
  let cordLow = Infinity;
  for (let i = 0; i < B; i++) {
    const y = atlas.bodyPos[i * 3 + 1];
    const part = atlas.bodyPart[i];
    if (part === 0) {
      stemTop = Math.max(stemTop, y);
      stemLow = Math.min(stemLow, y);
    } else if (part === 1 || part === 2) {
      cordTop = Math.max(cordTop, y);
      cordLow = Math.min(cordLow, y);
    }
  }
  for (const i of brainStem) stemTop = Math.max(stemTop, BP[i * 3 + 1]);
  const unit = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (a - v) / (a - b || 1)));
  const STEM = 0.15;
  const cordAt = (y: number) => STEM + unit(y, cordTop, cordLow);

  interface Slot {
    src: "stem" | "body";
    i: number;
    t: number;
    kind: number;
  }
  const slots: Slot[] = [];
  for (const i of brainStem) slots.push({ src: "stem", i, t: STEM * unit(BP[i * 3 + 1], stemTop, stemLow) - 0.01, kind: KIND_STEM });
  for (let i = 0; i < B; i++) {
    if (!keep[i]) continue;
    const part = atlas.bodyPart[i];
    const y = atlas.bodyPos[i * 3 + 1];
    let t: number;
    let kind: number;
    if (part === 0) {
      t = STEM * unit(y, stemTop, stemLow);
      kind = KIND_STEM;
    } else if (part === 1 || part === 2) {
      t = cordAt(y);
      kind = KIND_SPINE;
    } else {
      t = Math.max(cordAt(rootY[i]), STEM + 0.1) + pathLen[i] / 5;
      kind = part === 6 ? KIND_FACE : KIND_NERVE;
    }
    slots.push({ src: "body", i, t, kind });
  }
  slots.sort((a, b) => a.t - b.t);

  /* 6. Hand the body out in the order the notes were written. */
  const byDate = model.notes
    .map((x, i) => i)
    .sort((a, b) => {
      const da = model.notes[a].date;
      const db = model.notes[b].date;
      // undated notes always come last
      if (da == null || db == null) return (da == null ? 1 : 0) - (db == null ? 1 : 0) || a - b;
      return (opts.newestFirst ? db - da : da - db) || a - b;
    });
  const weight = byDate.map((i) => Math.max(1, model.notes[i].words));
  const cum: number[] = [];
  weight.reduce((acc, w, k) => (cum[k] = acc + w), 0);
  const W = cum[cum.length - 1] || 1;

  const total = matter.length + slots.length;
  const recPos = new Float32Array(total * 3);
  const recKind = new Uint8Array(total);
  const recNote = new Int32Array(total);
  const recOrder = new Float32Array(total);
  const recSplit = new Float32Array(total);

  // matter first
  matter.forEach((p, k) => {
    recPos[k * 3] = BP[p * 3];
    recPos[k * 3 + 1] = BP[p * 3 + 1];
    recPos[k * 3 + 2] = BP[p * 3 + 2];
    recKind[k] = KIND_MATTER;
    recOrder[k] = r() * 0.05;
    recSplit[k] = Math.sign(BP[p * 3] || (r() - 0.5)) * SPLIT;
    const g = patchOf[p];
    const cands = g >= 0 && notesOf[g].length ? notesOf[g] : null;
    recNote[k] = nearestNote(BP, p, notePos, cands, n);
  });

  // then the body, in written order
  const bodyIndex = new Int32Array(B).fill(-1);
  let note = 0;
  slots.forEach((s, k) => {
    const at = matter.length + k;
    const P = s.src === "stem" ? BP : atlas.bodyPos;
    recPos[at * 3] = P[s.i * 3];
    recPos[at * 3 + 1] = P[s.i * 3 + 1];
    recPos[at * 3 + 2] = P[s.i * 3 + 2];
    recKind[at] = s.kind;
    recOrder[at] = 0.06 + (k / Math.max(1, slots.length - 1)) * 0.94;
    const target = ((k + 0.5) / slots.length) * W;
    while (note < cum.length - 1 && cum[note] < target) note++;
    recNote[at] = byDate[note] ?? 0;
    if (s.src === "body") bodyIndex[s.i] = at;
  });

  // fibres: each kept body point to the nearest kept point before it on its fibre
  const fib: number[] = [];
  for (let i = 0; i < B; i++) {
    const a = bodyIndex[i];
    if (a < 0) continue;
    let q = atlas.bodyPrev[i];
    let guard = 0;
    while (q >= 0 && bodyIndex[q] < 0 && guard++ < 8) q = atlas.bodyPrev[q];
    if (q >= 0 && bodyIndex[q] >= 0) fib.push(a, bodyIndex[q]);
  }

  return { n, notePos, noteSplit, noteRegion, recCount: total, recNote, recPos, recKind, recOrder, recSplit, fibres: new Uint32Array(fib) };
}

function nearestNote(P: Float32Array, p: number, notePos: Float32Array, cands: number[] | null, n: number) {
  let best = 0;
  let bd = Infinity;
  const list = cands ?? null;
  const len = list ? list.length : n;
  for (let k = 0; k < len; k++) {
    const j = list ? list[k] : k;
    const d = d2(P, p, notePos, j);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

function pickFront(P: Float32Array, idx: number[]) {
  let best = idx[0];
  for (const i of idx) if (P[i * 3 + 2] > P[best * 3 + 2]) best = i;
  return best;
}

function centreOf(P: Float32Array, idx: number[]) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of idx) {
    x += P[i * 3];
    y += P[i * 3 + 1];
    z += P[i * 3 + 2];
  }
  x /= idx.length;
  y /= idx.length;
  z /= idx.length;
  let best = idx[0];
  let bd = Infinity;
  for (const i of idx) {
    const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Farthest-point sampling over `idx`, starting from `start`. */
function farthestPoints(P: Float32Array, idx: number[], k: number, start: number): number[] {
  const out = [start];
  if (k <= 1 || idx.length <= 1) return out.slice(0, Math.max(1, k));
  const dist = new Float32Array(idx.length);
  for (let a = 0; a < idx.length; a++) dist[a] = d2(P, idx[a], P, start);
  while (out.length < k) {
    let far = 0;
    for (let a = 1; a < idx.length; a++) if (dist[a] > dist[far]) far = a;
    if (dist[far] <= 0) break;
    const p = idx[far];
    out.push(p);
    for (let a = 0; a < idx.length; a++) {
      const d = d2(P, idx[a], P, p);
      if (d < dist[a]) dist[a] = d;
    }
  }
  return out;
}

/* ── layout form: one cluster per group, filling the same frame ─────────── */

export function buildGrouped(model: Model, groupBy: GroupBy, anat: Anatomy): Layout {
  const r = rng(99 + model.notes.length);
  const g = model.groups[groupBy];
  const G = Math.max(1, g.list.length);
  const n = anat.n;

  const size = g.list.map((x) => x.notes + x.record * 0.02);
  const W = FRAME.width - 0.6;
  const H = FRAME.top - FRAME.bottom - 0.4;
  const cols = Math.max(1, Math.round(Math.sqrt((G * W) / H)));
  const rows = Math.max(1, Math.ceil(G / cols));
  const cell = Math.min(W / cols, H / rows);
  const centers: number[][] = [];
  for (let i = 0; i < G; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, G - row * cols);
    const col = i % cols;
    centers.push([(col - (inRow - 1) / 2) * cell, FRAME.top - 0.2 - (row + 0.5) * (H / rows)]);
  }
  const maxSize = Math.max(...size, 1);
  const radius = size.map((s) => cell * (0.16 + 0.28 * Math.sqrt(s / maxSize)));

  const noteLayout = new Float32Array(n * 3);
  const seen = new Int32Array(G);
  const counts = g.list.map((x) => x.notes);
  for (let i = 0; i < n; i++) {
    const gi = g.of[i];
    const c = centers[gi];
    const [dx, dy, dz] = fibDir(seen[gi]++, counts[gi]);
    const rr = radius[gi] * 0.5 * Math.cbrt(r());
    noteLayout[i * 3] = c[0] + dx * rr;
    noteLayout[i * 3 + 1] = c[1] + dy * rr;
    noteLayout[i * 3 + 2] = dz * rr;
  }

  const recLayout = new Float32Array(anat.recCount * 3);
  for (let k = 0; k < anat.recCount; k++) {
    const gi = g.of[anat.recNote[k]];
    const c = centers[gi];
    const a = r() * Math.PI * 2;
    const u = r() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    const inner = anat.recKind[k] === KIND_MATTER ? 0.3 : 0.6;
    const rr = radius[gi] * (inner + (1 - inner) * Math.pow(r(), 0.5));
    recLayout[k * 3] = c[0] + Math.cos(a) * s * rr;
    recLayout[k * 3 + 1] = c[1] + u * rr;
    recLayout[k * 3 + 2] = Math.sin(a) * s * rr;
  }

  return { key: `groups:${groupBy}`, noteLayout, recLayout, labels: [], frame: null, flat: false, scaffold: null };
}

function fibDir(i: number, n: number): [number, number, number] {
  if (n <= 1) return [0, 0, 0];
  const y = 1 - (i / (n - 1)) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.399963229728653;
  return [Math.cos(th) * rad, y, Math.sin(th) * rad];
}
