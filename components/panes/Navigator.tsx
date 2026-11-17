"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, Icon, PaneHead } from "@/components/ui";
import { capital, fmtDay, monthKey, monthLabel, singularType, typeLabel, type Note } from "@/lib/brain";
import { groupCss } from "@/lib/palettes";

type Sort = "new" | "az" | "links";

export default function Navigator({ accent, onClose }: PaneProps) {
  const { model, openNote, lightSet, setFocus, noteIdx } = useApp();
  const fg = model.groups.folder;
  const [folder, setFolder] = useState<number | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [open, setOpen] = useState({ folders: true, types: true, months: false });

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of model.notes) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [model]);

  const months = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of model.notes) if (n.date != null) m.set(monthKey(n.date), (m.get(monthKey(n.date)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [model]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let l = model.notes.filter(
      (n) =>
        (folder == null || fg.of[n.i] === folder) &&
        (type == null || n.type === type) &&
        (month == null || (n.date != null && monthKey(n.date) === month)) &&
        (!t || n.title.toLowerCase().includes(t) || n.id.includes(t) || n.excerpt.toLowerCase().includes(t)),
    );
    if (sort === "new") l = l.sort((a, b) => (b.date ?? -Infinity) - (a.date ?? -Infinity) || a.title.localeCompare(b.title));
    if (sort === "az") l = l.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "links") l = l.sort((a, b) => b.in.length + b.out.length - (a.in.length + a.out.length));
    return l;
  }, [model, folder, type, month, q, sort, fg]);

  const periods = useMemo(() => {
    if (sort !== "new") return [{ label: sort === "az" ? "A to Z" : "Most linked", items: list }];
    const now = Date.now();
    const day = 86400000;
    const buckets = new Map<string, Note[]>();
    const order: string[] = [];
    for (const n of list) {
      let k: string;
      if (n.date == null) k = "Undated";
      else if (now - n.date < 30 * day) k = "Previous 30 days";
      else if (now - n.date < 365 * day) k = monthLabel(monthKey(n.date));
      else k = String(new Date(n.date).getUTCFullYear());
      if (!buckets.has(k)) {
        buckets.set(k, []);
        order.push(k);
      }
      buckets.get(k)!.push(n);
    }
    return order.map((k) => ({ label: k, items: buckets.get(k)! }));
  }, [list, sort]);

  const pickFolder = (gi: number | null) => {
    setFolder(gi);
    if (gi == null) setFocus({ kind: "none" });
    else setFocus({ kind: "groups", groupBy: "folder", keys: [gi] });
  };

  const total = model.notes.length;
  const title = folder == null ? "2brain" : fg.list[folder].label;
  const { colors: folderColors } = useFolderColors();

  return (
    <>
      <PaneHead title="Navigator" accent={accent} onClose={onClose} />
      {/* phones: folders and types as a row of chips instead of a column */}
      <div className="nav-chips" role="group" aria-label="Folders and types">
        <button type="button" aria-pressed={folder == null && type == null} onClick={() => { pickFolder(null); setType(null); }}>
          All · {total}
        </button>
        {fg.list.map((g, gi) => (
          <button key={g.key} type="button" aria-pressed={folder === gi} onClick={() => pickFolder(folder === gi ? null : gi)}>
            <Dot c={folderColors[gi]} hollow={g.unsorted} />
            {g.label} · {g.notes}
          </button>
        ))}
        {types.map(([t, c]) => (
          <button
            key={t}
            type="button"
            className="type"
            aria-pressed={type === t}
            onClick={() => {
              const next = type === t ? null : t;
              setType(next);
              if (next) lightSet(model.notes.filter((n) => n.type === next).map((n) => n.i), typeLabel(next), "navigator");
              else setFocus({ kind: "none" });
            }}
          >
            {typeLabel(t)} · {c}
          </button>
        ))}
      </div>
      <div className="nav-split">
        <div className="nav-col">
          <ColHead label="Folders" open={open.folders} onToggle={() => setOpen((o) => ({ ...o, folders: !o.folders }))} />
          {open.folders && (
            <>
              <button type="button" className="nav-folder" aria-pressed={folder == null} onClick={() => pickFolder(null)}>
                <span />
                <span />
                <span className="name">2brain</span>
                <span className="count">{total}</span>
              </button>
              {fg.list.map((g, gi) => (
                <button key={g.key} type="button" className="nav-folder" aria-pressed={folder === gi} onClick={() => pickFolder(folder === gi ? null : gi)}>
                  <Icon name="chevr" size={10} style={{ opacity: 0.6 }} />
                  <Dot c={folderColors[gi]} hollow={g.unsorted} />
                  <span className="name">{g.label}</span>
                  <span className="count">{g.notes}</span>
                </button>
              ))}
            </>
          )}

          <ColHead label="Types" open={open.types} onToggle={() => setOpen((o) => ({ ...o, types: !o.types }))} />
          {open.types &&
            types.map(([t, c]) => (
              <button
                key={t}
                type="button"
                className="nav-folder"
                aria-pressed={type === t}
                onClick={() => {
                  const next = type === t ? null : t;
                  setType(next);
                  if (next) lightSet(model.notes.filter((n) => n.type === next).map((n) => n.i), typeLabel(next), "navigator");
                  else setFocus({ kind: "none" });
                }}
              >
                <span />
                <span />
                <span className="name">{typeLabel(t)}</span>
                <span className="count">{c}</span>
              </button>
            ))}

          <ColHead label="Months" open={open.months} onToggle={() => setOpen((o) => ({ ...o, months: !o.months }))} />
          {open.months &&
            months.map(([m, c]) => (
              <button
                key={m}
                type="button"
                className="nav-folder"
                aria-pressed={month === m}
                onClick={() => {
                  const next = month === m ? null : m;
                  setMonth(next);
                  if (next != null) lightSet(model.notes.filter((n) => n.date != null && monthKey(n.date) === next).map((n) => n.i), monthLabel(next), "navigator");
                  else setFocus({ kind: "none" });
                }}
              >
                <span />
                <span />
                <span className="name">{monthLabel(m)}</span>
                <span className="count">{c}</span>
              </button>
            ))}
        </div>

        <div>
          <div style={{ display: "flex", gap: 8, padding: "14px 16px 12px", borderBottom: "1px solid var(--hair)" }}>
            <label className="field" style={{ flex: 1 }}>
              <Icon name="search" size={12} />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this list" />
            </label>
            <button
              type="button"
              className="icon-button boxed"
              style={{ width: 28, height: 28 }}
              title={sort === "new" ? "Newest first" : sort === "az" ? "A to Z" : "Most linked"}
              aria-label="Change sort order"
              onClick={() => setSort((s) => (s === "new" ? "az" : s === "az" ? "links" : "new"))}
            >
              <Icon name="sort" size={13} />
            </button>
          </div>
          <div className="nav-list-head">
            <b>{title}</b>
            <span className="num">
              {list.length} {list.length === 1 ? "note" : "notes"}
            </span>
          </div>
          {periods.map((p) => (
            <div key={p.label}>
              <div className="nav-period label">{p.label}</div>
              {p.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="nav-item"
                  aria-current={noteIdx === n.i}
                  style={{ "--accent": folderColors[fg.of[n.i]] } as CSSProperties}
                  onClick={() => openNote(n.i)}
                >
                  <div className="nav-item-top">
                    <span>{n.title}</span>
                    <span title="Links in and out">{n.in.length + n.out.length}</span>
                  </div>
                  <p>
                    {n.date != null && <b>{fmtDay(n.date)} </b>}
                    {n.excerpt || <span style={{ color: "var(--dim)" }}>{n.id}</span>}
                  </p>
                  <div className="meta label">
                    <Dot c={folderColors[fg.of[n.i]]} />
                    {singularType(n.type)} · {n.domain === "uncategorized" ? "Unsorted" : capital(n.domain)}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {!list.length && <p style={{ padding: 16, fontSize: 13, color: "var(--dim)" }}>No notes match.</p>}
        </div>
      </div>
    </>
  );
}

function ColHead({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="nav-col-head label" style={{ width: "100%" }} onClick={onToggle} aria-expanded={open}>
      <span>{label}</span>
      <Icon name="chev" size={11} style={{ transform: open ? "rotate(180deg)" : undefined }} />
    </button>
  );
}

/** Folder colours always follow the folder grouping, whatever the brain is grouped by. */
export function useFolderColors() {
  const { model, settings, colors } = useApp();
  const fg = model.groups.folder;
  const folderColors = useMemo(
    () => (settings.groupBy === "folder" ? colors : fg.list.map((_, i) => groupCss(settings.palette, i, fg.list.length))),
    [settings.groupBy, settings.palette, colors, fg],
  );
  return { colors: folderColors };
}
