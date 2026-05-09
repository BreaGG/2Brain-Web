"use client";

import Link from "next/link";

interface Props {
  view: "graph" | "list";
  onViewChange: (v: "graph" | "list") => void;
  onSearchOpen: () => void;
}

export default function Navbar({ view, onViewChange, onSearchOpen }: Props) {
  return (
    <header
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(0,0,0,0.98)",
        backdropFilter: "blur(20px)",
        flexShrink: 0,
        position: "relative",
        zIndex: 20,
      }}
    >
      {/* Bottom gradient accent line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(79,156,249,0.18) 38%, transparent 100%)",
        pointerEvents: "none",
      }} />

      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
        <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
          <polygon points="9,1 17,5.5 17,14.5 9,19 1,14.5 1,5.5"
            stroke="#4f9cf9" strokeWidth="1" fill="none" strokeOpacity="0.8" />
          <polygon points="9,6 13.5,8.5 13.5,13.5 9,16 4.5,13.5 4.5,8.5"
            stroke="#4f9cf9" strokeWidth="0.5" fill="#4f9cf9" fillOpacity="0.07" strokeOpacity="0.35" />
          <circle cx="9" cy="10" r="1.5" fill="#4f9cf9" opacity="0.6" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <span style={{ color: "#e8e8e8", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", lineHeight: 1 }}>
            2BRAIN
          </span>
          <span style={{ fontSize: 8, color: "#3f3f46", letterSpacing: "0.08em", fontFamily: "monospace", lineHeight: 1.4 }}>
            KNOWLEDGE OS
          </span>
        </div>
      </Link>

      {/* Live status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 4 }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "#4ade80", boxShadow: "0 0 8px #4ade80aa",
          display: "inline-block", flexShrink: 0,
        }} />
        <span style={{ fontSize: 8, color: "#27272a", letterSpacing: "0.12em", fontFamily: "monospace" }}>LIVE</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <button
        onClick={onSearchOpen}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 4, padding: "6px 14px",
          color: "#52525b", fontSize: 12, cursor: "pointer",
          transition: "all 0.2s", minWidth: 190,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(79,156,249,0.4)";
          e.currentTarget.style.color = "#a1a1aa";
          e.currentTarget.style.background = "rgba(79,156,249,0.04)";
          e.currentTarget.style.boxShadow = "0 0 14px rgba(79,156,249,0.07), inset 0 0 8px rgba(79,156,249,0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
          e.currentTarget.style.color = "#52525b";
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.7 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span style={{ flex: 1, letterSpacing: "0.01em" }}>Search knowledge…</span>
        <kbd style={{
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 3, padding: "1px 5px",
          fontSize: 9, color: "#3f3f46",
          fontFamily: "monospace", background: "rgba(255,255,255,0.02)",
          letterSpacing: "0.04em",
        }}>
          ⌘K
        </kbd>
      </button>

      {/* View toggle */}
      <div style={{
        display: "flex", alignItems: "center",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4, overflow: "hidden",
      }}>
        {(["graph", "list"] as const).map((v, i) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            style={{
              padding: "5px 16px", fontSize: 10, cursor: "pointer", fontWeight: 600,
              border: "none",
              borderRight: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
              background: view === v ? "rgba(79,156,249,0.1)" : "transparent",
              color: view === v ? "#4f9cf9" : "#52525b",
              transition: "all 0.15s", letterSpacing: "0.1em",
              textTransform: "uppercase" as const, fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { if (view !== v) e.currentTarget.style.color = "#71717a"; }}
            onMouseLeave={(e) => { if (view !== v) e.currentTarget.style.color = "#52525b"; }}
          >
            {v === "graph" ? "⬡ Graph" : "≡ List"}
          </button>
        ))}
      </div>
    </header>
  );
}
