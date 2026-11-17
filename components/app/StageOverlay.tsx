"use client";

import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp } from "./context";
import { Dot, Icon } from "@/components/ui";
import ViewPanel from "./ViewPanel";
import TableBuilder from "./TableBuilder";
import { GROUP_BY_LABEL, fmtDate, fmtInt, monthKey, monthLabel, monthRange, monthStart, singularType } from "@/lib/brain";

export default function StageOverlay({
  vizOpen,
  setVizOpen,
  hover,
}: {
  vizOpen: boolean;
  setVizOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  hover: { i: number; x: number; y: number } | null;
}) {
  const { settings, set } = useApp();
  return (
    <>
      <div className="stage-top">
        <StageFind />
        <FocusChip />
        <div className="stage-tools">
          <button
            type="button"
            className="icon-button boxed"
            aria-pressed={settings.activity}
            title="Activity: when notes were written"
            aria-label="Activity"
            onClick={() => set("activity", !settings.activity)}
          >
            <Icon name="pulse" size={12} />
          </button>
          <button
            type="button"
            className="icon-button boxed"
            aria-expanded={vizOpen}
            title="View (V)"
            aria-label="View"
            onClick={() => setVizOpen((v) => !v)}
          >
            <Icon name="sliders" size={12} />
          </button>
        </div>
      </div>
      {vizOpen && <ViewPanel onClose={() => setVizOpen(false)} />}
      {settings.tableBuilder && <TableBuilder />}
      <Legend />
      {settings.activity && <Activity />}
      {hover && <Tooltip {...hover} />}
    </>
  );
}

/* ── search on the brain: lights matches as you type ──────────────────────── */

function StageFind() {
  const { model, lightSet, focus, openCommand, setFocus } = useApp();
  const [q, setQ] = useState("");
  const fuse = useMemo(
    () =>
      new Fuse(model.notes, {
        keys: [
          { name: "title", weight: 3 },
          { name: "id", weight: 1 },
          { name: "excerpt", weight: 1 },
        ],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [model],
  );
  const hits = useMemo(() => (q.trim().length > 1 ? fuse.search(q.trim()).map((r) => r.item.i) : []), [q, fuse]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length > 1) lightSet(hits, `“${q.trim()}”`, "find");
      else if (focus.kind === "set" && focus.source === "find") setFocus({ kind: "none" });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, q]);

  return (
    <form
      className="stage-find"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        openCommand(q);
      }}
    >
      <Icon name="search" size={12} />
      <input id="stage-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="" aria-label="Find in the brain" autoComplete="off" />
      {q.trim().length > 1 && <span className="hits num">{hits.length}</span>}
      <button type="button" className="icon-button" style={{ width: 20, height: 20 }} title="Search and commands (⌘K)" aria-label="Open the command bar" onClick={() => openCommand(q)}>
        <Icon name="ask" size={12} />
      </button>
    </form>
  );
}

/* ── what is lit, with a way back ─────────────────────────────────────────── */

function FocusChip() {
  const { focus, setFocus, model, pane } = useApp();
  if (focus.kind === "none" || focus.kind === "note" || pane === "note") return null;
  let text = "";
  if (focus.kind === "groups") {
    const g = model.groups[focus.groupBy];
    const names = focus.keys.map((k) => g.list[k]?.label).filter(Boolean);
    const count = focus.keys.reduce((s, k) => s + (g.list[k]?.notes ?? 0), 0);
    text = `Showing ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} · ${count} notes`;
  } else {
    text = `Showing ${focus.label} · ${focus.ids.length} ${focus.ids.length === 1 ? "note" : "notes"}`;
  }
  return (
    <div className="focus-chip" role="status">
      <span>{text}</span>
      <button type="button" onClick={() => setFocus({ kind: "none" })}>
        Clear
      </button>
    </div>
  );
}

/* ── legend: groups with notes · record counts ────────────────────────────── */

