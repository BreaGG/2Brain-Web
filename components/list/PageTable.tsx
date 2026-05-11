"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParsedPage } from "@/lib/types";

type SortKey = "title" | "type" | "lastUpdated" | "sources" | "links";
type SortDir = "asc" | "desc";

// Galaxy-aligned palette
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  concept:          { bg: "rgba(125,211,252,0.10)", color: "#7dd3fc" },
  person:           { bg: "rgba(103,232,249,0.10)", color: "#67e8f9" },
  "source-summary": { bg: "rgba(196,181,253,0.10)", color: "#c4b5fd" },
  synthesis:        { bg: "rgba(167,139,250,0.10)", color: "#a78bfa" },
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#f0abfc",
  research: "#7dd3fc",
  reading:  "#c4b5fd",
  business: "#67e8f9",
};

const TS = "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85), 0 0 28px rgba(0,0,0,0.55)";
const TS_SOFT = "0 1px 3px rgba(0,0,0,0.85)";

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
      style={{
        width: "100%",
        maxWidth: 1280,
        margin: "0 auto",
        padding: "28px 28px 64px",
        animation: "fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        color: "#e8eeff",
      }}
    >
      {/* HUD header */}
      <header style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, color: "#67e8f9",
            letterSpacing: "0.22em",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontWeight: 700,
            textShadow: `0 0 10px rgba(103,232,249,0.55), ${TS}`,
          }}>
            ≡ INDEX · NODE REGISTRY
          </span>
          <span style={{
            fontSize: 9, color: "rgba(200,215,255,0.78)",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            letterSpacing: "0.16em",
            textShadow: TS,
          }}>
            {sorted.length} / {pages.length} ENTRIES
          </span>
        </div>
        <h2 style={{
          color: "#ffffff", fontWeight: 700, fontSize: 22,
          letterSpacing: "-0.01em", marginBottom: 4,
          fontFamily: "Inter, system-ui, sans-serif",
          textShadow: TS_SOFT,
        }}>
          Knowledge nodes
        </h2>
        <p style={{
          color: "rgba(200,215,255,0.72)", fontSize: 13,
          maxWidth: 720, lineHeight: 1.55,
          fontFamily: "Inter, system-ui, sans-serif",
          textShadow: TS_SOFT,
        }}>
          Sortable index of every page in the vault. Click any row to open the node.
        </p>
      </header>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid rgba(140,180,255,0.18)",
                background: "rgba(7,11,26,0.55)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                position: "sticky",
                top: 52, // sits below sticky nav from HomeClient (height 52)
                zIndex: 2,
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
                      fontWeight: 700,
                      fontSize: 8.5,
                      color: active ? "#67e8f9" : "rgba(200,215,255,0.55)",
                      cursor: "pointer",
                      userSelect: "none",
                      textTransform: "uppercase",
                      letterSpacing: "0.22em",
                      whiteSpace: "nowrap",
                      fontFamily: "ui-monospace, 'SF Mono', monospace",
                      transition: "color 0.18s",
                      textShadow: active
                        ? `0 0 10px rgba(103,232,249,0.85), ${TS}`
                        : TS,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#e8eeff"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "rgba(200,215,255,0.55)"; }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {COL_LABELS[col]}
                      <span
                        style={{
                          opacity: active ? 1 : 0.35,
                          color: active ? "#67e8f9" : "currentColor",
                          fontSize: 10,
                          textShadow: active ? "0 0 8px rgba(103,232,249,0.85)" : "none",
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
              const tc = TYPE_COLORS[page.type] ?? {
                bg: "rgba(148,163,184,0.06)",
                color: "rgba(200,215,255,0.78)",
              };
              const isHover = hoverSlug === page.slug;
              const degree = linkDegrees.get(page.slug) ?? 0;
              return (
                <tr
                  key={page.slug}
                  style={{
                    borderBottom: "1px solid rgba(140,180,255,0.06)",
                    background: isHover ? `${tc.color}07` : "transparent",
                    transition: "background 0.18s",
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
                        top: "14%",
                        bottom: "14%",
                        width: 2,
                        background: tc.color,
                        opacity: isHover ? 1 : 0,
                        boxShadow: isHover ? `0 0 10px ${tc.color}` : "none",
                        transition: "opacity 0.18s",
                        borderRadius: "0 2px 2px 0",
                      }}
                    />
                    <Link
                      href={`/wiki/${page.slug}`}
                      style={{
                        color: isHover ? tc.color : "#e8eeff",
                        textDecoration: "none",
                        fontWeight: 500,
                        fontSize: 13.5,
                        transition: "color 0.15s",
                        display: "block",
                        fontFamily: "Inter, system-ui, sans-serif",
                        textShadow: isHover ? `0 0 12px ${tc.color}88, ${TS}` : TS,
                      }}
                    >
                      {page.title}
                    </Link>
                    {page.excerpt && (
                      <p
                        style={{
                          color: "rgba(180,200,240,0.55)",
                          fontSize: 11.5,
                          marginTop: 4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 540,
                          lineHeight: 1.4,
                          fontFamily: "Inter, system-ui, sans-serif",
                          textShadow: TS_SOFT,
                        }}
                      >
                        {page.excerpt}
                      </p>
                    )}
                    {/* Domain pills inline (subtle) */}
                    {page.domain.length > 0 && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                        {page.domain.slice(0, 2).map((d) => {
                          const c = DOMAIN_COLORS[d] ?? "rgba(200,215,255,0.55)";
                          return (
                            <span key={d} style={{
                              fontSize: 7.5,
                              color: c,
                              border: `1px solid ${c}33`,
                              padding: "1px 6px",
                              borderRadius: 2,
                              letterSpacing: "0.22em",
                              fontFamily: "ui-monospace, 'SF Mono', monospace",
                              fontWeight: 700,
                              textTransform: "uppercase" as const,
                              textShadow: `0 0 8px ${c}66, ${TS}`,
                              boxShadow: `0 0 8px ${c}14`,
                            }}>
                              {d}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "14px 18px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: tc.bg,
                        color: tc.color,
                        border: `1px solid ${tc.color}40`,
                        borderRadius: 4,
                        padding: "3px 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase" as const,
                        fontFamily: "ui-monospace, 'SF Mono', monospace",
                        boxShadow: isHover ? `0 0 14px ${tc.color}40` : `0 0 8px ${tc.color}18`,
                        textShadow: `0 0 8px ${tc.color}aa, ${TS}`,
                        transition: "box-shadow 0.18s",
                      }}
                    >
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: tc.color,
                        boxShadow: `0 0 8px ${tc.color}, 0 0 3px ${tc.color}`,
                      }} />
                      {page.type}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "14px 18px",
                      color: "rgba(220,228,255,0.78)",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      fontFamily: "ui-monospace, 'SF Mono', monospace",
                      letterSpacing: "0.08em",
                      textShadow: TS,
                    }}
                  >
                    {page.lastUpdated || "—"}
                  </td>
                  <td style={{
                    padding: "14px 18px",
                    color: page.sources.length ? "#c4b5fd" : "rgba(140,160,200,0.45)",
                    fontSize: 12, fontWeight: 700,
                    fontFamily: "ui-monospace, 'SF Mono', monospace",
                    textShadow: page.sources.length
                      ? `0 0 10px rgba(196,181,253,0.55), ${TS}`
                      : TS,
                  }}>
                    {page.sources.length || "—"}
                  </td>
                  <td style={{
                    padding: "14px 18px",
                    color: degree > 0 ? "#a78bfa" : "rgba(140,160,200,0.45)",
                    fontSize: 12, fontWeight: 700,
                    fontFamily: "ui-monospace, 'SF Mono', monospace",
                    textShadow: degree > 0
                      ? `0 0 10px rgba(167,139,250,0.55), ${TS}`
                      : TS,
                  }}>
                    {degree}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div
          style={{
            padding: "72px 0",
            textAlign: "center",
            color: "rgba(140,160,200,0.65)",
            fontSize: 11,
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            letterSpacing: "0.22em",
            textShadow: TS,
          }}
        >
          ◌ NO NODES IN SELECTED DOMAINS
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
