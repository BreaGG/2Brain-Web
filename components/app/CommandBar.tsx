"use client";

import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, NAV, type PaneId } from "./context";
import { Dot, Icon } from "@/components/ui";
import { PALETTES } from "@/lib/palettes";
import { singularType } from "@/lib/brain";

interface Item {
  id: string;
  group: string;
  title: string;
  sub?: string;
  hint?: string;
  color?: string;
  run: () => void;
}

export default function CommandBar({
  initial,
  onClose,
  setVizOpen,
}: {
  initial: string;
  onClose: () => void;
  setVizOpen: (v: boolean) => void;
}) {
  const app = useApp();
  const { model, colorOf, settings, set, openNote, openPane, lightSet } = app;
  const [q, setQ] = useState(initial);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const fuse = useMemo(
    () =>
      new Fuse(model.notes, {
        keys: [
          { name: "title", weight: 3 },
          { name: "id", weight: 1.5 },
          { name: "excerpt", weight: 1 },
          { name: "domains", weight: 0.8 },
        ],
        threshold: 0.36,
        ignoreLocation: true,
      }),
    [model],
  );

  const commands = useMemo<Item[]>(() => {
    const views: Item[] = NAV.map((n) => ({
      id: `view-${n.id}`,
      group: "Views",
      title: `Open ${n.label}`,
      sub: n.hint,
      hint: "View",
      run: () => openPane(n.id === "brain" ? null : (n.id as PaneId)),
    }));
    views.push({ id: "view-add", group: "Views", title: "Add a note", sub: "How to bring something new into the record", hint: "View", run: () => openPane("add") });
    const toggles: Item[] = [
      { id: "t-form", group: "Commands", title: settings.form > 0.5 ? "Show the anatomy" : "Show the layout", sub: "Slide Form between anatomy and clusters", run: () => set("form", settings.form > 0.5 ? 0 : 1) },
      { id: "t-cosmos", group: "Commands", title: settings.cosmos ? "Back to the brain" : "Show the cosmos", sub: "Every section of the wiki as a galaxy", hint: "C", run: () => set("cosmos", !settings.cosmos) },
      { id: "t-focus", group: "Commands", title: settings.focusBrain ? "Show the whole body" : "Focus the brain", sub: "The brain alone, without the cord and nerves", hint: "B", run: () => set("focusBrain", !settings.focusBrain) },
      { id: "t-tree", group: "Commands", title: "Show the folder tree", sub: "Every folder and note as a tree, at Layout", run: () => { set("tableBuilder", false); set("groupLayout", "tree"); set("form", 1); } },
      { id: "t-spheres", group: "Commands", title: "Show the groups as spheres", sub: "One cloud per group, at Layout", run: () => { set("tableBuilder", false); set("groupLayout", "spheres"); set("form", 1); } },
      { id: "t-sync", group: "Commands", title: "Sync with GitHub", sub: "Fetch new and changed notes from the wiki now", run: () => document.querySelector<HTMLButtonElement>(".rail-status .sync")?.click() },
      { id: "t-write", group: "Commands", title: "Write a new note", sub: "Saved to your wiki on GitHub and indexed in its folder", run: () => openPane("add") },
      { id: "t-tour", group: "Commands", title: "Start the walkthrough", sub: "A guided tour of the brain, step by step", run: () => app.startTour() },
      { id: "t-demo", group: "Commands", title: app.demo ? "Show your brain" : "Show a demo brain", sub: "A sample wiki to explore without touching yours", run: () => app.setDemo(!app.demo) },
      { id: "t-order", group: "Commands", title: settings.order === "oldest" ? "Record: newest first" : "Record: oldest first", sub: "Which end of the record sits by the brain", run: () => set("order", settings.order === "oldest" ? "newest" : "oldest") },
      { id: "t-turn", group: "Commands", title: settings.turning ? "Stop turning" : "Start turning", run: () => set("turning", !settings.turning) },
      { id: "t-links", group: "Commands", title: settings.links ? "Hide links" : "Show links", run: () => set("links", !settings.links) },
      { id: "t-ghost", group: "Commands", title: settings.ghosts ? "Hide ghost links" : "Show ghost links", sub: `${model.ghostSlugs.length} pages linked but not written yet`, run: () => set("ghosts", !settings.ghosts) },
      { id: "t-table", group: "Commands", title: settings.tableBuilder ? "Close the table builder" : "Open the table builder", run: () => set("tableBuilder", !settings.tableBuilder) },
      { id: "t-view", group: "Commands", title: "Open View settings", hint: "V", run: () => setVizOpen(true) },
      ...(["folder", "domain", "type"] as const).map((g) => ({
        id: `t-group-${g}`,
        group: "Commands",
        title: `Group by ${g}`,
        run: () => set("groupBy", g),
      })),
      ...PALETTES.map((p) => ({ id: `t-pal-${p.id}`, group: "Commands", title: `Colours: ${p.label}`, run: () => set("palette", p.id) })),
    ];
    const groups: Item[] = (["folder", "domain", "type"] as const).flatMap((gb) =>
      model.groups[gb].list.map((g, gi) => ({
        id: `g-${gb}-${g.key}`,
        group: "Light in the brain",
        title: `Light ${g.label}`,
        sub: `${gb} · ${g.notes} notes`,
        hint: "Light",
        run: () => {
          if (settings.groupBy !== gb) set("groupBy", gb);
          app.setFocus({ kind: "groups", groupBy: gb, keys: [gi] });
        },
      })),
    );
    return [...views, ...groups, ...toggles];
  }, [model, settings, set, openPane, setVizOpen, app]);

  const items = useMemo<Item[]>(() => {
    const t = q.trim();
    if (!t) {
      const recent = [...model.notes]
        .filter((n) => n.date != null && !n.isIndex)
        .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
        .slice(0, 6);
      return [
        ...recent.map((n) => ({
          id: `n-${n.i}`,
          group: "Recent notes",
          title: n.title,
          sub: n.excerpt,
          color: colorOf(n.i),
          hint: singularType(n.type),
          run: () => openNote(n.i),
        })),
        ...commands.filter((c) => c.group === "Views"),
      ];
    }
    const notes = fuse.search(t).slice(0, 30);
    const out: Item[] = [];
    if (notes.length > 1)
      out.push({
        id: "light-all",
        group: "Notes",
        title: `Light all ${notes.length} matches in the brain`,
        hint: "Light",
        run: () => lightSet(notes.map((r) => r.item.i), `“${t}”`, "find"),
      });
    for (const r of notes.slice(0, 12))
      out.push({
        id: `n-${r.item.i}`,
        group: "Notes",
        title: r.item.title,
        sub: r.item.excerpt || r.item.id,
        color: colorOf(r.item.i),
        hint: singularType(r.item.type),
        run: () => openNote(r.item.i),
      });
    const lower = t.toLowerCase();
    const cmds = commands.filter((c) => c.title.toLowerCase().includes(lower) || c.sub?.toLowerCase().includes(lower)).slice(0, 10);
    return [...out, ...cmds];
  }, [q, fuse, model, commands, colorOf, openNote, lightSet]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-k="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };

  let lastGroup = "";
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="cmd-input">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search notes, light a group, or run a command"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(items[sel]);
              }
            }}
            aria-controls="cmd-list"
            aria-activedescendant={items[sel] ? `cmd-${items[sel].id}` : undefined}
          />
          <kbd className="label">Esc</kbd>
        </div>
        <div className="cmd-line" />
        <div className="cmd-list" id="cmd-list" role="listbox" ref={listRef}>
          {items.length === 0 && <p style={{ padding: "18px 16px", color: "var(--dim)", fontSize: 13 }}>Nothing in your record matches “{q}”.</p>}
          {items.map((it, k) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <div className="cmd-group label">{head}</div>}
                <button
                  type="button"
                  id={`cmd-${it.id}`}
                  data-k={k}
                  role="option"
                  aria-selected={k === sel}
                  className="cmd-item"
                  onMouseMove={() => setSel(k)}
                  onClick={() => run(it)}
                >
                  {it.color ? <Dot c={it.color} /> : <span />}
                  <span style={{ minWidth: 0 }}>
                    {it.title}
                    {it.sub && <small>{it.sub}</small>}
                  </span>
                  <span className="hint">{it.hint}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmd-foot">
          <span>↑↓ Move</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
          <span style={{ marginLeft: "auto" }}>/ Find in the brain</span>
        </div>
      </div>
    </>
  );
}
