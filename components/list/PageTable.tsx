"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParsedPage } from "@/lib/types";

type SortKey = "title" | "type" | "lastUpdated" | "sources" | "links";
type SortDir = "asc" | "desc";

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  concept:          { bg: "#4f9cf915", color: "#4f9cf9" },
  person:           { bg: "#4ade8015", color: "#4ade80" },
  "source-summary": { bg: "#facc1515", color: "#facc15" },
  synthesis:        { bg: "#c084fc15", color: "#c084fc" },
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

  const COL_LABELS: Record<SortKey, string> = {
    title: "Title",
    type: "Type",
    lastUpdated: "Updated",
    sources: "Sources",
    links: "Links",
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #141414" }}>
            {(["title", "type", "lastUpdated", "sources", "links"] as SortKey[]).map((col) => (
              <th
                key={col}
                onClick={() => toggleSort(col)}
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontWeight: 500,
                  fontSize: 11,
                  color: sortKey === col ? "#a1a1aa" : "#3f3f46",
                  cursor: "pointer",
                  userSelect: "none",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                {COL_LABELS[col]}{" "}
                <span style={{ opacity: 0.5 }}>
                  {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((page) => {
            const tc = TYPE_COLORS[page.type] ?? { bg: "#1a1a1a", color: "#71717a" };
            return (
              <tr
                key={page.slug}
                style={{ borderBottom: "1px solid #0d0d0d" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#080808")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "12px 16px" }}>
                  <Link
                    href={`/wiki/${page.slug}`}
                    style={{
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#4f9cf9")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#fff")}
                  >
                    {page.title}
                  </Link>
                  {page.excerpt && (
                    <p
                      style={{
                        color: "#71717a",
                        fontSize: 11,
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 360,
                      }}
                    >
                      {page.excerpt}
                    </p>
                  )}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span
                    style={{
                      background: tc.bg,
                      color: tc.color,
                      border: `1px solid ${tc.color}30`,
                      borderRadius: 5,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {page.type}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "#a1a1aa", fontSize: 12, whiteSpace: "nowrap" }}>
                  {page.lastUpdated || "—"}
                </td>
                <td style={{ padding: "12px 16px", color: "#a1a1aa", fontSize: 12 }}>
                  {page.sources.length || "—"}
                </td>
                <td style={{ padding: "12px 16px", color: "#a1a1aa", fontSize: 12 }}>
                  {linkDegrees.get(page.slug) ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p style={{ padding: "48px 0", textAlign: "center", color: "#3f3f46", fontSize: 13 }}>
          No pages in selected domains.
        </p>
      )}
    </div>
  );
}
