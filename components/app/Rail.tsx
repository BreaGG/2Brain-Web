"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useApp, NAV, ADD_ACCENT } from "./context";
import { Icon, Wordmark } from "@/components/ui";
import { SPECTRUM } from "@/lib/palettes";

export default function Rail({ open, onHome }: { open: boolean; onHome: () => void }) {
  const { pane, openPane, openCommand, model } = useApp();

  const figs = useMemo(() => {
    const N = model.notes.length || 1;
    const real = model.notes.filter((n) => !n.isIndex);
    const R = real.length || 1;
    const sorted = real.filter((n) => n.domain !== "uncategorized" && n.type !== "page").length;
    const linked = real.filter((n) => n.in.length + n.out.length > 0).length;
    const orphans = real.filter((n) => n.in.length === 0).length;
    const issues = model.ghostSlugs.length + orphans + real.filter((n) => n.date == null).length;
    return {
      sorted: Math.round((sorted / R) * 100),
      linked: Math.round((linked / R) * 100),
      issues,
      reviewPct: Math.round(Math.min(1, issues / N) * 100),
    };
  }, [model]);

  return (
    <nav className={`rail${open ? " open" : ""}`} aria-label="Your record">
      <div className="brand">
        <button type="button" onClick={onHome} title="Back to the brain and the whole record" style={{ width: "fit-content" }}>
          <Wordmark />
        </button>
        <span className="brand-dash" aria-hidden>
          {[0, 1, 4].map((k) => (
            <i key={k} style={{ "--c": SPECTRUM[k] } as CSSProperties} />
          ))}
        </span>
      </div>

      <button type="button" className="rail-bar" onClick={() => openCommand()} aria-keyshortcuts="Meta+K" title="Search, open or run a command">
        <Icon name="search" size={12} />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="views">
        {NAV.map((n) => {
          const current = n.id === "brain" ? pane == null : pane === n.id;
          return (
            <button
              key={n.id}
              type="button"
              aria-current={current}
              title={n.hint}
              style={{ "--accent": n.accent === "spectrum" ? "transparent" : n.accent } as CSSProperties}
              className={n.accent === "spectrum" ? "spectrum-accent" : undefined}
              onClick={() => openPane(n.id === "brain" ? null : n.id)}
            >
              {n.label}
            </button>
          );
        })}
        <button
          type="button"
          className="add"
          aria-current={pane === "add"}
          style={{ "--accent": ADD_ACCENT } as CSSProperties}
          onClick={() => openPane("add")}
        >
          <Icon name="plus" size={12} /> Add
        </button>
      </div>

      <RailBrain />

      <div className="rail-figs">
        <button type="button" className="fig" onClick={() => openPane("numbers")} title="Notes filed under a domain and a type">
          <Icon name="tag" size={11} />
          <span className="fig-track">
            <i style={{ width: `${figs.sorted}%` }} />
          </span>
          <span>Sorted {figs.sorted}%</span>
        </button>
        <button type="button" className="fig" onClick={() => openPane("you")} title="Notes with at least one link">
          <Icon name="cycle" size={11} />
          <span className="fig-track">
            <i style={{ width: `${figs.linked}%` }} />
          </span>
          <span>Linked {figs.linked}%</span>
        </button>
        <button type="button" className="fig" onClick={() => openPane("review")} title="Ghost links, orphans and undated notes">
          <Icon name="doc" size={11} />
          <span className="fig-track">
            <i style={{ width: `${figs.reviewPct}%`, background: "var(--ink)" }} />
          </span>
          <span>Review {figs.issues}</span>
        </button>
        <div className="rail-status">
          <svg width="18" height="18" viewBox="0 0 18 18" className="ring-spin" aria-hidden>
            {Array.from({ length: 12 }, (_, k) => {
              const a = (k / 12) * Math.PI * 2;
              return <circle key={k} cx={(9 + Math.cos(a) * 6.5).toFixed(2)} cy={(9 + Math.sin(a) * 6.5).toFixed(2)} r={1.15} fill={SPECTRUM[k % 8]} />;
            })}
          </svg>
          <span>{model.notes.length} notes · live</span>
        </div>
      </div>
    </nav>
  );
}

/** A small flat brain of the groups: one dot per group, coloured, linked by shared links. */
function RailBrain() {
  const { model, colors, groupOf, settings, setFocus, focus } = useApp();
  const ref = useRef<HTMLCanvasElement>(null);
  const grouping = model.groups[settings.groupBy];

  const graph = useMemo(() => {
    const G = grouping.list.length;
    // place nodes inside a brain silhouette (two lobes + stem) with a seeded spiral
    const nodes: { x: number; y: number; g: number }[] = [];
    const per = Math.max(3, Math.min(9, Math.round(60 / Math.max(1, G))));
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let g = 0; g < G; g++) {
      for (let k = 0; k < per; k++) {
        for (let tries = 0; tries < 40; tries++) {
          const x = r() * 2 - 1;
          const y = r() * 2 - 1;
          const inBrain = (x / 1) ** 2 + ((y + 0.05) / 0.78) ** 2 < 1 && !(y > 0.55 && Math.abs(x) < 0.08);
          if (inBrain) {
            nodes.push({ x, y, g });
            break;
          }
        }
      }
    }
    // stem
    nodes.push({ x: 0.08, y: 0.9, g: 0 }, { x: 0.05, y: 1.08, g: 1 % Math.max(1, G) });
    const edges: [number, number][] = [];
    nodes.forEach((a, i) => {
      const near = nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter((o) => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 3);
      for (const o of near) if (o.j > i) edges.push([i, o.j]);
    });
    return { nodes, edges };
  }, [grouping]);

  const litGroups = useMemo(() => {
    if (focus.kind === "groups" && focus.groupBy === settings.groupBy) return new Set(focus.keys);
    if (focus.kind === "note") return new Set([groupOf[focus.i]]);
    return null;
  }, [focus, groupOf, settings.groupBy]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;
      c.width = w * dpr;
      c.height = h * dpr;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = Math.min(w / 2.3, h / 2.6);
      const cx = w / 2;
      const cy = Math.min(h / 2, s * 1.3);
      const P = graph.nodes.map((n) => [cx + n.x * s, cy + n.y * s]);
      ctx.lineWidth = 0.6;
      for (const [a, b] of graph.edges) {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.moveTo(P[a][0], P[a][1]);
        ctx.lineTo(P[b][0], P[b][1]);
        ctx.stroke();
      }
      graph.nodes.forEach((n, i) => {
        const on = !litGroups || litGroups.has(n.g);
        ctx.globalAlpha = on ? 1 : 0.25;
        ctx.fillStyle = colors[n.g] ?? "#fff";
        ctx.beginPath();
        ctx.arc(P[i][0], P[i][1], on && litGroups ? 2.6 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [graph, colors, litGroups]);

  return (
    <div className="rail-brain">
      <canvas
        ref={ref}
        aria-label="Your groups"
        onClick={(e) => {
          const c = ref.current!;
          const rect = c.getBoundingClientRect();
          const w = rect.width;
          const h = rect.height;
          const s = Math.min(w / 2.3, h / 2.6);
          const cx = w / 2;
          const cy = Math.min(h / 2, s * 1.3);
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best = -1;
          let bd = 14 * 14;
          graph.nodes.forEach((n, i) => {
            const d = (cx + n.x * s - x) ** 2 + (cy + n.y * s - y) ** 2;
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          if (best < 0) return setFocus({ kind: "none" });
          setFocus({ kind: "groups", groupBy: settings.groupBy, keys: [graph.nodes[best].g] });
        }}
      />
    </div>
  );
}
