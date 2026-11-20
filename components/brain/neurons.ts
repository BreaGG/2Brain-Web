import type { Model } from "@/lib/brain";
import { rng } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * The brain, closer: every note a neuron. A soma, a tree of dendrites around
 * it, and for every link an axon that leaves the note and ends in a synapse on
 * a dendrite of the note it links to. Built once per model; pure data, so the
 * scene only has to draw it and send impulses along the axons.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface NeuronNet {
  n: number;
  /** Per neuron: soma centre (xyz) and radius. */
  soma: Float32Array;
  radius: Float32Array;
  /** Dendrites as line segments: two vertices each. */
  dendPos: Float32Array;
  /** Per dendrite vertex: its neuron, and how far out along the tree it is (0 at the soma, 1 at a tip). */
  dendOwner: Float32Array;
  dendFade: Float32Array;
  /** Axons, one per link: a polyline of samples. */
  axonFrom: Int32Array;
  axonTo: Int32Array;
  axonStart: Int32Array;
  axonCount: Int32Array;
  axonPts: Float32Array;
  /** World length of each axon. */
  axonLength: Float32Array;
  /** Per neuron: the axons that leave it. */
  outAxons: number[][];
  centre: [number, number, number];
  extent: number;
}

const v3 = () => [0, 0, 0] as [number, number, number];
function norm(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}

/** Lay the notes out in space: linked notes pull together, every note pushes the others away, a folder keeps its notes near. */
function place(model: Model, groupOf: Int32Array, R: () => number) {
  const N = model.notes.length;
  const G = Math.max(1, ...Array.from(groupOf, (g) => g + 1));
  const spread = 3.3 * Math.cbrt(N);
  // group centres on a sphere
  const gc: number[][] = [];
  for (let g = 0; g < G; g++) {
    const y = 1 - (2 * (g + 0.5)) / G;
    const r = Math.sqrt(1 - y * y);
    const th = g * Math.PI * (3 - Math.sqrt(5));
    gc.push([Math.cos(th) * r * spread * 0.7, y * spread * 0.55, Math.sin(th) * r * spread * 0.7]);
  }
  const p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const c = gc[groupOf[i]] ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) p[i * 3 + k] = c[k] + (R() - 0.5) * spread * 0.5;
  }
  const f = new Float32Array(N * 3);
  const iters = Math.round(Math.max(30, Math.min(260, 9e7 / Math.max(1, N * N))));
  const rest = 2.7;
  for (let it = 0; it < iters; it++) {
    const heat = 1 - it / iters;
    f.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = p[i * 3] - p[j * 3], dy = p[i * 3 + 1] - p[j * 3 + 1], dz = p[i * 3 + 2] - p[j * 3 + 2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-4) {
          dx = R() - 0.5; dy = R() - 0.5; dz = R() - 0.5;
          d2 = 0.01;
        }
        if (d2 > 400) continue;
        const k = 5.5 / d2;
        f[i * 3] += dx * k; f[i * 3 + 1] += dy * k; f[i * 3 + 2] += dz * k;
        f[j * 3] -= dx * k; f[j * 3 + 1] -= dy * k; f[j * 3 + 2] -= dz * k;
      }
    }
    for (const [a, b] of model.links) {
      const dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1], dz = p[b * 3 + 2] - p[a * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const k = (0.06 * (d - rest)) / d;
      f[a * 3] += dx * k; f[a * 3 + 1] += dy * k; f[a * 3 + 2] += dz * k;
      f[b * 3] -= dx * k; f[b * 3 + 1] -= dy * k; f[b * 3 + 2] -= dz * k;
    }
    for (let i = 0; i < N; i++) {
      const c = gc[groupOf[i]] ?? [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        f[i * 3 + k] += (c[k] - p[i * 3 + k]) * 0.02 - p[i * 3 + k] * 0.004;
        const step = Math.max(-1.2, Math.min(1.2, f[i * 3 + k])) * (0.35 + 0.65 * heat);
        p[i * 3 + k] += step;
      }
    }
  }
  return p;
}

