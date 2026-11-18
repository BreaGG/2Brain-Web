import type { Model } from "@/lib/brain";
import { FRAME_CY, rng, type Anatomy, type Layout, type LayoutLabel } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * Cosmos: a purely visual form. Every section (top-level folder) of the wiki
 * becomes a galaxy — a spiral, a barred spiral, or an elliptical for a small
 * section — its notes strung along the arms and its record as the stars. The
 * section's index sits at the galaxy's core and the general index at the
 * centre of everything. Each galaxy spins on its own tilted axis while the ring
 * of galaxies turns slowly round the centre; streams of light join the sections
 * that link to each other most.
 * ─────────────────────────────────────────────────────────────────────────── */

type V3 = [number, number, number];

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

type Kind = "spiral" | "barred" | "elliptical";

interface Galaxy {
  c: V3; // centre
  n: V3; // spin axis (normal of the disc)
  u: V3; // in-plane basis
  v: V3;
  R: number; // radius
  kind: Kind;
  arms: number;
  phase: number;
  speed: number; // spin, rad/s
  orbit: number; // round the centre, rad/s
}

/** A soft glow that turns and orbits with its galaxy (gal -1: the centre, which stays put). */
export interface CosmosGlow {
  gal: number;
  pos: V3; // at time 0
  size: number; // world units
  alpha: number;
  note: number; // takes this note's colour; -1 for white
}

export interface CosmosExtras {
  centre: V3;
  glows: CosmosGlow[];
  /** Streams of light between galaxy cores (note indices), weighted 0..1. */
  filaments: { a: number; b: number; w: number }[];
}

