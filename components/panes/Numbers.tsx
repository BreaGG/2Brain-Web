"use client";

import { useMemo, type CSSProperties } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { PaneHead, Sect, Switch } from "@/components/ui";
import { GROUP_BY_LABEL, fmtInt, monthKey, monthLabel, monthRange, typeLabel } from "@/lib/brain";
import { Sparkline, squarify } from "./charts";

export default function Numbers({ accent, onClose }: PaneProps) {
  const { model, settings, set, colors, setFocus, lightSet } = useApp();
  const g = model.groups[settings.groupBy];
  const months = useMemo(() => monthRange(model), [model]);

  const stats = useMemo(() => {
    const perMonthNotes = new Map<number, number>();
    const perMonthWords = new Map<number, number>();
    const days = new Set<number>();
    const perMonthDays = new Map<number, Set<number>>();
    let dated = 0;
    for (const n of model.notes) {
      if (n.date == null) continue;
      dated++;
      const m = monthKey(n.date);
      perMonthNotes.set(m, (perMonthNotes.get(m) ?? 0) + 1);
      perMonthWords.set(m, (perMonthWords.get(m) ?? 0) + n.words);
      const d = Math.floor(n.date / 86400000);
      days.add(d);
      if (!perMonthDays.has(m)) perMonthDays.set(m, new Set());
      perMonthDays.get(m)!.add(d);
    }
    return {
      dated,
      days: days.size,
      sparkNotes: months.map((m) => perMonthNotes.get(m) ?? 0),
      sparkWords: months.map((m) => perMonthWords.get(m) ?? 0),
      sparkDays: months.map((m) => perMonthDays.get(m)?.size ?? 0),
    };
  }, [model, months]);

  const visible = g.list.map((x, i) => ({ ...x, i })).filter((x) => !(settings.hideUnsorted && x.unsorted));
  const W = 470;
  const H = 236;
  const rects = squarify(visible.map((x) => x.words || x.notes), W, H);
  const maxWords = Math.max(1, ...visible.map((x) => x.words));

  const types = useMemo(() => {
    const m = new Map<string, { notes: number; words: number }>();
    for (const n of model.notes) {
      const e = m.get(n.type) ?? { notes: 0, words: 0 };
      e.notes++;
      e.words += n.words;
      m.set(n.type, e);
    }
    return [...m.entries()].sort((a, b) => b[1].notes - a[1].notes);
  }, [model]);
  const maxType = Math.max(1, ...types.map((t) => t[1].notes));

  const lightGroup = (i: number) => setFocus({ kind: "groups", groupBy: settings.groupBy, keys: [i] });
  const span = months.length ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}` : "undated";

  return (
    <>
      <PaneHead
        title="The numbers"
        accent={accent}
        onClose={onClose}
        tools={
          <>
            <span>Hide unsorted</span>
            <Switch on={settings.hideUnsorted} onChange={(v) => set("hideUnsorted", v)} label="Hide unsorted" />
          </>
        }
      />
      <div className="pane-body">
        <div className="stat-grid">
          <Stat n={model.notes.length} label="Notes" />
          <Stat n={model.totalWords} label="Words" />
          <Stat n={model.links.length} label="Links" />
          <Stat n={model.groups.folder.list.length} label="Folders" />
          <Stat n={months.length} label="Months" />
          <Stat n={model.ghostSlugs.length} label="Ghost links" />
        </div>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <Stat n={stats.dated} label="Dated notes" spark={stats.sparkNotes} />
          <Stat n={model.passages} label="Passages in the record" spark={stats.sparkWords} />
          <Stat n={stats.days} label="Days written" spark={stats.sparkDays} />
        </div>

        <Sect label={`${GROUP_BY_LABEL[settings.groupBy]}s, ${span}`} accent={accent}>
          <div className="treemap" style={{ height: H }}>
            {rects.map((r) => {
              const x = visible[r.i];
              const big = r.w > 64 && r.h > 34;
              return (
                <button
                  key={x.key}
                  type="button"
                  className={x.unsorted ? "unsorted" : undefined}
                  style={{
                    left: `${(r.x / W) * 100}%`,
                    top: r.y,
                    width: `${(r.w / W) * 100}%`,
                    height: r.h,
                    background: colors[x.i],
                    padding: big ? undefined : 0,
                  }}
                  title={`${x.label}: ${fmtInt(x.words)} words in ${x.notes} notes`}
                  onClick={() => lightGroup(x.i)}
                >
                  {big && (
                    <>
                      <b>{x.label}</b>
                      {fmtInt(x.words)}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="bars">
            {visible
              .slice()
              .sort((a, b) => b.words - a.words)
              .map((x) => (
                <button key={x.key} type="button" className="bar-row" onClick={() => lightGroup(x.i)}>
                  <span>{x.label}</span>
                  <span className="track">
                    <i className={x.unsorted ? "hollow" : undefined} style={{ width: `${(x.words / maxWords) * 100}%`, "--c": colors[x.i] } as CSSProperties} />
                  </span>
                  <span>{fmtInt(x.words)}</span>
                </button>
              ))}
          </div>
        </Sect>

        <Sect label="Types" accent={accent}>
          <div className="bars" style={{ marginTop: 0 }}>
            {types.map(([t, v], k) => (
              <button
                key={t}
                type="button"
                className="bar-row"
                onClick={() => lightSet(model.notes.filter((n) => n.type === t).map((n) => n.i), typeLabel(t), "numbers")}
              >
                <span>{typeLabel(t)}</span>
                <span className="track">
                  <i style={{ width: `${(v.notes / maxType) * 100}%`, "--c": `var(--l${(k * 2 + 4) % 8})` } as CSSProperties} />
                </span>
                <span>{v.notes}</span>
              </button>
            ))}
          </div>
        </Sect>

        <Sect label="Links" accent={accent}>
          <p>
            {fmtInt(model.links.length)} links join {fmtInt(model.notes.filter((n) => n.in.length + n.out.length > 0).length)} notes. On average a note links to{" "}
            {(model.links.length / Math.max(1, model.notes.length)).toFixed(1)} others; {model.ghostSlugs.length} link targets have no page yet.
          </p>
        </Sect>
      </div>
    </>
  );
}

function Stat({ n, label, spark }: { n: number; label: string; spark?: number[] }) {
  return (
    <div className="stat">
      <b>{fmtInt(n)}</b>
      <span className="label">{label}</span>
      {spark && <Sparkline values={spark} />}
    </div>
  );
}
