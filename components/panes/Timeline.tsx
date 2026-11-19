"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, PaneHead, Sect, Switch } from "@/components/ui";
import { monthKey, monthLabel, monthRange, typeLabel } from "@/lib/brain";
import { StackedBars, type Series } from "./charts";

const TYPE_COLORS: Record<string, string> = {
  concept: "#4da3ff",
  synthesis: "#9b7bff",
  "source-summary": "#ffe14d",
  person: "#2ee6d6",
  meta: "#ffffff",
  page: "#ff9f1c",
};

export default function Timeline({ accent, onClose }: PaneProps) {
  const app = useApp();
  const { model, settings, set, colors, lightSet } = app;
  const months = useMemo(() => monthRange(model), [model]);
  const g = model.groups[settings.groupBy];
  const [picked, setPicked] = useState<number | null>(null);

  // areas: the 7 biggest groups, then "other areas", then unsorted
  const area = useMemo(() => {
    const visible = g.list.map((x, i) => ({ ...x, i })).filter((x) => !(settings.hideUnsorted && x.unsorted));
    const top = visible.filter((x) => !x.unsorted).slice(0, 7);
    const topIdx = new Map(top.map((x, k) => [x.i, k]));
    const unsorted = visible.find((x) => x.unsorted);
    const series: Series[] = top.map((x) => ({ key: x.key, label: x.label, color: colors[x.i] }));
    const otherK = series.length;
    const hasOther = visible.some((x) => !x.unsorted && !topIdx.has(x.i));
    if (hasOther) series.push({ key: "__other", label: "Other areas", color: "#ffffff" });
    const unsortedK = series.length;
    if (unsorted) series.push({ key: "__unsorted", label: "Unsorted", color: "transparent", hollow: true });
    const idx = new Map(months.map((m, k) => [m, k]));
    const data = months.map(() => new Array(series.length).fill(0));
    for (const n of model.notes) {
      if (n.date == null) continue;
      const gi = g.of[n.i];
      const grp = g.list[gi];
      if (settings.hideUnsorted && grp.unsorted) continue;
      const k = grp.unsorted ? unsortedK : topIdx.has(gi) ? topIdx.get(gi)! : otherK;
      data[idx.get(monthKey(n.date))!][k]++;
    }
    return { series, data };
  }, [g, colors, months, model, settings.hideUnsorted]);

  const types = useMemo(() => {
    const ts = [...new Set(model.notes.map((n) => n.type))];
    const counts = ts.map((t) => model.notes.filter((n) => n.type === t).length);
    const order = ts.map((t, k) => ({ t, c: counts[k] })).sort((a, b) => b.c - a.c).map((x) => x.t);
    const series: Series[] = order.map((t) => ({ key: t, label: typeLabel(t), color: TYPE_COLORS[t] ?? "#ff6bd6" }));
    const idx = new Map(months.map((m, k) => [m, k]));
    const data = months.map(() => new Array(series.length).fill(0));
    const strip = order.map(() => new Array(months.length).fill(0));
    for (const n of model.notes) {
      if (n.date == null) continue;
      const m = idx.get(monthKey(n.date))!;
      const k = order.indexOf(n.type);
      data[m][k]++;
      strip[k][m]++;
    }
    return { series, data, strip, order };
  }, [model, months]);

  const calendar = useMemo(() => {
    if (model.dateMax == null) return null;
    const day = 86400000;
    const end = Math.floor(model.dateMax / day);
    const startRaw = end - 7 * 53 + 1;
    const start = startRaw - ((new Date(startRaw * day).getUTCDay() + 6) % 7); // monday
    const counts = new Map<number, number>();
    for (const n of model.notes) if (n.date != null) counts.set(Math.floor(n.date / day), (counts.get(Math.floor(n.date / day)) ?? 0) + 1);
    const cells: { d: number; c: number }[] = [];
    for (let d = start; d <= end; d++) cells.push({ d, c: counts.get(d) ?? 0 });
    const monthsMarks: { col: number; label: string }[] = [];
    let last = -1;
    cells.forEach((cell, k) => {
      const m = new Date(cell.d * day).getUTCMonth();
      if (k % 7 === 0 && m !== last) {
        monthsMarks.push({ col: Math.floor(k / 7), label: monthLabel(monthKey(cell.d * day), false) });
        last = m;
      }
    });
    return { cells, monthsMarks, start, end };
  }, [model]);

  const pickMonth = (m: number) => {
    if (picked === m) {
      setPicked(null);
      return;
    }
    setPicked(m);
    const key = months[m];
    lightSet(
      model.notes.filter((n) => n.date != null && monthKey(n.date) === key).map((n) => n.i),
      monthLabel(key),
      "timeline",
    );
  };

  const span = months.length ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : "";

  return (
    <>
      <PaneHead
        title="When you wrote"
        accent={accent}
        onClose={onClose}
        tools={
          <>
            <button type="button" className="btn grow-btn" onClick={() => app.setGrowth({ k: 0, playing: true })} title="Watch the brain grow, note by note (G)">
              Watch it grow
            </button>
            <span>Hide unsorted</span>
            <Switch on={settings.hideUnsorted} onChange={(v) => set("hideUnsorted", v)} label="Hide unsorted" />
          </>
        }
      />
      <div className="pane-body">
        <p className="lede">What you wrote and when, by area and by kind of note. Choose a month to light it in the brain.</p>
        {!months.length && <p className="lede" style={{ color: "var(--dim)" }}>None of your notes carry a “Last updated” date yet.</p>}

        {!!months.length && (
          <>
            <Sect label={`Activity, by area, ${span}`} accent={accent}>
              <StackedBars months={months} series={area.series} data={area.data} onPick={pickMonth} picked={picked} />
              <div className="chart-keys">
                {area.series.map((s) => (
                  <span key={s.key}>
                    <Dot c={s.color} hollow={s.hollow} />
                    {s.label}
                  </span>
                ))}
              </div>
            </Sect>

            <Sect label={`Concepts, people, sources and syntheses, ${span}`} accent={accent}>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", rowGap: 6, alignItems: "center", fontSize: 12 }}>
                {types.order.map((t, k) => {
                  const row = types.strip[k];
                  const max = Math.max(1, ...row);
                  return (
                    <div key={t} style={{ display: "contents" }}>
                      <span>{typeLabel(t)}</span>
                      <svg viewBox={`0 0 ${months.length * 10} 12`} preserveAspectRatio="none" style={{ width: "100%", height: 12 }}>
                        <path d={`M0,6H${months.length * 10}`} stroke="var(--hair)" />
                        {row.map((v, m) =>
                          v ? <rect key={m} x={m * 10 + 2} y={6 - (v / max) * 5.5} width={6} height={(v / max) * 11 + 0.5} fill={TYPE_COLORS[t] ?? "#ff6bd6"} /> : null,
                        )}
                      </svg>
                    </div>
                  );
                })}
              </div>
            </Sect>

            {calendar && (
              <Sect label="Days you wrote, the last year of the record" accent={accent}>
                <div style={{ position: "relative", height: 14, fontSize: 10.5 }}>
                  {calendar.monthsMarks.map((m) => (
                    <span key={m.col} style={{ position: "absolute", left: m.col * 11 }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="calendar" role="img" aria-label="One square per day; lit days have notes">
                  {calendar.cells.map((c) => (
                    <i
                      key={c.d}
                      className={c.c > 1 ? "hi" : c.c ? "on" : undefined}
                      title={c.c ? `${new Date(c.d * 86400000).toUTCString().slice(5, 16)} · ${c.c} note${c.c > 1 ? "s" : ""}` : undefined}
                    />
                  ))}
                </div>
              </Sect>
            )}

            <Sect label="Each month, by kind of note" accent={accent}>
              <StackedBars months={months} series={types.series} data={types.data} height={130} onPick={pickMonth} picked={picked} />
              <div className="chart-keys">
                {types.series.map((s) => (
                  <span key={s.key}>
                    <Dot c={s.color} />
                    {s.label}
                  </span>
                ))}
              </div>
            </Sect>
          </>
        )}
      </div>
    </>
  );
}