export function buildCosmos(model: Model, anat: Anatomy, opts: { labelColours: boolean }): Layout {
  const r = rng(424242 + model.notes.length);
  const n = anat.n;
  const fg = model.groups.folder;

  // sections: every top-level folder except the root
  const secOf = new Int32Array(n).fill(-1);
  const sections: { label: string; members: number[]; rec: number; gi: number }[] = [];
  const at = new Map<string, number>();
  fg.list.forEach((g, gi) => {
    if (g.key === "root") return;
    at.set(g.key, sections.length);
    sections.push({ label: g.label, members: [], rec: 0, gi });
  });
  model.notes.forEach((note, i) => {
    const s = at.get(note.folder);
    if (s != null) {
      secOf[i] = s;
      sections[s].members.push(i);
    }
  });
  for (let k = 0; k < anat.recCount; k++) {
    const s = secOf[anat.recNote[k]];
    if (s >= 0) sections[s].rec++;
  }
  const S = Math.max(1, sections.length);
  const maxRec = Math.max(1, ...sections.map((s) => s.rec));
  const centre: V3 = [0, FRAME_CY, 0];

  // galaxies round the centre in a loose ring, each given an arc as wide as its disc, so none overlaps
  // another; big and small take turns so the ring is balanced
  const bySize = sections.map((s, k) => [k, s.rec] as const).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const rank = new Int32Array(S);
  bySize.forEach((k, j) => (rank[k] = j));
  const radius = sections.map((s) => 0.75 + 1.6 * Math.sqrt(s.rec / maxRec));
  const maxR = Math.max(1, ...radius);
  const ring: number[] = [];
  for (let a = 0, b = S - 1; a <= b; a++, b--) {
    ring.push(bySize[a]);
    if (a !== b) ring.push(bySize[b]);
  }
  const GAP = 1.4;
  const span = ring.map((k) => 2 * radius[k] + GAP);
  const total = span.reduce((x, y) => x + y, 0);
  const Rc = Math.max(maxR + 2.6, total / (Math.PI * 2));
  const angle = new Float64Array(S);
  const lift = new Float64Array(S);
  let run = -Math.PI / 2;
  ring.forEach((k, j) => {
    // neighbours sit a little above and below each other, for depth
    lift[k] = (j % 2 ? -1 : 1) * (0.3 + r() * 0.4);
    angle[k] = run + (span[j] / total) * Math.PI;
    run += (span[j] / total) * Math.PI * 2;
  });
  const gal: Galaxy[] = sections.map((s, k) => {
    const th = angle[k];
    const rad = Rc * (1 + (r() - 0.5) * 0.12);
    const c: V3 = S === 1 ? [...centre] : [Math.cos(th) * rad, FRAME_CY + lift[k], Math.sin(th) * rad];
    const nrm = norm([gauss(r) * 0.7, 1 + r() * 0.7, gauss(r) * 0.7]);
    const helper: V3 = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const u = norm(cross(nrm, helper));
    const v = cross(nrm, u);
    const kind: Kind = s.members.length <= 2 ? "elliptical" : rank[k] % 3 === 1 ? "barred" : "spiral";
    return {
      c,
      n: nrm,
      u,
      v,
      R: radius[k],
      kind,
      arms: kind === "barred" ? 2 : 2 + Math.min(2, Math.floor(s.members.length / 12)),
      phase: r() * Math.PI * 2,
      // a turn in roughly 30 to 50 seconds, either way round
      speed: (0.13 + r() * 0.08) * (r() < 0.5 ? -1 : 1),
      // the ring turns slowly round the centre, all at once, so the galaxies never run into each other
      orbit: S === 1 ? 0 : 0.03,
    };
  });

  // a point of galaxy g at local (x, y in the disc, h along the axis)
  const put = (g: Galaxy, x: number, y: number, h: number): V3 => [
    g.c[0] + g.u[0] * x + g.v[0] * y + g.n[0] * h,
    g.c[1] + g.u[1] * x + g.v[1] * y + g.n[1] * h,
    g.c[2] + g.u[2] * x + g.v[2] * y + g.n[2] * h,
  ];
  const barLen = (g: Galaxy) => (g.kind === "barred" ? g.R * 0.32 : 0);
  // a point on arm `arm` at fraction t of the radius (logarithmic-ish spiral, from the bar's end if barred)
  const onArm = (g: Galaxy, arm: number, t: number, scatter: number): V3 => {
    const b = barLen(g);
    const ang = g.phase + (arm / g.arms) * Math.PI * 2 + 2.4 * Math.log(1 + 5 * t);
    const rr = b + (g.R - b) * t;
    return put(g, Math.cos(ang) * rr + gauss(r) * scatter, Math.sin(ang) * rr + gauss(r) * scatter, gauss(r) * g.R * 0.035 * (1.2 - t));
  };
  const inEllipse = (g: Galaxy, spread: number): V3 => {
    // a smooth ball of stars, densest at the middle
    const rr = g.R * 0.55 * Math.pow(r(), 1.8) * spread;
    const p = norm([gauss(r), gauss(r), gauss(r)]);
    return put(g, p[0] * rr * 1.25, p[1] * rr, p[2] * rr * 0.75);
  };
  const onBar = (g: Galaxy): V3 => {
    const b = barLen(g);
    const x = (r() * 2 - 1) * b;
    const w = g.R * 0.06 * (1 - (Math.abs(x) / (b + 1e-6)) * 0.5);
    const y = gauss(r) * w;
    const lx = Math.cos(g.phase) * x - Math.sin(g.phase) * y;
    const ly = Math.sin(g.phase) * x + Math.cos(g.phase) * y;
    return put(g, lx, ly, gauss(r) * g.R * 0.04);
  };

  // notes: the section index at the core, the rest along the arms, hubs nearer the middle
  const noteLayout = new Float32Array(n * 3);
  const noteGal = new Int32Array(n).fill(-1);
  const cores: number[] = new Array(S).fill(-1);
  sections.forEach((s, k) => {
    const g = gal[k];
    const deg = (i: number) => model.notes[i].in.length + model.notes[i].out.length;
    const idx = s.members.filter((i) => model.notes[i].isIndex);
    const rest = s.members.filter((i) => !model.notes[i].isIndex).sort((a, b) => deg(b) - deg(a));
    cores[k] = idx[0] ?? rest[0] ?? -1;
    for (const i of idx) {
      noteLayout.set(put(g, gauss(r) * 0.02, gauss(r) * 0.02, 0), i * 3);
      noteGal[i] = k;
    }
    const m = Math.max(1, rest.length);
    rest.forEach((i, j) => {
      const t = 0.16 + 0.8 * Math.pow((j + 0.5) / m, 0.85);
      // a section with no index: its most linked note takes the core
      const p = !idx.length && j === 0 ? put(g, 0, 0, 0) : g.kind === "elliptical" ? inEllipse(g, 1.4) : onArm(g, j % g.arms, t, g.R * 0.025);
      noteLayout.set(p, i * 3);
      noteGal[i] = k;
    });
  });
  // notes outside every section (the general index and root pages): the centre of the cosmos
  let rootNote = -1;
  model.notes.forEach((_, i) => {
    if (secOf[i] >= 0) return;
    const isRoot = model.notes[i].id === "index";
    if (isRoot) rootNote = i;
    noteLayout.set(isRoot ? centre : [centre[0] + gauss(r) * 0.25, centre[1] + gauss(r) * 0.25, centre[2] + gauss(r) * 0.25], i * 3);
  });

  // the record: the stars of each galaxy
  const recLayout = new Float32Array(anat.recCount * 3);
  const recGal = new Int32Array(anat.recCount).fill(-1);
  for (let k = 0; k < anat.recCount; k++) {
    const s = secOf[anat.recNote[k]];
    if (s < 0) {
      // the centre: a tight bright cluster with a faint halo
      const halo = r() < 0.3;
      const rr = (halo ? 0.9 : 0.3) * Math.pow(r(), halo ? 0.8 : 1.8);
      const p = norm([gauss(r), gauss(r) * 0.6, gauss(r)]);
      recLayout.set([centre[0] + p[0] * rr, centre[1] + p[1] * rr, centre[2] + p[2] * rr], k * 3);
      continue;
    }
    const g = gal[s];
    recGal[k] = s;
    const pick = r();
    let p: V3;
    if (g.kind === "elliptical") p = inEllipse(g, 1);
    else if (pick < 0.18) {
      const rr = g.R * 0.15 * Math.abs(gauss(r));
      const a = r() * Math.PI * 2;
      p = put(g, Math.cos(a) * rr, Math.sin(a) * rr, gauss(r) * g.R * 0.07);
    } else if (g.kind === "barred" && pick < 0.3) p = onBar(g);
    else if (pick < 0.9) {
      const t = Math.pow(r(), 0.75);
      p = onArm(g, Math.floor(r() * g.arms), 0.04 + 0.96 * t, g.R * (0.022 + 0.07 * t));
    } else {
      const t = Math.sqrt(r());
      const a = r() * Math.PI * 2;
      p = put(g, Math.cos(a) * g.R * t, Math.sin(a) * g.R * t, gauss(r) * g.R * 0.04);
    }
    recLayout.set(p, k * 3);
  }

  // spin and orbit, per galaxy
  const centreArr = new Float32Array(S * 3);
  const axis = new Float32Array(S * 3);
  const speed = new Float32Array(S);
  const orbit = new Float32Array(S);
  gal.forEach((g, k) => {
    centreArr.set(g.c, k * 3);
    axis.set(g.n, k * 3);
    speed[k] = g.speed;
    orbit[k] = g.orbit;
  });

  // glows: a coloured core per galaxy, nebulae along the arms, and a white heart at the centre
  const glows: CosmosGlow[] = [];
  gal.forEach((g, k) => {
    const core = cores[k];
    glows.push({ gal: k, pos: g.c, size: g.R * (g.kind === "elliptical" ? 1.5 : 1.15), alpha: 0.5, note: core });
    glows.push({ gal: k, pos: g.c, size: g.R * 0.32, alpha: 0.85, note: -1 });
    if (g.kind !== "elliptical") {
      const neb = 3 + g.arms;
      for (let j = 0; j < neb; j++) glows.push({ gal: k, pos: onArm(g, j % g.arms, 0.35 + 0.5 * r(), 0), size: g.R * (0.45 + 0.3 * r()), alpha: 0.16, note: core });
    }
  });
  glows.push({ gal: -1, pos: centre, size: 2.4, alpha: 0.55, note: -1 });
  glows.push({ gal: -1, pos: centre, size: 0.7, alpha: 1, note: -1 });

  // filaments: the sections that link to each other most, and the general index to every core
  const pair = new Map<string, number>();
  for (const [a, b] of model.links) {
    const sa = secOf[a];
    const sb = secOf[b];
    if (sa < 0 || sb < 0 || sa === sb) continue;
    const key = sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`;
    pair.set(key, (pair.get(key) ?? 0) + 1);
  }
  const maxPair = Math.max(1, ...pair.values());
  const filaments: { a: number; b: number; w: number }[] = [...pair.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 14)
    .map(([key, c]) => {
      const [sa, sb] = key.split("|").map(Number);
      return { a: cores[sa], b: cores[sb], w: 0.3 + 0.45 * (c / maxPair) };
    })
    .filter((f) => f.a >= 0 && f.b >= 0);
  if (rootNote >= 0) for (const c of cores) if (c >= 0) filaments.push({ a: rootNote, b: c, w: 0.32 });

  // labels: each galaxy named under its disc (they orbit with it), the centre named "Index"
  const labels: LayoutLabel[] = sections.map((s, k) => ({
    text: `${s.label} · ${s.members.length}`,
    pos: [gal[k].c[0] + gal[k].R * 0.55, gal[k].c[1] - gal[k].R * 0.6, gal[k].c[2]],
    kind: "title",
    group: opts.labelColours ? s.gi : undefined,
    gal: k,
  }));
  if (rootNote >= 0) labels.push({ text: "Index", pos: [centre[0] + 0.25, centre[1] + 0.3, centre[2]], kind: "box" });

  const ext = Rc * 1.06 + maxR + 0.4;
  return {
    key: `cosmos:${S}:${n}`,
    noteLayout,
    recLayout,
    labels,
    frame: { cx: 0, cy: FRAME_CY, w: ext * 2.15, h: ext * 1.15 },
    flat: false,
    scaffold: null,
    spin: { centre: centreArr, axis, speed, orbit, origin: centre, noteGal, recGal },
    cosmos: { centre, glows, filaments },
  };
}
