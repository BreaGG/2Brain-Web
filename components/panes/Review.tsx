"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, PaneHead, Sect } from "@/components/ui";
import { fmtDate } from "@/lib/brain";

export default function Review({ accent, onClose }: PaneProps) {
  const { model, openNote, colorOf, lightSet, set, settings } = useApp();
  const [more, setMore] = useState<Record<string, boolean>>({});

  const lists = useMemo(() => {
    const real = model.notes.filter((n) => !n.isIndex);
    return {
      orphans: real.filter((n) => n.in.length === 0).sort((a, b) => a.title.localeCompare(b.title)),
      missing: real
        .map((n) => ({
          n,
          gaps: [
            n.type === "page" ? "type" : null,
            n.domain === "uncategorized" ? "domain" : null,
            n.date == null ? "date" : null,
          ].filter(Boolean) as string[],
        }))
        .filter((x) => x.gaps.length),
      oldest: real
        .filter((n) => n.date != null)
        .sort((a, b) => (a.date ?? 0) - (b.date ?? 0))
        .slice(0, 10),
      thin: real.filter((n) => n.words < 40).sort((a, b) => a.words - b.words),
    };
  }, [model]);

  const total = model.ghostSlugs.length + lists.orphans.length + lists.missing.length;
  const cap = (k: string, n: number) => (more[k] ? n : Math.min(n, 8));
  const More = ({ k, n }: { k: string; n: number }) =>
    n > 8 ? (
      <button type="button" className="link" style={{ marginTop: 8, fontSize: 12.5 }} onClick={() => setMore((m) => ({ ...m, [k]: !m[k] }))}>
        {more[k] ? "Fewer" : `All ${n}`}
      </button>
    ) : null;

  return (
    <>
      <PaneHead title="Review your notes" accent="spectrum" onClose={onClose} />
      <div className="pane-body">
        <p className="lede">
          What would make the brain tidier. {total ? `${total} things to look at.` : "Nothing to fix right now."} Each one opens the note it concerns, or lights it in the brain.
        </p>

        <Sect
          label={`Ghost links · ${model.ghostSlugs.length}`}
          accent="var(--l0)"
          aside={
            model.ghostSlugs.length ? (
              <button type="button" className="link" onClick={() => set("ghosts", !settings.ghosts)}>
                {settings.ghosts ? "Hide in brain" : "Show in brain"}
              </button>
            ) : null
          }
        >
          <p style={{ marginBottom: 10 }}>Pages your notes link to that have not been written yet.</p>
          <div className="rows">
            {model.ghostSlugs.slice(0, cap("ghosts", model.ghostSlugs.length)).map((g) => (
              <button key={g.slug} type="button" className="row" onClick={() => lightSet(g.from, `notes linking to ${g.slug}`, "review")}>
                <Dot c="transparent" hollow />
                <span className="grow" style={{ textDecorationStyle: "dashed" }}>
                  {g.slug}
                </span>
                <span className="count">
                  from {g.from.length === 1 ? model.notes[g.from[0]].title : `${g.from.length} notes`}
                </span>
              </button>
            ))}
          </div>
          <More k="ghosts" n={model.ghostSlugs.length} />
        </Sect>

        <Sect
          label={`Orphans · ${lists.orphans.length}`}
          accent="var(--l2)"
          aside={
            lists.orphans.length ? (
              <button type="button" className="link" onClick={() => lightSet(lists.orphans.map((n) => n.i), "orphans", "review")}>
                Light them
              </button>
            ) : null
          }
        >
          <p style={{ marginBottom: 10 }}>No other note links here yet.</p>
          <div className="rows">
            {lists.orphans.slice(0, cap("orphans", lists.orphans.length)).map((n) => (
              <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)}>
                <Dot c={colorOf(n.i)} />
                <span className="grow">{n.title}</span>
                <span className="count">{n.out.length} out</span>
              </button>
            ))}
          </div>
          <More k="orphans" n={lists.orphans.length} />
        </Sect>

        <Sect label={`Missing fields · ${lists.missing.length}`} accent="var(--l4)">
          <p style={{ marginBottom: 10 }}>
            Notes without a <b>**Type:**</b>, <b>**Domain:**</b> or <b>**Last updated:**</b> line.
          </p>
          <div className="rows">
            {lists.missing.slice(0, cap("missing", lists.missing.length)).map(({ n, gaps }) => (
              <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)}>
                <Dot c={colorOf(n.i)} />
                <span className="grow">{n.title}</span>
                <span className="count">no {gaps.join(", ")}</span>
              </button>
            ))}
          </div>
          <More k="missing" n={lists.missing.length} />
        </Sect>

        <Sect label="Longest untouched" accent="var(--l6)">
          <div className="rows">
            {lists.oldest.map((n) => (
              <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)}>
                <Dot c={colorOf(n.i)} />
                <span className="grow">{n.title}</span>
                <span className="count">{fmtDate(n.date)}</span>
              </button>
            ))}
          </div>
        </Sect>

        {!!lists.thin.length && (
          <Sect label={`Thin notes · ${lists.thin.length}`} accent="var(--l7)">
            <p style={{ marginBottom: 10 }}>Fewer than forty words.</p>
            <div className="rows">
              {lists.thin.slice(0, cap("thin", lists.thin.length)).map((n) => (
                <button key={n.id} type="button" className="row" onClick={() => openNote(n.i)}>
                  <Dot c={colorOf(n.i)} />
                  <span className="grow">{n.title}</span>
                  <span className="count">{n.words} words</span>
                </button>
              ))}
            </div>
            <More k="thin" n={lists.thin.length} />
          </Sect>
        )}
      </div>
    </>
  );
}
