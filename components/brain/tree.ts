import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { Grouping, Model } from "@/lib/brain";
import { capital } from "@/lib/brain";
import { FRAME_CY, rng, type Anatomy, type Layout, type LayoutLabel } from "./anatomy";

/* ───────────────────────────────────────────────────────────────────────────
 * Folder tree: the wiki's folders as a tree, read left to right, with every
 * note a leaf and its record gathered round it. A folder's index note sits on
 * the folder itself.
 * ─────────────────────────────────────────────────────────────────────────── */

interface TNode {
  name: string;
  path: string;
  note: number | null; // note at this node (a leaf, or a folder's index)
  children: TNode[];
}

function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function buildTree(model: Model, anat: Anatomy, grouping: Grouping): Layout {
  const r = rng(91 + model.notes.length);
  const root: TNode = { name: "2brain", path: "", note: null, children: [] };
  const folderAt = new Map<string, TNode>([["", root]]);
  const folder = (path: string): TNode => {
    const hit = folderAt.get(path);
    if (hit) return hit;
    const parts = path.split("/");
    const parent = folder(parts.slice(0, -1).join("/"));
    const node: TNode = { name: capital(parts[parts.length - 1].replace(/-/g, " ")), path, note: null, children: [] };
    parent.children.push(node);
    folderAt.set(path, node);
    return node;
  };
  model.notes.forEach((n, i) => {
    const parts = n.id.split("/");
    const dir = parts.slice(0, -1).join("/");
    const f = folder(dir);
    if (parts[parts.length - 1] === "index") f.note = i;
    else f.children.push({ name: n.title, path: n.id, note: i, children: [] });
  });
  // folders first, then notes by how linked they are
  const sort = (t: TNode) => {
    t.children.sort((a, b) => {
      const fa = a.children.length > 0 || a.note == null ? 0 : 1;
      const fb = b.children.length > 0 || b.note == null ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const da = a.note != null ? model.notes[a.note].in.length + model.notes[a.note].out.length : 0;
      const db = b.note != null ? model.notes[b.note].in.length + model.notes[b.note].out.length : 0;
      return db - da || a.name.localeCompare(b.name);
    });
    t.children.forEach(sort);
  };
  sort(root);

  const h = hierarchy<TNode>(root, (d) => d.children);
  const leaves = h.leaves().length;
  const depth = h.height || 1;
  const Hh = Math.max(6, leaves * 0.17);
  const Ww = Math.max(6, depth * 3.4);
  const laid = tree<TNode>().size([Hh, Ww]).separation((a, b) => (a.parent === b.parent ? 1 : 1.6))(h);

  const x0 = -Ww / 2;
  const top = FRAME_CY + Hh / 2;
  const at = (p: HierarchyPointNode<TNode>): [number, number] => [x0 + p.y, top - p.x];

  const pos = new Float32Array(model.notes.length * 3);
  const spread = new Float32Array(model.notes.length);
  const labels: LayoutLabel[] = [];
  const seg: number[] = [];
  const segGroup: number[] = [];
  const recPer = new Float32Array(model.notes.length);
  for (let k = 0; k < anat.recCount; k++) recPer[anat.recNote[k]]++;
  const maxRec = Math.max(1, ...recPer);

  laid.each((p) => {
    const [x, y] = at(p);
    const isFolder = p.children && p.children.length > 0;
    const i = p.data.note;
    if (i != null) {
      pos.set([x, y, 0], i * 3);
      spread[i] = (isFolder ? 0.16 : 0.05) + 0.12 * Math.sqrt(recPer[i] / maxRec);
    }
    if (isFolder || i == null) {
      const count = p.leaves().filter((l) => l.data.note != null).length;
      labels.push({ text: p.depth === 0 ? "2brain" : `${p.data.name} · ${count}`, pos: [x, y + 0.02, 0], kind: "box" });
    } else {
      labels.push({ text: p.data.name, pos: [x + 0.16, y, 0], kind: "axis", group: grouping.of[i] });
    }
    if (p.parent) {
      // a soft curve from parent to child
      const [px, py] = at(p.parent);
      const g = i != null ? grouping.of[i] : -1;
      const steps = 10;
      let prev: [number, number] = [px, py];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const e = t * t * (3 - 2 * t);
        const cur: [number, number] = [px + (x - px) * t, py + (y - py) * e];
        seg.push(prev[0], prev[1], 0, cur[0], cur[1], 0);
        segGroup.push(g);
        prev = cur;
      }
    }
  });

  const noteLayout = new Float32Array(pos);
  const recLayout = new Float32Array(anat.recCount * 3);
  for (let k = 0; k < anat.recCount; k++) {
    const i = anat.recNote[k];
    const s = spread[i] || 0.06;
    recLayout[k * 3] = pos[i * 3] - Math.abs(gauss(r)) * s * 1.4;
    recLayout[k * 3 + 1] = pos[i * 3 + 1] + gauss(r) * s * 0.7;
    recLayout[k * 3 + 2] = gauss(r) * s * 0.5;
  }

  const labelW = Math.min(3, Math.max(...model.notes.map((n) => n.title.length)) * 0.075);
  return {
    key: `tree:${leaves}:${depth}`,
    noteLayout,
    recLayout,
    labels,
    frame: { cx: labelW / 2, cy: FRAME_CY - 0.35, w: Ww + labelW + 1.2, h: Hh + 1.6 },
    flat: true,
    scaffold: { pos: new Float32Array(seg), group: new Int32Array(segGroup) },
  };
}
