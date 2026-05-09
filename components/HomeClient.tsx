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

  /* ── MOBILE LAYOUT: only the sphere ── */
  if (isMobile) {
    return (
      <div style={{ height: "100%", width: "100%", background: "#000", overflow: "hidden" }}>
        <KnowledgeGraph data={graphData} activeDomains={activeDomains} />
      </div>
    );
  }

  /* ── DESKTOP LAYOUT ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>
      <Navbar view={view} onViewChange={setView} onSearchOpen={() => setSearchOpen(true)} />

      {/* Control bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "7px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(0,0,0,0.98)",
        flexShrink: 0,
        position: "relative",
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
          <span style={{ fontSize: 9, color: "#27272a", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            {visibleCount} nodes
          </span>
          <span style={{ fontSize: 9, color: "#1a1a1a", fontFamily: "monospace" }}>·</span>
          <span style={{ fontSize: 9, color: "#27272a", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            {graphData.edges.length} edges
          </span>
        </div>
      </div>

      <main style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {view === "graph" ? (
          <>
            <KnowledgeGraph data={graphData} activeDomains={activeDomains} />
            <StatsPanel pages={pages} graphData={graphData} activeDomains={activeDomains} onToggleDomain={toggleDomain} />
          </>
        ) : (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PageTable pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
          </div>
        )}
      </main>

      {/* Footer — HUD status bar */}
      {view === "graph" && (
        <footer style={{
          display: "flex", alignItems: "center",
          gap: 0,
          padding: "0 20px",
          height: 36,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.98)",
          flexShrink: 0,
          position: "relative",
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
                fontSize: 9, color: "#3f3f46",
                letterSpacing: "0.08em", textTransform: "uppercase" as const,
                fontFamily: "monospace",
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
                  border: "1px solid rgba(255,255,255,0.14)", borderRadius: 3,
                  padding: "2px 6px", fontSize: 10, color: "#71717a",
                  fontFamily: "monospace", background: "rgba(255,255,255,0.04)",
                  lineHeight: 1.4,
                }}>{action}</kbd>
                <span style={{ color: "#52525b", fontSize: 10 }}>→ {hint}</span>
              </span>
            ))}
          </div>
        </footer>
      )}

      <SearchModal pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
