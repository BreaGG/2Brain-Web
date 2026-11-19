"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, PaneHead, Sect } from "@/components/ui";
import { fmtDate, singularType, type Note } from "@/lib/brain";

const DAY = 86400000;

/** A note's day as YYYY-MM-DD (dates come from "Last updated", a calendar day). */
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The visitor's own calendar day, n days back, as YYYY-MM-DD. */
function localDay(back = 0) {
  const d = new Date();
  d.setDate(d.getDate() - back);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const weekday = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export default function Today({ accent, onClose }: PaneProps) {
  const { model, openNote, colorOf, lightSet } = useApp();
  const [all, setAll] = useState(false);

  const data = useMemo(() => {
    const byDay = new Map<string, Note[]>();
    for (const n of model.notes) {
      if (n.date == null) continue;
      const k = dayOf(n.date);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(n);
    }
    const today = localDay();
    const todays = byDay.get(today) ?? [];
    // the last day with something written, when today has nothing yet
    const lastDay = [...byDay.keys()].filter((k) => k < today).sort().pop() ?? null;
    const week = Array.from({ length: 7 }, (_, k) => {
      const day = localDay(6 - k);
      return { day, notes: byDay.get(day) ?? [] };
    });
    // hubs that have waited longest for a visit
    const now = Date.now();
    const revisit = model.notes
      .filter((n) => !n.isIndex && n.date != null && n.in.length >= 2 && now - n.date > 14 * DAY)
      .sort((a, b) => b.in.length * Math.log(2 + (now - b.date!) / DAY) - a.in.length * Math.log(2 + (now - a.date!) / DAY))
      .slice(0, 4);
    return { today, todays, lastDay, lastNotes: lastDay ? byDay.get(lastDay)! : [], week, revisit };
  }, [model]);

  const shown = data.todays.length ? data.todays : data.lastNotes;

  // opening Today lights what was written today (or on the last day of writing)
  useEffect(() => {
    if (shown.length) lightSet(shown.map((n) => n.i), data.todays.length ? "today" : `your last day of writing, ${fmtDate(shown[0].date)}`, "today");
    // only on opening, and when the record changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const maxWeek = Math.max(1, ...data.week.map((d) => d.notes.length));
  const wroteThisWeek = data.week.reduce((s, d) => s + d.notes.length, 0);

  const list = (notes: Note[]) => (
    <div className="rows">
      {notes.map((n) => (
        <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)} style={{ "--c": colorOf(n.i) } as CSSProperties}>
          <Dot c={colorOf(n.i)} />
          <span className="grow">{n.title}</span>
          <span className="count">{singularType(n.type)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PaneHead title="Today" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <p className="label" style={{ color: "var(--dim)" }}>{longDate}</p>
        {data.todays.length ? (
          <>
            <div className="today-big" style={{ color: accent }}>{data.todays.length}</div>
            <p style={{ fontSize: 13, marginTop: 6 }}>
              note{data.todays.length === 1 ? "" : "s"} written or updated today, lit in the brain.
            </p>
          </>
        ) : (
          <p className="lede" style={{ marginTop: 12 }}>
            Nothing new today yet.
            {data.lastDay ? ` Your last day of writing was ${fmtDate(data.lastNotes[0].date)}; its notes are lit in the brain.` : ""}
          </p>
        )}

        <Sect label={`This week · ${wroteThisWeek} note${wroteThisWeek === 1 ? "" : "s"}`} accent={accent}>
          <div className="today-week">
            {data.week.map((d) => (
              <button
                key={d.day}
                type="button"
                disabled={!d.notes.length}
                aria-current={d.day === data.today ? "date" : undefined}
                title={`${d.notes.length} note${d.notes.length === 1 ? "" : "s"}`}
                onClick={() => lightSet(d.notes.map((n) => n.i), fmtDate(d.notes[0].date), "today")}
              >
                <span className="bar">
                  <i style={{ height: `${(d.notes.length / maxWeek) * 100}%`, background: accent }} />
                </span>
                <span className="label">{weekday(d.day)}</span>
                <span className="n">{d.notes.length || "·"}</span>
              </button>
            ))}
          </div>
        </Sect>

        {shown.length > 0 && (
          <Sect
            label={data.todays.length ? "Today" : `Last day of writing · ${fmtDate(shown[0].date)}`}
            accent={accent}
            aside={
              <button type="button" className="link" onClick={() => lightSet(shown.map((n) => n.i), data.todays.length ? "today" : "your last day of writing", "today")}>
                Light them
              </button>
            }
          >
            {list(all ? shown : shown.slice(0, 8))}
            {shown.length > 8 && (
              <button type="button" className="link" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${shown.length}`}
              </button>
            )}
          </Sect>
        )}

        {data.revisit.length > 0 && (
          <Sect label="Worth a visit" accent={accent}>
            <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>Notes many others lean on that have not been touched in a while.</p>
            <div className="rows">
              {data.revisit.map((n) => (
                <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)} style={{ "--c": colorOf(n.i) } as CSSProperties}>
                  <Dot c={colorOf(n.i)} />
                  <span className="grow">{n.title}</span>
                  <span className="count">
                    {n.in.length} in · {fmtDate(n.date)}
                  </span>
                </button>
              ))}
            </div>
          </Sect>
        )}
      </div>
    </>
  );
}
