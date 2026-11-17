/** Squarified treemap layout → rectangles in a [0,W]×[0,H] box. */
export function squarify(values: number[], W: number, H: number) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const items = values.map((v, i) => ({ i, a: (v / total) * W * H })).filter((x) => x.a > 0);
  const out: { i: number; x: number; y: number; w: number; h: number }[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let row: typeof items = [];
  const worst = (r: typeof items, side: number) => {
    const s = r.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...r.map((q) => q.a));
    const mn = Math.min(...r.map((q) => q.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const flush = () => {
    const s = row.reduce((a, b) => a + b.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) {
        const ch = r.a / cw;
        out.push({ i: r.i, x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let cx = x;
      for (const r of row) {
        const cw = r.a / ch;
        out.push({ i: r.i, x: cx, y, w: cw, h: ch });
        cx += cw;
      }
      y += ch;
      h -= ch;
    }
    row = [];
  };
  for (const it of items) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
    else {
      flush();
      row.push(it);
    }
  }
  if (row.length) flush();
  return out;
}
