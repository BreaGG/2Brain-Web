import { forceSimulation, forceManyBody, forceLink } from "d3-force-3d";
import type { GroupBy, Model } from "@/lib/brain";

/* ───────────────────────────────────────────────────────────────────────────
 * Procedural anatomy. Units: the figure spans roughly y ∈ [-6, 4.6].
 *   head (notes)  → ellipsoid centred at HEAD
 *   record        → brainstem, spinal cord, peripheral nerves, body volume
 * Record points are laid top→bottom in the order the notes were written.
 * ─────────────────────────────────────────────────────────────────────────── */

export const HEAD = { x: 0, y: 3.72, z: 0, rx: 0.92, ry: 0.84, rz: 1.02 };
export const FIG = { top: 4.7, bottom: -6.2 };

export const KIND_DUST = 0;
export const KIND_NERVE = 1;
export const KIND_SPINE = 2;
export const KIND_STEM = 3;
export const KIND_MATTER = 4; // grey matter: record points gathered round each note in the head

export interface Anatomy {
  n: number; // notes
  notePos: Float32Array; // mixed by links
  recCount: number;
  recNote: Int32Array;
  recPos: Float32Array;
  recKind: Uint8Array;
  recOrder: Float32Array; // 0..1 (written order)
  outline: Float32Array;
}

