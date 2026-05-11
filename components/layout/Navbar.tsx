"use client";

import Link from "next/link";
import { useState } from "react";
import { HUD } from "@/components/hud/primitives";

type ViewMode = "graph" | "list" | "heat";

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onSearchOpen: () => void;
}

// Strong text-shadow recipe for legibility against the galaxy
const TS = "0 1px 4px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85), 0 0 32px rgba(0,0,0,0.55)";

export default function Navbar({ view, onViewChange, onSearchOpen }: Props) {
  return (
    <header
      style={{
        position: "relative",
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 26px",
        background: "transparent",
        flexShrink: 0,
        zIndex: 20,
        marginTop: 10,
      }}
    >
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ filter: `drop-shadow(0 0 8px ${HUD.cyan}aa) drop-shadow(0 1px 3px rgba(0,0,0,0.9))` }}>
          <polygon points="12,2 21,7 21,17 12,22 3,17 3,7"
            stroke={HUD.cyan} strokeWidth="1.1" fill="none" strokeOpacity="0.95" />
          <polygon points="12,7 17.5,10 17.5,14 12,17 6.5,14 6.5,10"
            stroke={HUD.violet} strokeWidth="0.6" fill={HUD.violet} fillOpacity="0.22" strokeOpacity="0.7" />
          <circle cx="12" cy="12" r="1.8" fill="#e0e7ff" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <span style={{
            color: "#e8eeff", fontWeight: 700, fontSize: 13,
            letterSpacing: "0.16em", lineHeight: 1,
            fontFamily: HUD.font,
            textShadow: TS,
          }}>
            2BRAIN
          </span>
          <span style={{
            fontSize: 7.5, color: "rgba(180,200,240,0.8)",
            letterSpacing: "0.22em", fontFamily: HUD.font,
            lineHeight: 1.5, marginTop: 2,
            textShadow: TS,
          }}>
            KNOWLEDGE OS · v1.0
          </span>
        </div>
      </Link>

      {/* Live status */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 6 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: HUD.cyan,
          boxShadow: `0 0 8px ${HUD.cyan}cc, 0 0 3px ${HUD.cyan}`,
          animation: "navPulse 2s ease-in-out infinite",
        }} />
        <span style={{
          fontSize: 8, color: "rgba(200,215,255,0.78)",
          letterSpacing: "0.22em",
          fontFamily: HUD.font, fontWeight: 700,
          textShadow: TS,
        }}>
          LIVE · SYNCED
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search trigger — transparent, only text + icon */}
      <SearchTrigger onClick={onSearchOpen} />

      {/* View toggle — transparent segmented text */}
      <ViewSegment view={view} onChange={onViewChange} />

      <style>{`
        @keyframes navPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>
    </header>
  );
}

/* ── Search button: transparent, text-only ───────────────────────────── */
function SearchTrigger({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "transparent",
        border: "none",
        padding: "5px 4px",
        color: hover ? "#e8eeff" : "rgba(200,215,255,0.7)",
        fontSize: 11.5,
        cursor: "pointer",
        fontFamily: HUD.fontUi,
        transition: "color 0.22s",
        textShadow: TS,
      }}
    >
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
        style={{
          flexShrink: 0,
          opacity: 0.95,
          filter: `drop-shadow(0 0 ${hover ? 8 : 4}px ${HUD.cyan}${hover ? "aa" : "55"}) drop-shadow(0 1px 2px rgba(0,0,0,0.9))`,
          color: hover ? HUD.cyan : "currentColor",
          transition: "all 0.22s",
        }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span style={{ letterSpacing: "0.02em" }}>Search the galaxy…</span>
      <kbd style={{
        marginLeft: 4,
        padding: "1px 6px", fontSize: 9,
        color: "rgba(200,215,255,0.75)",
        fontFamily: HUD.font,
        background: "transparent",
        border: "1px solid rgba(140,180,255,0.28)",
        borderRadius: 3,
        letterSpacing: "0.08em",
        textShadow: TS,
      }}>
        ⌘K
      </kbd>
    </button>
  );
}

/* ── View segment: transparent, color/underline only ─────────────────── */
function ViewSegment({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items = [
    { v: "graph" as const, icon: "⬡", label: "Graph",   accent: HUD.cyan   },
    { v: "list"  as const, icon: "≡", label: "List",    accent: HUD.icy    },
    { v: "heat"  as const, icon: "◉", label: "Heat",    accent: HUD.violet },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {items.map((it) => (
        <SegmentItem
          key={it.v}
          active={view === it.v}
          accent={it.accent}
          onClick={() => onChange(it.v)}
          label={it.label}
          icon={it.icon}
        />
      ))}
    </div>
  );
}

function SegmentItem({
  active, accent, onClick, label, icon,
}: {
  active: boolean; accent: string;
  onClick: () => void; label: string; icon: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "5px 10px 7px",
        fontSize: 10.5, fontWeight: 700, cursor: "pointer",
        border: "none",
        background: "transparent",
        color: active ? accent : hover ? "#e8eeff" : "rgba(180,200,240,0.7)",
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        fontFamily: HUD.font,
        transition: "color 0.22s",
        textShadow: active
          ? `0 0 14px ${accent}aa, 0 1px 4px rgba(0,0,0,0.95), 0 0 24px rgba(0,0,0,0.7)`
          : TS,
      }}
    >
      <span style={{ opacity: active ? 1 : hover ? 0.95 : 0.7 }}>{icon}</span>
      <span>{label}</span>
      {/* Active underline */}
      <span style={{
        position: "absolute",
        bottom: 0, left: 8, right: 8,
        height: 1,
        background: active
          ? `linear-gradient(90deg, transparent, ${accent}, transparent)`
          : "transparent",
        boxShadow: active ? `0 0 8px ${accent}cc` : "none",
        transition: "all 0.22s",
        opacity: active ? 1 : 0,
      }} />
    </button>
  );
}
