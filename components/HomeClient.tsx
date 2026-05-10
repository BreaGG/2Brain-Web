"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ParsedPage, GraphData } from "@/lib/types";
import GraphControls from "@/components/graph/GraphControls";
import PageTable from "@/components/list/PageTable";
import SearchModal from "@/components/search/SearchModal";
import Navbar from "@/components/layout/Navbar";
import StatsPanel from "@/components/graph/StatsPanel";

const KnowledgeGraph = dynamic(() => import("@/components/graph/KnowledgeGraph"), { ssr: false });

interface Props {
  pages: ParsedPage[];
  graphData: GraphData;
  allDomains: string[];
}

const LEGEND = [
  { label: "concept",   color: "#4f9cf9" },
  { label: "person",    color: "#4ade80" },
  { label: "source",    color: "#facc15" },
  { label: "synthesis", color: "#c084fc" },
];

const MOBILE_BREAKPOINT = 768;

export default function HomeClient({ pages, graphData, allDomains }: Props) {
  const [view, setView]               = useState<"graph" | "list">("graph");
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen]   = useState(false);
  const [isMobile, setIsMobile]       = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function toggleDomain(d: string) {
    setActiveDomains((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  const linkDegrees = new Map<string, number>();
  for (const node of graphData.nodes) linkDegrees.set(node.id, node.degree);

  const visibleCount = pages.filter(
    (p) => activeDomains.size === 0 || p.domain.some((d) => activeDomains.has(d))
  ).length;

  /* ── MOBILE LAYOUT ── */
  if (isMobile) {
    return (
      <div style={{ height: "100dvh", width: "100%", background: "#00000f", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Mobile top bar */}
        <div style={{
          height: 48, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 12,
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,10,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          zIndex: 20,
        }}>
          {/* Logo mark */}
          <svg width="16" height="18" viewBox="0 0 18 20" fill="none" style={{ flexShrink: 0 }}>
            <polygon points="9,1 17,5.5 17,14.5 9,19 1,14.5 1,5.5"
              stroke="#4f9cf9" strokeWidth="1" fill="none" strokeOpacity="0.8" />
            <circle cx="9" cy="10" r="1.5" fill="#4f9cf9" opacity="0.6" />
          </svg>
          <span style={{ color: "#e8e8e8", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", flex: 1 }}>
            2BRAIN
          </span>
          {/* View toggle */}
          <div style={{
            display: "flex", alignItems: "center",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4, overflow: "hidden",
          }}>
            {(["graph", "list"] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "5px 14px", fontSize: 10, cursor: "pointer", fontWeight: 600,
                  border: "none",
                  borderRight: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                  background: view === v ? "rgba(79,156,249,0.12)" : "transparent",
                  color: view === v ? "#4f9cf9" : "#52525b",
                  letterSpacing: "0.08em", textTransform: "uppercase" as const,
                  fontFamily: "inherit",
                }}
              >
                {v === "graph" ? "⬡" : "≡"} {v}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        {view === "graph" ? (
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <KnowledgeGraph data={graphData} activeDomains={activeDomains} pages={pages} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            <PageTable pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
          </div>
        )}
      </div>
    );
  }

  /* ── DESKTOP LAYOUT ── */
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden", background: "#00000f" }}>
      {/* Graph fills entire viewport BEHIND nav/footer */}
      {view === "graph" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <KnowledgeGraph data={graphData} activeDomains={activeDomains} pages={pages} />
        </div>
      )}

      {/* List view (when active) — full viewport with top padding for nav */}
      {view === "list" && (
        <div style={{ position: "absolute", inset: 0, top: 96, zIndex: 5, overflowY: "auto" }}>
          <PageTable pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
        </div>
      )}

      {/* StatsPanel overlay */}
      {view === "graph" && (
        <StatsPanel pages={pages} graphData={graphData} activeDomains={activeDomains} onToggleDomain={toggleDomain} />
      )}

      {/* Top UI overlay — nav + control bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Navbar view={view} onViewChange={setView} onSearchOpen={() => setSearchOpen(true)} />
        </div>

        {/* Control bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "7px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "transparent",
          position: "relative",
          pointerEvents: "auto",
        }}>
        <GraphControls
          allDomains={allDomains}
          activeDomains={activeDomains}
          onToggle={toggleDomain}
          onReset={() => setActiveDomains(new Set())}
        />
        <div style={{
          marginLeft: "auto",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 9, color: "#a1a1aa", fontFamily: "monospace", letterSpacing: "0.1em", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
            {visibleCount} nodes
          </span>
          <span style={{ fontSize: 9, color: "#52525b", fontFamily: "monospace" }}>·</span>
          <span style={{ fontSize: 9, color: "#a1a1aa", fontFamily: "monospace", letterSpacing: "0.1em", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
            {graphData.edges.length} edges
          </span>
        </div>
        </div>
      </div>

      {/* Footer overlay — HUD status bar */}
      {view === "graph" && (
        <footer style={{
          display: "flex", alignItems: "center",
          gap: 0,
          padding: "0 20px",
          height: 36,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "transparent",
          position: "absolute",
          left: 0, right: 0, bottom: 0,
          zIndex: 20,
          pointerEvents: "none",
        }}>
          {/* Top gradient */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
            pointerEvents: "none",
          }} />

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {LEGEND.map(({ label, color }) => (
              <span key={label} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 9, color: "#9ca3af",
                letterSpacing: "0.08em", textTransform: "uppercase" as const,
                fontFamily: "monospace",
                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: color, display: "inline-block", flexShrink: 0,
                  boxShadow: `0 0 5px ${color}70`,
                }} />
                {label}
              </span>
            ))}
            <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.06)", flexShrink: 0, marginLeft: 2 }} />
            <span style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 9, color: "#3f3f46",
              letterSpacing: "0.08em", textTransform: "uppercase" as const,
              fontFamily: "monospace",
            }}>
              <span style={{
                width: 14, borderTop: "1px dashed rgba(255,255,255,0.15)",
                display: "inline-block", flexShrink: 0,
              }} />
              ghost
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Hints */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {[["scroll", "zoom"], ["drag", "rotate"], ["click", "open"]].map(([action, hint]) => (
              <span key={action} style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 10, letterSpacing: "0.04em", fontFamily: "monospace",
              }}>
                <kbd style={{
                  border: "1px solid rgba(255,255,255,0.20)", borderRadius: 3,
                  padding: "2px 6px", fontSize: 10, color: "#d4d4d8",
                  fontFamily: "monospace", background: "rgba(0,0,0,0.45)",
                  backdropFilter: "blur(6px)",
                  lineHeight: 1.4,
                  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                }}>{action}</kbd>
                <span style={{ color: "#a1a1aa", fontSize: 10, textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}>→ {hint}</span>
              </span>
            ))}
          </div>
        </footer>
      )}

      <SearchModal pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