export interface Grouped {
  groupBy: GroupBy;
  noteLobe: Float32Array;
  noteLayout: Float32Array;
  recLayout: Float32Array;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Half-width of the body silhouette at height y. */
export function bodyWidth(y: number) {
  if (y > 2.95) return 0;
  if (y > 1.55) return 0.36 + 0.06 * smooth(2.95, 1.55, y); // neck
  if (y > 0.45) return 0.42 + 1.48 * smooth(1.55, 0.55, y); // shoulders (trapezius slope)
  if (y > -2.4) return 1.9 - 0.42 * smooth(0.45, -2.4, y); // chest → waist
  return 1.48 + 0.22 * smooth(-2.4, -4.3, y); // hips
}

function bodyDepth(y: number) {
  return Math.max(0.32, bodyWidth(y) * 0.6);
}

/** Spine centre line (slight S-curve in depth). */
function spineZ(y: number) {
  return -0.18 + 0.14 * Math.sin(((y - 2.6) / 8.2) * Math.PI * 1.6);
}

/** Arm centre line for side s (±1) at height y. */
function armX(y: number) {
  return 2.0 + 0.16 * smooth(0.6, -1.5, y) + 0.2 * smooth(-1.5, -5, y);
}

export function buildAnatomy(model: Model, maxRecord: number): Anatomy {
  const r = rng(7331 + model.notes.length * 13);
  const n = model.notes.length;

  /* ── Notes: force layout inside the head ─────────────────────────────── */
  const S = 100; // simulate in a ×100 space so d3 defaults behave
  const folderGroups = model.groups.folder;
  const anchors = fibDirs(Math.max(1, folderGroups.list.length), 0.3);
  const nodes = model.notes.map((note, i) => {
    const a = anchors[folderGroups.of[i] % anchors.length];
    const [x, y, z] = insideEllipsoid(r, 0.55);
    return {
      id: i,
      x: (a[0] * 0.45 + x * 0.6) * HEAD.rx * S,
      y: (a[1] * 0.45 + y * 0.6) * HEAD.ry * S,
      z: (a[2] * 0.45 + z * 0.6) * HEAD.rz * S,
      ax: a[0] * 0.5 * HEAD.rx * S,
      ay: a[1] * 0.5 * HEAD.ry * S,
      az: a[2] * 0.5 * HEAD.rz * S,
      deg: note.in.length + note.out.length,
    };
  });
  if (n > 1) {
    const linkData = model.links.map(([a, b]) => ({ source: a, target: b }));
    const sim = forceSimulation(nodes, 3)
      .force("charge", forceManyBody().strength(-9).distanceMax(70))
      .force("link", forceLink(linkData).id((d: { id: number }) => d.id).distance(24).strength(0.09))
      .force("anchor", (alpha: number) => {
        // a weak pull to the folder's region plus a pull to the middle keeps the head filled, not hollow
        for (const d of nodes as Array<(typeof nodes)[number] & { vx: number; vy: number; vz: number }>) {
          d.vx += ((d.ax - d.x) * 0.008 - d.x * 0.012) * alpha;
          d.vy += ((d.ay - d.y) * 0.008 - d.y * 0.012) * alpha;
          d.vz += ((d.az - d.z) * 0.008 - d.z * 0.012) * alpha;
        }
      })
      .stop();
    const ticks = n > 1500 ? 90 : 180;
    for (let t = 0; t < ticks; t++) {
      sim.tick();
      for (const d of nodes) clampEllipsoid(d, HEAD.rx * S * 0.92, HEAD.ry * S * 0.92, HEAD.rz * S * 0.92);
    }
  }
  // Normalise so the notes fill the head whatever the size of the wiki.
  if (n > 3) {
    const q = nodes
      .map((d) => Math.sqrt((d.x / (HEAD.rx * S)) ** 2 + (d.y / (HEAD.ry * S)) ** 2 + (d.z / (HEAD.rz * S)) ** 2))
      .sort((a, b) => a - b);
    const q90 = q[Math.floor(q.length * 0.9)] || 1;
    const k = 0.86 / q90;
    for (const d of nodes) {
      d.x *= k;
      d.y *= k;
      d.z *= k;
      clampEllipsoid(d, HEAD.rx * S * 0.95, HEAD.ry * S * 0.95, HEAD.rz * S * 0.95);
    }
  }
  const notePos = new Float32Array(n * 3);
  nodes.forEach((d, i) => {
    notePos[i * 3] = HEAD.x + d.x / S;
    notePos[i * 3 + 1] = HEAD.y + d.y / S;
    notePos[i * 3 + 2] = HEAD.z + d.z / S;
  });

  /* ── Record: how many points per note ────────────────────────────────── */
  const words = model.notes.map((x) => Math.max(1, x.words));
  const totalW = words.reduce((a, b) => a + b, 0) || 1;
  const natural = model.passages;
  const P = Math.max(Math.min(maxRecord, Math.max(natural, Math.round(maxRecord * 0.72))), n);
  const per = words.map((w) => Math.max(1, Math.round((w / totalW) * P)));
  // Sort notes by date (undated last) to lay the record in written order.
  const order = model.notes
    .map((x, i) => i)
    .sort((a, b) => {
      const da = model.notes[a].date ?? Infinity;
      const db = model.notes[b].date ?? Infinity;
      return da - db || a - b;
    });
  const seq: number[] = [];
  for (const i of order) for (let k = 0; k < per[i]; k++) seq.push(i);
  const recCount = seq.length;

  /* ── Record slots on the anatomy ─────────────────────────────────────── */
  const slots = new Float32Array(recCount * 3);
  const kinds = new Uint8Array(recCount);
  const nStem = Math.round(recCount * 0.07);
  const nSpine = Math.round(recCount * 0.19);
  const nNerve = Math.round(recCount * 0.38);
  let w = 0;
  const put = (x: number, y: number, z: number, k: number) => {
    if (w >= recCount) return;
    slots[w * 3] = x;
    slots[w * 3 + 1] = y;
    slots[w * 3 + 2] = z;
    kinds[w] = k;
    w++;
  };

  // Brainstem + cervical cord
  for (let i = 0; i < nStem; i++) {
    const t = r();
    const y = 3.2 - t * 1.75;
    const rad = 0.2 * (1 - t) + 0.07;
    put(gauss(r) * rad * 0.6, y, spineZ(y) + gauss(r) * rad * 0.5 - 0.1 * (1 - t), KIND_STEM);
  }
  // Spinal cord with vertebrae
  for (let i = 0; i < nSpine; i++) {
    const y = 1.45 - r() * 7.0;
    const v = Math.abs(((y * 3.3) % 1) + 1) % 1; // vertebra phase
    const ring = v < 0.22;
    const rad = ring ? 0.13 : 0.05;
    const a = r() * Math.PI * 2;
    const rr = ring ? rad * (0.7 + r() * 0.3) : Math.abs(gauss(r)) * rad;
    put(Math.cos(a) * rr * 1.3, y, spineZ(y) + Math.sin(a) * rr, KIND_SPINE);
  }
  // Peripheral nerves
  const levels = 30;
  const nervePaths: { pts: number[][] }[] = [];
  for (let l = 0; l < levels; l++) {
    const y0 = 1.3 - (l / (levels - 1)) * 6.3;
    for (const side of [-1, 1]) {
      const W = bodyWidth(y0);
      const front = l % 2 === 0 ? 1 : -1;
      const pts: number[][] = [];
      const drop = 0.35 + r() * 0.5;
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const ang = (s * Math.PI * 0.55 + 0.15) * front;
        const x = side * W * (0.08 + 0.92 * Math.sin(s * Math.PI * 0.5)) * 0.97;
        const y = y0 - drop * Math.pow(s, 1.6);
        const z = spineZ(y0) + Math.sin(ang) * bodyDepth(y) * s * 0.9;
        pts.push([x, y, z]);
      }
      nervePaths.push({ pts });
      // a branch heading down the flank
      const b0 = pts[Math.floor(pts.length * 0.55)];
      const bp: number[][] = [];
      for (let s = 0; s <= 1.0001; s += 0.08) {
        bp.push([b0[0] + side * 0.15 * s, b0[1] - s * (0.9 + r() * 0.6), b0[2] + front * 0.12 * s]);
      }
      nervePaths.push({ pts: bp });
    }
  }
  // Brachial nerves down each arm
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const pts: number[][] = [];
      for (let s = 0; s <= 1.0001; s += 0.025) {
        const y = 1.1 - s * 6.2;
        const x = side * (s < 0.12 ? 0.3 + (armX(0.6) - 0.3) * (s / 0.12) : armX(y) + (k - 1) * 0.09);
        const z = -0.05 + (k - 1) * 0.08;
        pts.push([x, y, z]);
      }
      nervePaths.push({ pts });
    }
  }
  const pathLens = nervePaths.map((p) => p.pts.length);
  const totalPath = pathLens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < nNerve; i++) {
    let pick = r() * totalPath;
    let pi = 0;
    while (pick >= pathLens[pi]) {
      pick -= pathLens[pi];
      pi++;
    }
    const pts = nervePaths[pi].pts;
    const j = Math.min(pts.length - 2, Math.floor(pick));
    const f = r();
    const a = pts[j];
    const b = pts[j + 1];
    const jit = 0.016;
    put(a[0] + (b[0] - a[0]) * f + gauss(r) * jit, a[1] + (b[1] - a[1]) * f + gauss(r) * jit, a[2] + (b[2] - a[2]) * f + gauss(r) * jit, KIND_NERVE);
  }
  // Body volume, biased to the skin, plus arms
  while (w < recCount) {
    if (r() < 0.16) {
      const y = 0.7 - r() * 6.4;
      const side = r() < 0.5 ? -1 : 1;
      const rad = 0.34 - 0.08 * smooth(0.7, -5, y);
      const a = r() * Math.PI * 2;
      const rr = rad * (1 - 0.45 * r() * r());
      put(side * armX(y) + Math.cos(a) * rr, y, -0.05 + Math.sin(a) * rr, KIND_DUST);
      continue;
    }
    const y = 2.95 - Math.pow(r(), 0.85) * 9.1;
    const W = bodyWidth(y);
    if (W <= 0) continue;
    const D = bodyDepth(y);
    const a = r() * Math.PI * 2;
    const rr = 1 - 0.5 * Math.pow(r(), 2.2);
    put(Math.cos(a) * W * rr, y, Math.sin(a) * D * rr, KIND_DUST);
  }

  // Order slots top → bottom (with a little mixing) and hand them out in written order.
  const idx = new Array(recCount);
  const key = new Float32Array(recCount);
  for (let i = 0; i < recCount; i++) {
    idx[i] = i;
    key[i] = -slots[i * 3 + 1] + (r() - 0.5) * 0.9;
  }
  idx.sort((a, b) => key[a] - key[b]);

  // Grey matter: a cloud round every note so the head reads as a brain, weighted by links.
  const M = n ? Math.max(1800, Math.min(7000, n * 45)) : 0;
  const total = recCount + M;
  const recPos = new Float32Array(total * 3);
  const recKind = new Uint8Array(total);
  const recNote = new Int32Array(total);
  const recOrder = new Float32Array(total);
  if (M) {
    const weight = model.notes.map((x) => 1 + Math.sqrt(x.in.length + x.out.length));
    const cum: number[] = [];
    weight.reduce((a, w, i) => (cum[i] = a + w), 0);
    const W = cum[cum.length - 1];
    for (let m = 0; m < M; m++) {
      const t = r() * W;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      const k = recCount + m;
      const d = { x: notePos[lo * 3] - HEAD.x + gauss(r) * 0.2, y: notePos[lo * 3 + 1] - HEAD.y + gauss(r) * 0.18, z: notePos[lo * 3 + 2] - HEAD.z + gauss(r) * 0.2 };
      clampEllipsoid(d, HEAD.rx * 0.98, HEAD.ry * 0.98, HEAD.rz * 0.98);
      recPos[k * 3] = HEAD.x + d.x;
      recPos[k * 3 + 1] = HEAD.y + d.y;
      recPos[k * 3 + 2] = HEAD.z + d.z;
      recKind[k] = KIND_MATTER;
      recNote[k] = lo;
      recOrder[k] = r() * 0.04;
    }
  }
  for (let k = 0; k < recCount; k++) {
    const s = idx[k];
    recPos[k * 3] = slots[s * 3];
    recPos[k * 3 + 1] = slots[s * 3 + 1];
    recPos[k * 3 + 2] = slots[s * 3 + 2];
    recKind[k] = kinds[s];
    recNote[k] = seq[k];
    recOrder[k] = k / Math.max(1, recCount - 1);
  }

  /* ── Brain outline: a faint skin with gyri-like ripples ──────────────── */
  const O = 2600;
  const outline = new Float32Array(O * 3);
  for (let i = 0; i < O; i++) {
    const [dx, dy, dz] = fibDir(i, O);
    const ripple = 1 + 0.045 * Math.sin(dx * 11 + dy * 7) * Math.cos(dz * 9 - dy * 5);
    const fissure = 1 - 0.1 * Math.exp(-Math.pow(dx / 0.08, 2)) * (dy > -0.2 ? 1 : 0);
    const k = 1.06 * ripple * fissure;
    outline[i * 3] = HEAD.x + dx * HEAD.rx * k;
    outline[i * 3 + 1] = HEAD.y + dy * HEAD.ry * k;
    outline[i * 3 + 2] = HEAD.z + dz * HEAD.rz * k;
  }

  return { n, notePos, recCount: total, recNote, recPos, recKind, recOrder, outline };
}