function Legend() {
  const { model, settings, colors, focus, setFocus } = useApp();
  const [open, setOpen] = useState(false);
  const g = model.groups[settings.groupBy];
  const list = g.list.map((x, i) => ({ ...x, i })).filter((x) => !(settings.hideUnsorted && x.unsorted));
  const LIMIT = 14;
  const shown = open ? list : list.slice(0, LIMIT);
  const lit = focus.kind === "groups" && focus.groupBy === settings.groupBy ? new Set(focus.keys) : null;

  const toggle = (i: number, multi: boolean) => {
    if (!lit || !multi) {
      if (lit && lit.size === 1 && lit.has(i)) return setFocus({ kind: "none" });
      return setFocus({ kind: "groups", groupBy: settings.groupBy, keys: [i] });
    }
    const next = new Set(lit);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setFocus(next.size ? { kind: "groups", groupBy: settings.groupBy, keys: [...next] } : { kind: "none" });
  };

  return (
    <div className={`legend${open ? " open" : ""}`}>
      <div className="legend-head label">
        <span>By {GROUP_BY_LABEL[settings.groupBy].toLowerCase()}</span>
        <span style={{ color: "var(--dim)" }}>Notes · record</span>
      </div>
      <div className="legend-grid">
        {shown.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`key${lit && !lit.has(x.i) ? " off" : ""}`}
            aria-pressed={lit?.has(x.i) ?? false}
            title={`${x.label}: ${x.notes} notes, ${fmtInt(x.record)} passages. Shift-click to add.`}
            onClick={(e) => toggle(x.i, e.shiftKey || e.metaKey)}
          >
            <Dot c={colors[x.i]} hollow={x.unsorted} />
            <span className="name">{x.label}</span>
            <span className="count">
              {x.notes} · {fmtInt(x.record)}
            </span>
          </button>
        ))}
        {list.length > LIMIT && (
          <button type="button" className="key-more" onClick={() => setOpen((o) => !o)}>
            {open ? "Fewer" : `All ${list.length} ${GROUP_BY_LABEL[settings.groupBy].toLowerCase()}s`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── activity: notes per month, drag to light a period ────────────────────── */

function Activity() {
  const { model, lightSet, focus, setFocus } = useApp();
  const ref = useRef<HTMLCanvasElement>(null);
  const months = useMemo(() => monthRange(model), [model]);
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const n of model.notes) if (n.date != null) c.set(monthKey(n.date), (c.get(monthKey(n.date)) ?? 0) + Math.max(1, n.words));
    return months.map((m) => c.get(m) ?? 0);
  }, [model, months]);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const [hoverM, setHoverM] = useState<number | null>(null);
  const dragging = useRef(false);
  const range = focus.kind === "set" && focus.source === "activity" ? drag : null;
  // the selection box goes when something else takes the focus
  useEffect(() => {
    if (!dragging.current && !(focus.kind === "set" && focus.source === "activity")) setDrag(null);
  }, [focus]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 180;
    const h = 34;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(1, ...counts);
    const bw = w / Math.max(1, counts.length);
    const sel = drag ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : null;
    counts.forEach((v, i) => {
      const bh = Math.max(1, Math.sqrt(v / max) * (h - 4));
      const on = !sel || (i >= sel[0] && i <= sel[1]);
      const t = i / Math.max(1, counts.length - 1);
      ctx.fillStyle = on ? `hsla(${200 + t * 90}, 70%, ${78 - t * 8}%, ${sel ? 1 : 0.85})` : "rgba(255,255,255,0.18)";
      ctx.fillRect(i * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
    });
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, h - 0.5, w, 0.5);
    if (sel) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(sel[0] * bw + 0.5, 0.5, (sel[1] - sel[0] + 1) * bw - 1, h - 1);
    }
  }, [counts, drag]);

  if (!months.length) return null;
  const at = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(months.length - 1, Math.floor(((clientX - rect.left) / rect.width) * months.length)));
  };
  const commit = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const from = monthStart(months[lo]);
    const to = monthStart(months[hi] + 1);
    const ids = model.notes.filter((n) => n.date != null && n.date >= from && n.date < to).map((n) => n.i);
    lightSet(ids, lo === hi ? monthLabel(months[lo]) : `${monthLabel(months[lo])} – ${monthLabel(months[hi])}`, "activity");
  };
  const capM = hoverM ?? (drag ? Math.max(drag.a, drag.b) : null);

  return (
    <div className="activity">
      <div className="activity-cap">
        <span>{range ? "" : capM != null ? monthLabel(months[capM]) : monthLabel(months[0])}</span>
        <span>{capM != null && !range ? `${counts[capM] ? fmtInt(counts[capM]) + " words" : "—"}` : range ? "" : monthLabel(months[months.length - 1])}</span>
      </div>
      <canvas
        ref={ref}
        aria-label="Notes written per month. Drag to light a period."
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          dragging.current = true;
          const m = at(e.clientX);
          setDrag({ a: m, b: m });
        }}
        onPointerMove={(e) => {
          const m = at(e.clientX);
          setHoverM(m);
          if (drag && e.buttons) setDrag({ a: drag.a, b: m });
        }}
        onPointerLeave={() => setHoverM(null)}
        onPointerUp={() => {
          dragging.current = false;
          if (!drag) return;
          if (range && drag.a === drag.b && focus.kind === "set") {
            setDrag(null);
            setFocus({ kind: "none" });
            return;
          }
          commit(drag.a, drag.b);
        }}
      />
    </div>
  );
}

/* ── hover card ───────────────────────────────────────────────────────────── */

function Tooltip({ i, x, y }: { i: number; x: number; y: number }) {
  const { model, colorOf, settings } = useApp();
  const n = model.notes[i];
  if (!n) return null;
  const g = model.groups[settings.groupBy];
  const left = Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth : 1600) - 300);
  return (
    <div className="tooltip" style={{ left, top: y + 14 } as CSSProperties}>
      <b>{n.title}</b>
      {n.excerpt && <span style={{ display: "block", marginTop: 3, color: "var(--dim)" }}>{n.excerpt.slice(0, 120)}{n.excerpt.length > 120 ? "…" : ""}</span>}
      <span className="meta">
        <Dot c={colorOf(i)} />
        {g.list[g.of[i]]?.label} · {singularType(n.type)} · {n.in.length + n.out.length} links{n.date ? ` · ${fmtDate(n.date)}` : ""}
      </span>
    </div>
  );
}
