"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app/context";
import type { PaneProps } from "@/components/app/Panes";
import { Dot, Icon, PaneHead, Select } from "@/components/ui";
import { fmtDate, fmtInt, typeLabel } from "@/lib/brain";

type SortKey = "path" | "words" | "links" | "date";
type When = "any" | "30" | "365" | "older" | "undated";

export default function Files({ accent, onClose }: PaneProps) {
  const { model, openNote, colorOf } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("any");
  const [when, setWhen] = useState<When>("any");
  const [folder, setFolder] = useState("any");
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "date", desc: true });

  const kinds = useMemo(() => [...new Set(model.notes.map((n) => n.type))].sort(), [model]);
  const folders = model.groups.folder.list;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const now = Date.now();
    const day = 86400000;
    const words = t ? t.split(/\s+/) : [];
    const list = model.notes.filter((n) => {
      if (kind !== "any" && n.type !== kind) return false;
      if (folder !== "any" && n.folder !== folder) return false;
      if (when === "undated" && n.date != null) return false;
      if (when === "30" && (n.date == null || now - n.date > 30 * day)) return false;
      if (when === "365" && (n.date == null || now - n.date > 365 * day)) return false;
      if (when === "older" && (n.date == null || now - n.date <= 365 * day)) return false;
      if (!words.length) return true;
      const hay = `${model.pages[n.i].path} ${n.title} ${model.pages[n.i].bodyContent}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      switch (sort.k) {
        case "path":
          return dir * model.pages[a.i].path.localeCompare(model.pages[b.i].path);
        case "words":
          return dir * (a.words - b.words);
        case "links":
          return dir * (a.in.length + a.out.length - (b.in.length + b.out.length));
        case "date":
          return dir * ((a.date ?? -Infinity) - (b.date ?? -Infinity));
      }
    });
  }, [model, q, kind, when, folder, sort]);

  const th = (k: SortKey, label: string, r = false) => (
    <th className={r ? "r" : undefined}>
      <button type="button" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== "path" }))}>
        {label}
        {sort.k === k ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <>
      <PaneHead title="Files" accent={accent} onClose={onClose} />
      <div className="pane-body">
        <p className="lede">Every file in the wiki. Search by a file’s name or its words; each opens in the reader.</p>
        <label className="field">
          <Icon name="search" size={12} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your files" />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
          <Select label="Kind" value={kind} onChange={setKind} options={[{ value: "any", label: "Any kind" }, ...kinds.map((k) => ({ value: k, label: typeLabel(k) }))]} />
          <Select<When>
            label="Time"
            value={when}
            onChange={setWhen}
            options={[
              { value: "any", label: "Any time" },
              { value: "30", label: "Last 30 days" },
              { value: "365", label: "Last year" },
              { value: "older", label: "Over a year ago" },
              { value: "undated", label: "Undated" },
            ]}
          />
          <Select label="Folder" value={folder} onChange={setFolder} options={[{ value: "any", label: "Every folder" }, ...folders.map((f) => ({ value: f.key, label: f.label }))]} />
        </div>
        <p style={{ fontSize: 11, color: "var(--dim)", margin: "6px 0 14px" }}>
          {rows.length} of {model.notes.length} files · {fmtInt(rows.reduce((s, n) => s + n.words, 0))} words
        </p>
        <table className="tbl">
          <thead>
            <tr>
              {th("path", "File")}
              {th("words", "Words", true)}
              {th("links", "Links", true)}
              {th("date", "Updated", true)}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id} className="click" onClick={() => openNote(n.i)}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Dot c={colorOf(n.i)} />
                    {n.title}
                  </span>
                  <br />
                  <small style={{ fontFamily: "var(--mono)" }}>{model.pages[n.i].path}</small>
                </td>
                <td className="r">{fmtInt(n.words)}</td>
                <td className="r">{n.in.length + n.out.length}</td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  {n.date ? fmtDate(n.date) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