export function buildGrouped(model: Model, groupBy: GroupBy, anat: Anatomy): Grouped {
  const r = rng(99 + model.notes.length);
  const g = model.groups[groupBy];
  const G = g.list.length;
  const n = anat.n;

  /* Lobes: each group gets its own region of the head. */
  const dirs = fibDirs(Math.max(1, G), 0.15);
  const noteLobe = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = dirs[g.of[i] % dirs.length];
    const spread = 0.17 + 0.1 / Math.sqrt(Math.max(1, G));
    let x = d[0] * 0.58 + gauss(r) * spread;
    let y = d[1] * 0.58 + gauss(r) * spread;
    let z = d[2] * 0.58 + gauss(r) * spread;
    const len = Math.hypot(x, y, z);
    if (len > 0.9) {
      x *= 0.9 / len;
      y *= 0.9 / len;
      z *= 0.9 / len;
    }
    noteLobe[i * 3] = HEAD.x + x * HEAD.rx;
    noteLobe[i * 3 + 1] = HEAD.y + y * HEAD.ry;
    noteLobe[i * 3 + 2] = HEAD.z + z * HEAD.rz;
  }

  /* Layout: one cluster per group on a grid that fills the figure's frame. */
  const centers = layoutCenters(g.list.map((x) => x.notes + x.record * 0.02));
  const maxSize = Math.max(...g.list.map((x) => x.notes + x.record * 0.02), 1);
  const radius = g.list.map((x) => centers.cell * (0.18 + 0.27 * Math.sqrt((x.notes + x.record * 0.02) / maxSize)));

  const noteLayout = new Float32Array(n * 3);
  const seen = new Int32Array(G);
  const counts = g.list.map((x) => x.notes);
  for (let i = 0; i < n; i++) {
    const gi = g.of[i];
    const c = centers.pts[gi];
    const [dx, dy, dz] = fibDir(seen[gi]++, counts[gi]);
    const rr = radius[gi] * 0.5 * Math.cbrt(r());
    noteLayout[i * 3] = c[0] + dx * rr;
    noteLayout[i * 3 + 1] = c[1] + dy * rr;
    noteLayout[i * 3 + 2] = dz * rr;
  }

  const recLayout = new Float32Array(anat.recCount * 3);
  for (let k = 0; k < anat.recCount; k++) {
    const gi = g.of[anat.recNote[k]];
    const c = centers.pts[gi];
    const a = r() * Math.PI * 2;
    const u = r() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    const rr = radius[gi] * (0.55 + 0.45 * Math.pow(r(), 0.5));
    recLayout[k * 3] = c[0] + Math.cos(a) * s * rr;
    recLayout[k * 3 + 1] = c[1] + u * rr;
    recLayout[k * 3 + 2] = Math.sin(a) * s * rr;
  }

  return { groupBy, noteLobe, noteLayout, recLayout };
}

