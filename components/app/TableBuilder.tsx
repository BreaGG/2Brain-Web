"use client";

import { useMemo, useState } from "react";
import { useApp } from "./context";
import { Icon, Select } from "@/components/ui";
import { capital, fmtMonth, typeLabel, type Note } from "@/lib/brain";

type Axis = "folder" | "domain" | "type" | "year" | "links";

const AXES: { value: Axis; label: string }[] = [
  { value: "folder", label: "Folder" },
  { value: "domain", label: "Domain" },
  { value: "type", label: "Type" },
  { value: "year", label: "Year" },
  { value: "links", label: "Links" },
];

function valueOf(n: Note, a: Axis): string {
  switch (a) {
    case "folder":
      return n.folder === "root" ? "Root" : capital(n.folder);
    case "domain":
      return n.domain === "uncategorized" ? "Unsorted" : capital(n.domain);
    case "type":
      return typeLabel(n.type);
    case "year":
      return n.date ? String(new Date(n.date).getUTCFullYear()) : "Undated";
    case "links": {
      const d = n.in.length + n.out.length;
      return d === 0 ? "0" : d <= 2 ? "1–2" : d <= 5 ? "3–5" : d <= 10 ? "6–10" : "11+";
    }
  }
}

export default function TableBuilder() {
  const { model, set, lightSet, focus } = useApp();
  const [rows, setRows] = useState<Axis>("folder");
  const [cols, setCols] = useState<Axis>("type");

  const table = useMemo(() => {
    const cell = new Map<string, number[]>();
    const rk = new Map<string, number>();
    const ck = new Map<string, number>();
    for (const n of model.notes) {
      const r = valueOf(n, rows);
      const c = valueOf(n, cols);
      rk.set(r, (rk.get(r) ?? 0) + 1);
      ck.set(c, (ck.get(c) ?? 0) + 1);
      const k = `${r}\u0000${c}`;
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k)!.push(n.i);
    }
    const order = (m: Map<string, number>, a: Axis) =>
      [...m.entries()]
        .sort((x, y) => (a === "year" || a === "links" ? x[0].localeCompare(y[0], "en", { numeric: true }) : y[1] - x[1]))
        .map((e) => e[0]);
    const R = order(rk, rows).slice(0, 14);
    const C = order(ck, cols).slice(0, 8);
    let max = 1;
    for (const v of cell.values()) max = Math.max(max, v.length);
    return { cell, R, C, max };
  }, [model, rows, cols]);

  const litLabel = focus.kind === "set" && focus.source === "table" ? focus.label : null;

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 7,
        top: 52,
        left: 16,
        width: "min(560px, calc(100% - 32px))",
        maxHeight: "calc(100% - 200px)",
        overflow: "auto",
        border: "1px solid var(--hair)",
        background: "var(--bg)",
        padding: "12px 14px 14px",
      }}
      aria-label="Table builder"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span className="label" style={{ flex: 1 }}>
          Table builder
        </span>
        <Select<Axis> label="Rows" value={rows} options={AXES} onChange={setRows} style={{ width: 96 }} />
        <span style={{ fontSize: 12 }}>by</span>
        <Select<Axis> label="Columns" value={cols} options={AXES} onChange={setCols} style={{ width: 96 }} />
        <button type="button" className="icon-button" aria-label="Close table builder" onClick={() => set("tableBuilder", false)}>
          <Icon name="close" size={12} />
        </button>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th />
            {table.C.map((c) => (
              <th key={c} className="r">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.R.map((r) => (
            <tr key={r}>
              <td style={{ whiteSpace: "nowrap" }}>{r}</td>
              {table.C.map((c) => {
                const ids = table.cell.get(`${r}\u0000${c}`) ?? [];
                const k = ids.length / table.max;
                const label = `${r} × ${c}`;
                return (
                  <td
                    key={c}
                    className="cell-heat"
                    style={{
                      background: ids.length ? `rgba(255,255,255,${0.05 + k * 0.5})` : undefined,
                      color: k > 0.55 ? "#000" : undefined,
                      outline: litLabel === label ? "1px solid var(--ink)" : undefined,
                    }}
                    onClick={() => ids.length && lightSet(ids, label, "table")}
                    title={ids.length ? `Light ${ids.length} notes` : undefined}
                  >
                    {ids.length || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows === "year" || cols === "year" ? null : (
        <p style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>
          Click a cell to light those notes in the brain.{model.dateMax ? ` Last change ${fmtMonth(model.dateMax)}.` : ""}
        </p>
      )}
    </div>
  );
}
