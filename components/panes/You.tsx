"use client";

import { useMemo, type CSSProperties } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, PaneHead, Sect } from "@/components/ui";
import { fmtInt, monthKey, monthRange, singularType } from "@/lib/brain";
import { SPECTRUM } from "@/lib/palettes";
import { StackedBars } from "./charts";

const OWN = new Set(["concept", "synthesis", "page"]);

const FACTORS = [
  { key: "momentum", label: "momentum", color: SPECTRUM[0] },
  { key: "returned", label: "returned to", color: SPECTRUM[1] },
  { key: "open", label: "still open", color: SPECTRUM[2] },
  { key: "bridges", label: "bridges", color: SPECTRUM[3] },
  { key: "areas", label: "areas spanned", color: SPECTRUM[4] },
  { key: "size", label: "depth", color: SPECTRUM[5] },
] as const;

export default function You({ accent, onClose }: PaneProps) {
  const { model, openNote, colorOf, lightSet } = useApp();
  const months = useMemo(() => monthRange(model), [model]);

  const own = useMemo(() => {
    let yours = 0;
    let sources = 0;
    for (const n of model.notes) {
      if (n.isIndex) continue;
      if (OWN.has(n.type)) yours += n.words;
      else sources += n.words;
    }
    const pct = Math.round((yours / Math.max(1, yours + sources)) * 100);
    return { yours, sources, pct };
  }, [model]);

  const ranked = useMemo(() => {
    const now = model.dateMax ?? Date.now();
    const fg = model.groups.folder.of;
    const real = model.notes.filter((n) => !n.isIndex);
    const maxWords = Math.max(1, ...real.map((n) => n.words));
    const maxIn = Math.max(1, ...real.map((n) => n.in.length));
    const rows = real.map((n) => {
      const age = n.date == null ? 1 : Math.min(1, (now - n.date) / (365 * 86400000));
      const nbrs = [...n.in, ...n.out];
      const cross = nbrs.filter((j) => fg[j] !== fg[n.i]).length;
      const areas = new Set(nbrs.map((j) => fg[j])).size;
      const f = {
        momentum: 1 - age,
        returned: n.in.length / maxIn,
        open: Math.min(1, n.ghosts.length / 2),
        bridges: Math.min(1, cross / 4),
        areas: Math.min(1, areas / 4),
        size: n.words / maxWords,
      };
      const score = f.momentum * 1.2 + f.returned * 1.4 + f.open * 0.8 + f.bridges + f.areas * 0.6 + f.size * 0.5;
      return { n, f, score };
    });
    return rows.sort((a, b) => b.score - a.score).slice(0, 12);
  }, [model]);
  const maxScore = Math.max(0.001, ...ranked.map((r) => r.score));

  const hubs = useMemo(
    () => [...model.notes].sort((a, b) => b.in.length - a.in.length || b.out.length - a.out.length).slice(0, 8),
    [model],
  );

  const overTime = useMemo(() => {
    const idx = new Map(months.map((m, k) => [m, k]));
    const data = months.map(() => [0, 0]);
    for (const n of model.notes) {
      if (n.date == null || n.isIndex) continue;
      data[idx.get(monthKey(n.date))!][OWN.has(n.type) ? 0 : 1] += n.words;
    }
    return data;
  }, [model, months]);

  return (
    <>
      <PaneHead title="You, in your record" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <div style={{ fontSize: 46, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--l5)" }}>{own.pct}%</div>
        <p style={{ fontSize: 13, marginTop: 6 }}>of the words in your notes are your own thinking — concepts and syntheses rather than summaries of sources and people.</p>
        <div style={{ display: "flex", height: 12, marginTop: 18 }}>
          <i style={{ width: `${own.pct}%`, background: "var(--l5)" }} />
          <i style={{ flex: 1, background: "var(--l6)" }} />
        </div>
        <div className="chart-keys">
          <span>
            <Dot c="var(--l5)" />
            yours {fmtInt(own.yours)}
          </span>
          <span>
            <Dot c="var(--l6)" />
            from sources and people {fmtInt(own.sources)}
          </span>
        </div>

        <Sect label="What to work on next" accent={accent}>
          <div className="label link" style={{ marginBottom: 10, width: "fit-content" }} title="Momentum: updated recently. Returned to: other notes point here. Still open: links to pages not yet written. Bridges: links across folders. Areas spanned: how many folders it touches. Depth: length.">
            How it ranks
          </div>
          <div className="rows">
            {ranked.map((r, k) => (
              <button key={r.n.id} type="button" className="rank" onClick={() => openNote(r.n.i)}>
                <span>
                  {k + 1}. {r.n.title}
                </span>
                <span className="stack" style={{ width: `${(r.score / maxScore) * 100}%` }}>
                  {FACTORS.map((f) => {
                    const w = r.f[f.key];
                    return w > 0.01 ? <i key={f.key} style={{ flex: w, background: f.color }} /> : null;
                  })}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <Dot c={colorOf(r.n.i)} />
                  {singularType(r.n.type)}
                </span>
              </button>
            ))}
          </div>
          <div className="chart-keys" style={{ fontSize: 11 }}>
            {FACTORS.map((f) => (
              <span key={f.key}>
                <Dot c={f.color} />
                {f.label}
              </span>
            ))}
          </div>
        </Sect>

        <Sect label="Your hubs" accent={accent} aside={<button type="button" className="link" onClick={() => lightSet(hubs.map((h) => h.i), "your hubs", "you")}>Light them</button>}>
          <div className="rows">
            {hubs.map((n) => (
              <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)} style={{ "--c": colorOf(n.i) } as CSSProperties}>
                <Dot c={colorOf(n.i)} />
                <span className="grow">{n.title}</span>
                <span className="count">
                  {n.in.length} in · {n.out.length} out
                </span>
              </button>
            ))}
          </div>
        </Sect>

        {!!months.length && (
          <Sect label="Whose words, over time" accent={accent}>
            <StackedBars
              months={months}
              series={[
                { key: "own", label: "yours", color: "var(--l5)" },
                { key: "src", label: "sources", color: "var(--l6)" },
              ]}
              data={overTime}
              height={90}
            />
            <div className="chart-keys">
              <span>
                <Dot c="var(--l5)" />
                your own thinking
              </span>
              <span>
                <Dot c="var(--l6)" />
                sources and people
              </span>
            </div>
          </Sect>
        )}
      </div>
    </>
  );
}