/* ── geometry helpers ──────────────────────────────────────────────────── */

function layoutCenters(sizes: number[]) {
  const G = sizes.length;
  const W = 6.4;
  const H = 9.6;
  const cols = Math.max(1, Math.round(Math.sqrt((G * W) / H)));
  const rows = Math.max(1, Math.ceil(G / cols));
  const cell = Math.min(W / cols, H / rows);
  const pts: number[][] = [];
  for (let i = 0; i < G; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, G - row * cols);
    const col = i % cols;
    const x = (col - (inRow - 1) / 2) * cell;
    const y = FIG.top - 1.2 - (row + 0.5) * (H / rows) + (row % 2 ? 0.08 : 0);
    pts.push([x, y]);
  }
  return { pts, cell };
}

function insideEllipsoid(r: () => number, k: number): [number, number, number] {
  for (;;) {
    const x = r() * 2 - 1;
    const y = r() * 2 - 1;
    const z = r() * 2 - 1;
    if (x * x + y * y + z * z <= 1) return [x * k, y * k, z * k];
  }
}

function clampEllipsoid(d: { x: number; y: number; z: number }, rx: number, ry: number, rz: number) {
  const q = (d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2;
  if (q > 1) {
    const s = 1 / Math.sqrt(q);
    d.x *= s;
    d.y *= s;
    d.z *= s;
  }
}

function fibDir(i: number, n: number): [number, number, number] {
  if (n <= 1) return [0, 0, 0];
  const y = 1 - (i / (n - 1)) * 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * 2.399963229728653;
  return [Math.cos(th) * rad, y, Math.sin(th) * rad];
}

function fibDirs(n: number, jitter: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (n === 1) return [[0, 0.1, 0]];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = fibDir(i, n);
    out.push([x * (1 - jitter * 0.3), y * (1 - jitter * 0.3), z * (1 - jitter * 0.3)]);
  }
  return out;
}
