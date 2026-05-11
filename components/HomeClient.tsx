"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ParsedPage, GraphData } from "@/lib/types";
import GraphControls from "@/components/graph/GraphControls";
import PageTable from "@/components/list/PageTable";
import SearchModal from "@/components/search/SearchModal";
import Navbar from "@/components/layout/Navbar";
import StatsPanel from "@/components/graph/StatsPanel";
import { useHandTracking } from "@/components/HandTrackingContext";

const KnowledgeGraph = dynamic(() => import("@/components/graph/GalaxyGraph"),   { ssr: false });
const Heatmap        = dynamic(() => import("@/components/heat/Heatmap"),         { ssr: false });

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
  const [view, setView]               = useState<"graph" | "list" | "heat">("graph");
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen]   = useState(false);
  const [isMobile, setIsMobile]       = useState(false);
  const { active: handActive } = useHandTracking();

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
      <div style={{ height: "100dvh", width: "100%", background: "#050816", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Mobile top bar — transparent, text only */}
        <div style={{
          height: 46, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px",
          background: "transparent",
          zIndex: 20,
        }}>
          {/* Logo */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, filter: "drop-shadow(0 0 6px rgba(103,232,249,0.8)) drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}>
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke="#67e8f9" strokeWidth="1.1" fill="none" strokeOpacity="0.95" />
            <circle cx="12" cy="12" r="1.8" fill="#e0e7ff" />
          </svg>
          <span style={{
            color: "#e8eeff", fontWeight: 700, fontSize: 12,
            letterSpacing: "0.18em", flex: 1,
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85)",
          }}>
            2BRAIN
          </span>
          {/* View toggle — transparent, color/underline only */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(["graph", "list", "heat"] as const).map((v) => {
              const active = view === v;
              const activeColor = v === "heat" ? "#a78bfa" : v === "list" ? "#7dd3fc" : "#67e8f9";
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    position: "relative",
                    padding: "5px 8px 7px", fontSize: 9.5,
                    cursor: "pointer", fontWeight: 700,
                    border: "none",
                    background: "transparent",
                    color: active ? activeColor : "rgba(200,215,255,0.62)",
                    letterSpacing: "0.18em", textTransform: "uppercase" as const,
                    fontFamily: "ui-monospace, 'SF Mono', monospace",
                    transition: "color 0.22s",
                    textShadow: active
                      ? `0 0 12px ${activeColor}cc, 0 1px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85)`
                      : "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85)",
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.85 }}>
                    {v === "graph" ? "⬡" : v === "list" ? "≡" : "◉"}
                  </span>{" "}
                  {v}
                  {active && (
                    <span style={{
                      position: "absolute",
                      bottom: 0, left: 6, right: 6, height: 1,
                      background: `linear-gradient(90deg, transparent, ${activeColor}, transparent)`,
                      boxShadow: `0 0 6px ${activeColor}cc`,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        {view === "graph" && (
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <KnowledgeGraph data={graphData} activeDomains={activeDomains} pages={pages} />
          </div>
        )}
        {view === "list" && (
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
            <PageTable pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
          </div>
        )}
        {view === "heat" && (
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <Heatmap pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
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

      {/* Heat view — 3D terrain, fills viewport below nav */}
      {view === "heat" && (
        <div style={{ position: "absolute", inset: 0, top: 96, zIndex: 5, overflow: "hidden" }}>
          <Heatmap pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
        </div>
      )}

      {/* StatsPanel overlay — hidden in hand-tracking mode */}
      {view === "graph" && !handActive && (
        <StatsPanel pages={pages} graphData={graphData} activeDomains={activeDomains} onToggleDomain={toggleDomain} />
      )}

      {/* Top UI overlay — nav + control bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Navbar view={view} onViewChange={setView} onSearchOpen={() => setSearchOpen(true)} />
        </div>

        {/* Control bar — HUD strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 26px 0",
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
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 14px",
          background: "rgba(7,11,26,0.4)",
          backdropFilter: "blur(22px) saturate(140%)",
          WebkitBackdropFilter: "blur(22px) saturate(140%)",
          border: "1px solid rgba(140,180,255,0.14)",
          borderRadius: 8,
          boxShadow: "0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          position: "relative", overflow: "hidden",
        }}>
          <span style={{
            position: "absolute", top: 0, left: 10, right: 10, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(140,180,255,0.55), transparent)",
            pointerEvents: "none",
          }} />
          <span style={{ fontSize: 8, color: "rgba(140,160,200,0.55)", letterSpacing: "0.22em", fontWeight: 700 }}>
            SIG
          </span>
          <span style={{ fontSize: 11, color: "#67e8f9", fontWeight: 700, textShadow: "0 0 10px rgba(103,232,249,0.55)" }}>
            {String(visibleCount).padStart(3, "0")}
          </span>
          <span style={{ fontSize: 9, color: "rgba(140,160,200,0.4)" }}>·</span>
          <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, textShadow: "0 0 10px rgba(167,139,250,0.55)" }}>
            {String(graphData.edges.length).padStart(3, "0")}
          </span>
          <span style={{ fontSize: 8, color: "rgba(140,160,200,0.55)", letterSpacing: "0.18em" }}>
            LNK
          </span>
        </div>
        </div>
      </div>

      {/* Footer — transparent, only text + dots with strong shadow for contrast */}
      {view === "graph" && (
        <footer style={{
          position: "absolute",
          left: 26, right: 26, bottom: 14,
          height: 32,
          display: "flex", alignItems: "center",
          background: "transparent",
          zIndex: 20,
          pointerEvents: "none",
        }}>
          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {LEGEND.map(({ label, color }) => (
              <span key={label} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 9, color: "#e8eeff",
                letterSpacing: "0.18em", textTransform: "uppercase" as const,
                fontFamily: "ui-monospace, 'SF Mono', monospace",
                fontWeight: 700,
                textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85), 0 0 32px rgba(0,0,0,0.55)",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: color, flexShrink: 0,
                  boxShadow: `0 0 8px ${color}cc, 0 0 2px ${color}, 0 0 16px rgba(0,0,0,0.85)`,
                }} />
                {label}
              </span>
            ))}
            <span style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 9, color: "rgba(200,215,255,0.62)",
              letterSpacing: "0.18em", textTransform: "uppercase" as const,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontWeight: 700,
              textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85)",
            }}>
              <span style={{
                width: 14, borderTop: "1px dashed rgba(200,215,255,0.55)",
                flexShrink: 0,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.85))",
              }} />
              ghost
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Control hints */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {[["SCROLL", "ZOOM"], ["DRAG", "ORBIT"], ["CLICK", "OPEN"]].map(([action, hint]) => (
              <span key={action} style={{
                display: "flex", alignItems: "center", gap: 7,
                fontSize: 9.5, letterSpacing: "0.06em",
                fontFamily: "ui-monospace, 'SF Mono', monospace",
              }}>
                <kbd style={{
                  border: "1px solid rgba(200,215,255,0.40)",
                  borderRadius: 3,
                  padding: "2px 7px", fontSize: 9,
                  color: "#e8eeff",
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                  background: "transparent",
                  lineHeight: 1.4, fontWeight: 700, letterSpacing: "0.14em",
                  textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                }}>{action}</kbd>
                <span style={{
                  color: "rgba(200,215,255,0.78)", fontSize: 8.5,
                  letterSpacing: "0.18em", fontWeight: 700,
                  textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85)",
                }}>
                  → {hint}
                </span>
              </span>
            ))}
          </div>
        </footer>
      )}

      <SearchModal pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
