"use client";

import { useState } from "react";
import { HUD, DOMAIN_COLORS } from "@/components/hud/primitives";

interface Props {
  allDomains: string[];
  activeDomains: Set<string>;
  onToggle: (domain: string) => void;
  onReset: () => void;
}

export default function GraphControls({ allDomains, activeDomains, onToggle, onReset }: Props) {
  return (
    <div style={{
      position: "relative",
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 12px",
      background: "rgba(7,11,26,0.45)",
      backdropFilter: HUD.blur,
      WebkitBackdropFilter: HUD.blur,
      border: HUD.border,
      borderRadius: 8,
      boxShadow: HUD.shadow,
      overflow: "hidden",
    }}>
      {/* Top scan line */}
      <span style={{
        position: "absolute", top: 0, left: 10, right: 10, height: 1,
        background: HUD.scanLineCss, pointerEvents: "none",
      }} />

      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.22em",
        color: HUD.textMuted,
        fontFamily: HUD.font,
        flexShrink: 0,
      }}>
        ⌘ DOMAIN
      </span>

      <div style={{ width: 1, height: 14, background: "rgba(140,180,255,0.10)", flexShrink: 0 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
        {allDomains.map((domain) => (
          <DomainChip
            key={domain}
            domain={domain}
            active={activeDomains.has(domain)}
            color={DOMAIN_COLORS[domain] ?? "#94a3b8"}
            onClick={() => onToggle(domain)}
          />
        ))}

        {activeDomains.size > 0 && (
          <ClearButton onClick={onReset} />
        )}
      </div>
    </div>
  );
}

function DomainChip({ domain, active, color, onClick }: {
  domain: string; active: boolean; color: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3.5px 10px 3.5px 8px",
        border: active
          ? `1px solid ${color}66`
          : hover ? `1px solid ${color}40` : "1px solid rgba(140,180,255,0.10)",
        background: active ? `${color}12` : hover ? `${color}06` : "rgba(7,11,26,0.3)",
        borderRadius: 999,
        color: active ? color : hover ? HUD.textPrimary : HUD.textSecondary,
        fontSize: 9.5, fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase" as const,
        fontFamily: HUD.font,
        cursor: "pointer",
        transition: `all 0.22s ${HUD.easeOut}`,
        boxShadow: active
          ? `0 0 0 1px ${color}22, 0 0 14px ${color}40`
          : hover
            ? `0 0 10px ${color}26`
            : "none",
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: active ? color : `${color}88`,
        boxShadow: active ? `0 0 8px ${color}, 0 0 3px ${color}` : `0 0 5px ${color}66`,
        transition: "all 0.18s",
        flexShrink: 0,
      }} />
      {domain}
    </button>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3.5px 10px",
        border: hover ? `1px solid ${HUD.violet}55` : "1px solid rgba(140,180,255,0.10)",
        background: hover ? `${HUD.violet}10` : "transparent",
        borderRadius: 999,
        color: hover ? HUD.violet : HUD.textMuted,
        fontSize: 9, fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        fontFamily: HUD.font,
        cursor: "pointer",
        transition: `all 0.22s ${HUD.easeOut}`,
      }}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>✕</span>
      RESET
    </button>
  );
}