export function buildNeurons(model: Model, groupOf: Int32Array, opts: { small?: boolean } = {}): NeuronNet {
  const R = rng(4177);
  const N = model.notes.length;
  const soma = place(model, groupOf, R);
  const deg = new Int32Array(N);
  for (const [a, b] of model.links) {
    deg[a]++;
    deg[b]++;
  }
  const maxDeg = Math.max(1, ...Array.from(deg));
  const radius = Float32Array.from(deg, (d) => 0.2 + 0.3 * Math.sqrt(d / maxDeg));

  // ── dendrites: a few primaries that bend, taper and fork ───────────────────
  const budget = opts.small ? 60000 : 160000; // segments, across the whole net
  // about 7 segments a branch and 2.25 branches per fork, about 6.5 primaries a cell: as deep as the budget allows
  const perCell = (D: number) => 6.5 * 7 * Array.from({ length: D + 1 }, (_, d) => 2.25 ** d).reduce((x, y) => x + y, 0);
  let depthMax = 3;
  while (depthMax > 0 && N * perCell(depthMax) > budget) depthMax--;
  const pos: number[] = [];
  const owner: number[] = [];
  const fade: number[] = [];
  const tips: number[][][] = Array.from({ length: N }, () => []);
  const grow = (i: number, from: number[], dir: number[], len: number, depth: number) => {
    const steps = 6 + Math.floor(R() * 3);
    let cur = from.slice();
    const d = dir.slice();
    const segLen = len / steps;
    for (let s = 0; s < steps; s++) {
      // a little wander, so no branch is straight
      d[0] += (R() - 0.5) * 0.55; d[1] += (R() - 0.5) * 0.55; d[2] += (R() - 0.5) * 0.55;
      norm(d);
      const next = [cur[0] + d[0] * segLen, cur[1] + d[1] * segLen, cur[2] + d[2] * segLen];
      const fa = (depth + s / steps) / (depthMax + 1);
      const fb = (depth + (s + 1) / steps) / (depthMax + 1);
      pos.push(cur[0], cur[1], cur[2], next[0], next[1], next[2]);
      owner.push(i, i);
      fade.push(fa, fb);
      cur = next;
    }
    if (depth < depthMax) {
      const kids = 2 + (R() < 0.25 ? 1 : 0);
      for (let k = 0; k < kids; k++) {
        const nd = [d[0] + (R() - 0.5) * 1.3, d[1] + (R() - 0.5) * 1.3, d[2] + (R() - 0.5) * 1.3];
        grow(i, cur, norm(nd), len * 0.68, depth + 1);
      }
    } else tips[i].push(cur);
  };
  for (let i = 0; i < N; i++) {
    const c = [soma[i * 3], soma[i * 3 + 1], soma[i * 3 + 2]];
    const prim = 4 + Math.min(4, Math.round((deg[i] / maxDeg) * 4)) + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < prim; k++) {
      // spread the primaries round the soma (a jittered fibonacci sphere)
      const y = 1 - (2 * (k + 0.5)) / prim + (R() - 0.5) * 0.3;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = k * 2.4 + R() * 6.28;
      const d = norm([Math.cos(th) * r, y, Math.sin(th) * r]);
      const start = [c[0] + d[0] * radius[i], c[1] + d[1] * radius[i], c[2] + d[2] * radius[i]];
      grow(i, start, d, 1.25 + R() * 0.8 + radius[i] * 1.5, 0);
    }
  }

  // ── axons: from the soma to the nearest dendrite tip of the note linked to ──
  const L = model.links.length;
  const axonFrom = new Int32Array(L), axonTo = new Int32Array(L), axonStart = new Int32Array(L), axonCount = new Int32Array(L);
  const axonLength = new Float32Array(L);
  const pts: number[] = [];
  const outAxons: number[][] = Array.from({ length: N }, () => []);
  model.links.forEach(([a, b], li) => {
    const A = [soma[a * 3], soma[a * 3 + 1], soma[a * 3 + 2]];
    const B = [soma[b * 3], soma[b * 3 + 1], soma[b * 3 + 2]];
    let tip = B;
    let best = Infinity;
    for (const t of tips[b]) {
      const d = (t[0] - A[0]) ** 2 + (t[1] - A[1]) ** 2 + (t[2] - A[2]) ** 2;
      if (d < best) {
        best = d;
        tip = t;
      }
    }
    const dir = norm([tip[0] - A[0], tip[1] - A[1], tip[2] - A[2]]);
    const start = [A[0] + dir[0] * radius[a], A[1] + dir[1] * radius[a], A[2] + dir[2] * radius[a]];
    const len = Math.hypot(tip[0] - start[0], tip[1] - start[1], tip[2] - start[2]);
    // a cubic curve that swings out to one side and comes back
    const side = norm([R() - 0.5, R() - 0.5, R() - 0.5]);
    const sway = len * (0.12 + R() * 0.18);
    const c1 = [start[0] + (tip[0] - start[0]) * 0.3 + side[0] * sway, start[1] + (tip[1] - start[1]) * 0.3 + side[1] * sway, start[2] + (tip[2] - start[2]) * 0.3 + side[2] * sway];
    const c2 = [start[0] + (tip[0] - start[0]) * 0.72 - side[0] * sway * 0.6, start[1] + (tip[1] - start[1]) * 0.72 - side[1] * sway * 0.6, start[2] + (tip[2] - start[2]) * 0.72 - side[2] * sway * 0.6];
    const n = Math.max(8, Math.min(L > 2500 ? 20 : 48, Math.round(len / 0.18)));
    axonFrom[li] = a;
    axonTo[li] = b;
    axonStart[li] = pts.length / 3;
    axonCount[li] = n + 1;
    let prev: number[] | null = null;
    let total = 0;
    for (let s = 0; s <= n; s++) {
      const t = s / n, u = 1 - t;
      const q = v3();
      for (let k = 0; k < 3; k++) q[k] = u * u * u * start[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * tip[k];
      if (prev) total += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
      prev = q;
      pts.push(q[0], q[1], q[2]);
    }
    axonLength[li] = total;
    outAxons[a].push(li);
  });

  // ── frame ─────────────────────────────────────────────────────────────────
  const centre: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) centre[k] += soma[i * 3 + k] / Math.max(1, N);
  let extent = 1;
  for (let i = 0; i < N; i++) extent = Math.max(extent, Math.hypot(soma[i * 3] - centre[0], soma[i * 3 + 1] - centre[1], soma[i * 3 + 2] - centre[2]));

  return {
    n: N,
    soma,
    radius,
    dendPos: Float32Array.from(pos),
    dendOwner: Float32Array.from(owner),
    dendFade: Float32Array.from(fade),
    axonFrom,
    axonTo,
    axonStart,
    axonCount,
    axonPts: Float32Array.from(pts),
    axonLength,
    outAxons,
    centre,
    extent: extent + 2,
  };
}
