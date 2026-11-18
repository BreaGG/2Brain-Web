import type { Model } from "@/lib/brain";
import { FRAME_CY, rng, type Anatomy, type Layout, type LayoutLabel } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * Cosmos: a purely visual form. Every section (top-level folder) of the wiki
 * becomes a spiral galaxy, its notes strung along the arms and its record as
 * the stars; the section's index sits at the galaxy's core and the general
 * index at the centre of everything. Each galaxy turns slowly on its own axis.
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

interface Galaxy {
  c: V3; // centre
  n: V3; // spin axis (normal of the disc)
  u: V3; // in-plane basis
  v: V3;
  R: number; // radius
  arms: number;
  phase: number;
  speed: number; // rad/s
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

  // galaxies spread over a flattened sphere round the centre
  const Rc = 2.4 + 1.5 * Math.sqrt(S);
  const gal: Galaxy[] = sections.map((s, k) => {
    const y = S === 1 ? 0 : 1 - (k / (S - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = k * 2.399963229728653 + 0.6;
    const c: V3 = S === 1 ? [0, FRAME_CY, 0] : [Math.cos(th) * rad * Rc, FRAME_CY + y * Rc * 0.62, Math.sin(th) * rad * Rc * 0.8];
    const nrm = norm([gauss(r) * 0.8, 1 + r() * 0.6, gauss(r) * 0.8]);
    const helper: V3 = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const u = norm(cross(nrm, helper));
    const v = cross(nrm, u);
    return {
      c,
      n: nrm,
      u,
      v,
      R: 0.8 + 1.5 * Math.sqrt(s.rec / maxRec),
      arms: 2 + (k % 2),
      phase: r() * Math.PI * 2,
      speed: (0.05 + r() * 0.06) * (r() < 0.5 ? -1 : 1),
    };
  });

  // a point of galaxy g at local (x, y in the disc, h along the axis)
  const put = (g: Galaxy, x: number, y: number, h: number): V3 => [
    g.c[0] + g.u[0] * x + g.v[0] * y + g.n[0] * h,
    g.c[1] + g.u[1] * x + g.v[1] * y + g.n[1] * h,
    g.c[2] + g.u[2] * x + g.v[2] * y + g.n[2] * h,
  ];
  // a point on arm `arm` at fraction t of the radius (logarithmic-ish spiral)
  const onArm = (g: Galaxy, arm: number, t: number, scatter: number): V3 => {
    const ang = g.phase + (arm / g.arms) * Math.PI * 2 + 2.4 * Math.log(1 + 5 * t);
    const rr = g.R * t;
    const sx = gauss(r) * scatter;
    const sy = gauss(r) * scatter;
    return put(g, Math.cos(ang) * rr + sx, Math.sin(ang) * rr + sy, gauss(r) * g.R * 0.035 * (1.2 - t));
  };

  // notes: the section index at the core, the rest along the arms, hubs nearer the middle
  const noteLayout = new Float32Array(n * 3);
  const noteGal = new Int32Array(n).fill(-1);
  sections.forEach((s, k) => {
    const g = gal[k];
    const deg = (i: number) => model.notes[i].in.length + model.notes[i].out.length;
    const idx = s.members.filter((i) => model.notes[i].isIndex);
    const rest = s.members.filter((i) => !model.notes[i].isIndex).sort((a, b) => deg(b) - deg(a));
    for (const i of idx) {
      noteLayout.set(put(g, gauss(r) * 0.03, gauss(r) * 0.03, 0), i * 3);
      noteGal[i] = k;
    }
    const m = Math.max(1, rest.length);
    rest.forEach((i, j) => {
      const t = 0.16 + 0.8 * Math.pow((j + 0.5) / m, 0.85);
      noteLayout.set(onArm(g, j % g.arms, t, g.R * 0.025), i * 3);
      noteGal[i] = k;
    });
  });
  // notes outside every section (the general index and root pages): the core of the cosmos
  const core: V3 = [0, FRAME_CY, 0];
  model.notes.forEach((_, i) => {
    if (secOf[i] >= 0) return;
    const isRoot = model.notes[i].id === "index";
    noteLayout.set(isRoot ? core : [core[0] + gauss(r) * 0.25, core[1] + gauss(r) * 0.25, core[2] + gauss(r) * 0.25], i * 3);
  });

  // the record: stars of each galaxy (a bright bulge, the arms, a faint disc)
  const recLayout = new Float32Array(anat.recCount * 3);
  const recGal = new Int32Array(anat.recCount).fill(-1);
  for (let k = 0; k < anat.recCount; k++) {
    const s = secOf[anat.recNote[k]];
    if (s < 0) {
      // the core: a small bright cluster
      const rr = 0.35 * Math.pow(r(), 1.6);
      const p = norm([gauss(r), gauss(r), gauss(r)]);
      recLayout.set([core[0] + p[0] * rr, core[1] + p[1] * rr, core[2] + p[2] * rr], k * 3);
      continue;
    }
    const g = gal[s];
    recGal[k] = s;
    const pick = r();
    let p: V3;
    if (pick < 0.2) {
      // bulge
      const rr = g.R * 0.16 * Math.abs(gauss(r));
      const a = r() * Math.PI * 2;
      p = put(g, Math.cos(a) * rr, Math.sin(a) * rr, gauss(r) * g.R * 0.07);
    } else if (pick < 0.88) {
      const t = Math.pow(r(), 0.75);
      p = onArm(g, Math.floor(r() * g.arms), 0.05 + 0.95 * t, g.R * (0.025 + 0.07 * t));
    } else {
      const t = Math.sqrt(r());
      const a = r() * Math.PI * 2;
      p = put(g, Math.cos(a) * g.R * t, Math.sin(a) * g.R * t, gauss(r) * g.R * 0.04);
    }
    recLayout.set(p, k * 3);
  }

  // spin, per galaxy: centre, axis and speed for every point
  const centre = new Float32Array(sections.length * 3);
  const axis = new Float32Array(sections.length * 3);
  const speed = new Float32Array(sections.length);
  gal.forEach((g, k) => {
    centre.set(g.c, k * 3);
    axis.set(g.n, k * 3);
    speed[k] = g.speed;
  });

  // labels: each galaxy named under its disc, the core named at the centre
  const labels: LayoutLabel[] = sections.map((s, k) => ({
    text: `${s.label} · ${s.members.length}`,
    pos: [gal[k].c[0] + gal[k].R * 0.55, gal[k].c[1] - gal[k].R * 0.55, gal[k].c[2]],
    kind: "title",
    group: opts.labelColours ? s.gi : undefined,
  }));
  if (model.bySlug.has("index")) labels.push({ text: "Index", pos: [core[0] + 0.2, core[1] + 0.25, core[2]], kind: "box" });

  const ext = Rc + Math.max(...gal.map((g) => g.R), 1) + 0.6;
  return {
    key: `cosmos:${S}:${n}`,
    noteLayout,
    recLayout,
    labels,
    frame: { cx: 0, cy: FRAME_CY, w: ext * 1.75, h: ext * 1.5 },
    flat: false,
    scaffold: null,
    spin: { centre, axis, speed, noteGal, recGal },
  };
}
