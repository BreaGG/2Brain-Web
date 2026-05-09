"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParsedPage } from "@/lib/types";

type SortKey = "title" | "type" | "lastUpdated" | "sources" | "links";
type SortDir = "asc" | "desc";

const TYPE_COLORS: Record<string, string> = {
  concept: "bg-blue-500/20 text-blue-300",
  person: "bg-emerald-500/20 text-emerald-300",
  "source-summary": "bg-amber-500/20 text-amber-300",
  synthesis: "bg-violet-500/20 text-violet-300",
};

interface Props {
  pages: ParsedPage[];
  linkDegrees: Map<string, number>;
  activeDomains: Set<string>;
}

export default function PageTable({ pages, linkDegrees, activeDomains }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("lastUpdated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = activeDomains.size === 0
    ? pages
    : pages.filter((p) => p.domain.some((d) => activeDomains.has(d)));

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title": cmp = a.title.localeCompare(b.title); break;
      case "type": cmp = a.type.localeCompare(b.type); break;
      case "lastUpdated": cmp = a.lastUpdated.localeCompare(b.lastUpdated); break;
      case "sources": cmp = a.sources.length - b.sources.length; break;
      case "links": cmp = (linkDegrees.get(a.slug) ?? 0) - (linkDegrees.get(b.slug) ?? 0); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-white/20">↕</span>;
    return <span>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 text-[var(--text-muted)]">
            {(["title", "type", "lastUpdated", "sources", "links"] as SortKey[]).map((col) => (
              <th
                key={col}
                onClick={() => toggleSort(col)}
                className="cursor-pointer select-none px-4 py-3 text-left font-medium hover:text-[var(--text-primary)] transition-colors"
              >
                {col === "lastUpdated" ? "Updated" : col.charAt(0).toUpperCase() + col.slice(1)}{" "}
                <SortIcon col={col} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((page) => {
            const typeColor = TYPE_COLORS[page.type] ?? "bg-slate-500/20 text-slate-300";
            return (
              <tr
                key={page.slug}
                className="border-b border-white/5 hover:bg-white/3 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/wiki/${page.slug}`}
                    className="font-medium text-[var(--text-primary)] hover:text-[var(--node-concept)] transition-colors"
                  >
                    {page.title}
                  </Link>
                  {page.excerpt && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1 max-w-xs">
                      {page.excerpt}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${typeColor}`}>
                    {page.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {page.lastUpdated || "—"}
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {page.sources.length || "—"}
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">
                  {linkDegrees.get(page.slug) ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="py-12 text-center text-[var(--text-muted)] text-sm">No pages in selected domains.</p>
      )}
    </div>
  );
}
