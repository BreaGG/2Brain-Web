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
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  const filtered = activeDomains.size === 0
    ? pages
    : pages.filter((p) => p.domain.some((d) => activeDomains.has(d)));

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title":       cmp = a.title.localeCompare(b.title); break;
      case "type":        cmp = a.type.localeCompare(b.type); break;
      case "lastUpdated": cmp = a.lastUpdated.localeCompare(b.lastUpdated); break;
      case "sources":     cmp = a.sources.length - b.sources.length; break;
      case "links":       cmp = (linkDegrees.get(a.slug) ?? 0) - (linkDegrees.get(b.slug) ?? 0); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const COL_LABELS: Record<SortKey, string> = {
    title: "Title",
    type: "Type",
    lastUpdated: "Updated",
    sources: "Sources",
    links: "Links",
  };

  return (
    <div
      style={{ width: "100%", overflowX: "auto", animation: "fadeIn 0.3s ease-out" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            {(["title", "type", "lastUpdated", "sources", "links"] as SortKey[]).map((col) => {
              const active = sortKey === col;
              return (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  style={{
                    padding: "12px 18px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 9,
                    color: active ? "#a1a1aa" : "#3f3f46",
                    cursor: "pointer",
                    userSelect: "none",
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#71717a"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#3f3f46"; }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {COL_LABELS[col]}
                    <span
                      style={{
                        opacity: active ? 1 : 0.25,
                        color: active ? "#4f9cf9" : "currentColor",
                        fontSize: 10,
                      }}
                    >
                      {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((page) => {
            const tc = TYPE_COLORS[page.type] ?? { bg: "#1a1a1a", color: "#71717a" };
            const isHover = hoverSlug === page.slug;
            return (
              <tr
                key={page.slug}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  background: isHover ? `${tc.color}06` : "transparent",
                  transition: "background 0.12s",
                  position: "relative",
                }}
                onMouseEnter={() => setHoverSlug(page.slug)}
                onMouseLeave={() => setHoverSlug(null)}
              >
                <td style={{ padding: "14px 18px", position: "relative" }}>
                  {/* Left accent bar on hover */}
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "12%",
                      bottom: "12%",
                      width: 2,
                      background: tc.color,
                      opacity: isHover ? 1 : 0,
                      transition: "opacity 0.15s",
                      borderRadius: "0 2px 2px 0",
                    }}
                  />
                  <Link
                    href={`/wiki/${page.slug}`}
                    style={{
                      color: isHover ? tc.color : "#e4e4e7",
                      textDecoration: "none",
                      fontWeight: 500,
                      fontSize: 13,
                      transition: "color 0.12s",
                      display: "block",
                    }}
                  >
                    {page.title}
                  </Link>
                  {page.excerpt && (
                    <p
                      style={{
                        color: "#52525b",
                        fontSize: 11,
                        marginTop: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 480,
                        lineHeight: 1.4,
                      }}
                    >
                      {page.excerpt}
                    </p>
                  )}
                </td>
                <td style={{ padding: "14px 18px", whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: tc.bg,
                      color: tc.color,
                      border: `1px solid ${tc.color}30`,
                      borderRadius: 4,
                      padding: "3px 9px",
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.04em",
                    }}
                  >
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: tc.color }} />
                    {page.type}
                  </span>
                </td>
                <td
                  style={{
                    padding: "14px 18px",
                    color: "#a1a1aa",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                  }}
                >
                  {page.lastUpdated || "—"}
                </td>
                <td style={{ padding: "14px 18px", color: "#71717a", fontSize: 12, fontFamily: "monospace" }}>
                  {page.sources.length || "—"}
                </td>
                <td style={{ padding: "14px 18px", color: "#71717a", fontSize: 12, fontFamily: "monospace" }}>
                  {linkDegrees.get(page.slug) ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div
          style={{
            padding: "64px 0",
            textAlign: "center",
            color: "#3f3f46",
            fontSize: 13,
            fontFamily: "monospace",
            letterSpacing: "0.1em",
          }}
        >
          ○ NO PAGES IN SELECTED DOMAINS
        </div>
      )}
    </div>
  );
}
