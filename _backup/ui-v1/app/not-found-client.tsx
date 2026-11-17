"use client";

import Link from "next/link";

export default function NotFoundClient() {
  return (
    <Link
      href="/"
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        border: "1px solid rgba(91,163,255,0.25)",
        background: "rgba(91,163,255,0.05)",
        borderRadius: 4, padding: "10px 24px",
        color: "#5ba3ff", fontSize: 12, fontWeight: 600,
        textDecoration: "none", letterSpacing: "0.08em",
        textTransform: "uppercase",
        boxShadow: "0 0 20px rgba(91,163,255,0.06)",
        transition: "all 0.2s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,163,255,0.55)";
        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(91,163,255,0.10)";
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 28px rgba(91,163,255,0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,163,255,0.25)";
        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(91,163,255,0.05)";
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 20px rgba(91,163,255,0.06)";
      }}
    >
      <span style={{ position: "absolute", top: -1, left: -1, width: 8, height: 8, borderTop: "1px solid rgba(91,163,255,0.6)", borderLeft: "1px solid rgba(91,163,255,0.6)" }} />
      <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderBottom: "1px solid rgba(91,163,255,0.6)", borderRight: "1px solid rgba(91,163,255,0.6)" }} />
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M8 6H4M4 6L6 4M4 6L6 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      Return to Graph
    </Link>
  );
}
