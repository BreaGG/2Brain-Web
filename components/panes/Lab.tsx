"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, Icon, PaneHead, Sect, SwitchRow } from "@/components/ui";
import { fmtInt, typeLabel } from "@/lib/brain";

export default function Lab({ accent, onClose }: PaneProps) {
  const { model, settings, set, gestures, setGestures, openNote, colorOf } = useApp();
  const [mode, setMode] = useState<"type" | "folder">("type");
  const [q, setQ] = useState("");

  const byKey = useMemo(() => {
    const keyOf = (i: number) => (mode === "type" ? typeLabel(model.notes[i].type) : model.groups.folder.list[model.groups.folder.of[i]].label);
    const m = new Map<string, { nodes: number; links: number; inner: number }>();
    for (const n of model.notes) {
      const k = keyOf(n.i);
      const e = m.get(k) ?? { nodes: 0, links: 0, inner: 0 };
      e.nodes++;
      m.set(k, e);
    }
    for (const [a, b] of model.links) {
      const ka = keyOf(a);
      const kb = keyOf(b);
      m.get(ka)!.links++;
      if (ka === kb) m.get(ka)!.inner++;
    }
    return [...m.entries()].sort((a, b) => b[1].nodes - a[1].nodes);
  }, [model, mode]);
  const N = model.notes.length || 1;
  const L = model.links.length || 1;

  const lookup = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return model.notes.filter((n) => n.title.toLowerCase().includes(t) || n.id.includes(t)).slice(0, 8);
  }, [q, model]);

  return (
    <>
      <PaneHead title="The lab" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <p className="lede">Experiments on your brain: build tables from any two things, steer it with your hands, and see what holds the links together.</p>

        <Sect label="Table builder" accent={accent}>
          <p>Choose rows and columns — folder, domain, type, year or how linked a note is — and count your notes across them. Any cell lights its notes in the brain.</p>
          <div style={{ marginTop: 12 }}>
            <SwitchRow label="Show the table builder" on={settings.tableBuilder} onChange={(v) => set("tableBuilder", v)} />
          </div>
        </Sect>

        <Sect label="Gestures" accent={accent}>
          <p>Turn and open the brain with your hands, through your camera. Nothing is recorded or sent anywhere; the hand model runs in this browser.</p>
          <div style={{ marginTop: 12 }}>
            <SwitchRow label="Gesture control" on={gestures} onChange={setGestures} />
          </div>
          <table className="tbl" style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <td>Pinch</td>
                <td>Click a point, or drag to turn</td>
              </tr>
              <tr>
                <td>Two hands</td>
                <td>Pull apart or together to zoom</td>
              </tr>
              <tr>
                <td>Fist, held</td>
                <td>Go back</td>
              </tr>
            </tbody>
          </table>
        </Sect>

        <Sect label="Influence" accent={accent}>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")}>
              By type
            </button>
            <button type="button" aria-pressed={mode === "folder"} onClick={() => setMode("folder")}>
              By folder
            </button>
          </div>
          <p style={{ marginBottom: 12 }}>
            {fmtInt(model.notes.length)} nodes and {fmtInt(model.links.length)} links in the notes.
          </p>
          <table className="tbl">
            <thead>
              <tr>
                <th>{mode === "type" ? "Type" : "Folder"}</th>
                <th className="r">Nodes ↓</th>
                <th className="r">Links</th>
                <th className="r">Inside</th>
              </tr>
            </thead>
            <tbody>
              {byKey.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="r">
                    {v.nodes} <small>· {((v.nodes / N) * 100).toFixed(1)}%</small>
                  </td>
                  <td className="r">
                    {v.links} <small>· {((v.links / L) * 100).toFixed(1)}%</small>
                  </td>
                  <td className="r">
                    {v.links ? Math.round((v.inner / v.links) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>Inside: the share of a group’s links that stay inside the group. Low numbers mean the group bridges to the rest of the brain.</p>
        </Sect>

        <Sect label="Look up a node" accent={accent}>
          <label className="field">
            <Icon name="search" size={12} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Look up a note by its title or file" />
          </label>
          {!!lookup.length && (
            <table className="tbl" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Note</th>
                  <th className="r">In</th>
                  <th className="r">Out</th>
                  <th className="r">Ghosts</th>
                </tr>
              </thead>
              <tbody>
                {lookup.map((n) => (
                  <tr key={n.id} className="click" onClick={() => openNote(n.i)}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Dot c={colorOf(n.i)} />
                        {n.title}
                      </span>
                      <br />
                      <small>{n.id}</small>
                    </td>
                    <td className="r">{n.in.length}</td>
                    <td className="r">{n.out.length}</td>
                    <td className="r">{n.ghosts.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sect>
      </div>
    </>
  );
}
