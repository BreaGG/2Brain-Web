"use client";

import { createPortal } from "react-dom";
import type { GraphNode } from "@/lib/types";

const TYPE_META: Record<string, { dot: string; label: string }> = {
  concept:          { dot: "#4f9cf9", label: "CONCEPT" },
  person:           { dot: "#4ade80", label: "PERSON" },
  "source-summary": { dot: "#facc15", label: "SOURCE" },
  synthesis:        { dot: "#c084fc", label: "SYNTHESIS" },
  ghost:            { dot: "#52525b", label: "GHOST" },
  meta:             { dot: "#71717a", label: "META" },
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
};

interface Props {
  node: GraphNode;
  x: number;
  y: number;
}

export default function NodeTooltip({ node, x, y }: Props) {
  const meta = TYPE_META[node.type] ?? { dot: "#71717a", label: node.type.toUpperCase() };
  const c    = meta.dot;

  /* keep tooltip on-screen */
  const left = Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 256);
  const top  = y - 4;

  return createPortal(
    <div style={{ left, top, pointerEvents: "none", position: "fixed", zIndex: 50, width: 230 }}>
      <div style={{
        background: "rgba(2,4,10,0.96)",
        border: `1px solid ${c}22`,
        borderRadius: 5,
        padding: "11px 13px",
        boxShadow: `0 0 0 1px ${c}0e, 0 24px 56px rgba(0,0,0,0.97), 0 0 28px ${c}0a`,
        backdropFilter: "blur(20px)",
        position: "relative",
      }}>
        {/* Corner brackets */}
        <div style={{ position: "absolute", top: -1, left: -1, width: 9, height: 9, borderTop: `1px solid ${c}70`, borderLeft: `1px solid ${c}70` }} />
        <div style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderBottom: `1px solid ${c}70`, borderRight: `1px solid ${c}70` }} />

        {/* Type + domains row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: c, display: "inline-block", flexShrink: 0,
            boxShadow: `0 0 7px ${c}cc`,
          }} />
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            color: c, fontFamily: "monospace",
          }}>{meta.label}</span>
          {node.domain.map((d) => (
            <span key={d} style={{
              fontSize: 9, color: DOMAIN_COLORS[d] ?? "#52525b",
              letterSpacing: "0.08em", fontFamily: "monospace",
            }}>
              · {d}
            </span>
          ))}
        </div>

        {/* Title */}
        <p style={{
          color: "#efefef", fontWeight: 600, fontSize: 13,
          lineHeight: 1.35, marginBottom: 10,
        }}>
          {node.label}
        </p>

        {/* Separator */}
        <div style={{ height: 1, background: `linear-gradient(90deg, ${c}20, transparent)`, marginBottom: 9 }} />

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace" }}>
            {node.degree} link{node.degree !== 1 ? "s" : ""}
          </span>
          {node.broken ? (
            <span style={{ fontSize: 9, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.1em" }}>
              ○ GHOST NODE
            </span>
          ) : (
            <span style={{ fontSize: 9, color: "#1f1f1f", fontFamily: "monospace", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.id}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
