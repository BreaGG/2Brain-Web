"use client";

import { useState } from "react";
import type { ParsedPage, GraphData } from "@/lib/types";
import { useCountUp } from "@/components/hud/primitives";

interface Props {
  pages: ParsedPage[];
  graphData: GraphData;
  activeDomains: Set<string>;
  onToggleDomain: (d: string) => void;
}

// ── Palette aligned with galaxy ───────────────────────────────────────────
const TYPE_META: Record<string, { color: string; label: string }> = {
  concept:          { color: "#7dd3fc", label: "Concept"   },
  person:           { color: "#67e8f9", label: "Person"    },
  "source-summary": { color: "#c4b5fd", label: "Source"    },
  synthesis:        { color: "#a78bfa", label: "Synthesis" },
  meta:             { color: "#94a3b8", label: "Meta"      },
};
const DOMAIN_COLOR: Record<string, string> = {
  personal: "#f0abfc",
  research: "#7dd3fc",
  reading:  "#c4b5fd",
  business: "#67e8f9",
};

// Triple text-shadow recipe for legibility against the galaxy
const TS = "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85), 0 0 28px rgba(0,0,0,0.55)";
const TS_STRONG = "0 1px 5px rgba(0,0,0,0.98), 0 0 16px rgba(0,0,0,0.95), 0 0 36px rgba(0,0,0,0.65)";

// ── Bar component (glow + subtle backing track for contrast) ────────────
function Bar({ pct, color, height = 2, glow = true }: { pct: number; color: string; height?: number; glow?: boolean }) {
  return (
    <div style={{
      height,
      background: "rgba(0,0,0,0.45)",
      borderRadius: 1,
      overflow: "hidden",
      position: "relative",
      boxShadow: "inset 0 0 4px rgba(0,0,0,0.6)",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(90deg, ${color}aa, ${color})`,
        width: `${Math.min(100, pct * 100)}%`,
        boxShadow: glow ? `0 0 10px ${color}aa, 0 0 3px ${color}` : "none",
        transition: "width 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
    </div>
  );
}

// ── Polar / arc helpers (donut) ─────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, R: number, r: number, s: number, e: number) {
  const g = 2.5, a = s + g / 2, b = e - g / 2;
  if (b - a < 1) return "";
  const o1 = polar(cx, cy, R, a), o2 = polar(cx, cy, R, b);
  const i1 = polar(cx, cy, r, b), i2 = polar(cx, cy, r, a);
  const lg = b - a > 180 ? 1 : 0;
  return `M${o1.x.toFixed(2)},${o1.y.toFixed(2)} A${R},${R} 0 ${lg},1 ${o2.x.toFixed(2)},${o2.y.toFixed(2)} L${i1.x.toFixed(2)},${i1.y.toFixed(2)} A${r},${r} 0 ${lg},0 ${i2.x.toFixed(2)},${i2.y.toFixed(2)} Z`;
}

// ── Bare section (transparent, header + content) ────────────────────────
function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "4px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{
          width: 4, height: 4, borderRadius: 1,
          background: accent,
          boxShadow: `0 0 8px ${accent}cc, 0 0 3px ${accent}, 0 0 12px rgba(0,0,0,0.6)`,
        }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.24em",
          color: "#e8eeff",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          textTransform: "uppercase" as const,
          textShadow: TS_STRONG,
        }}>{title}</span>
        <div style={{
          flex: 1, height: 1,
          background: "linear-gradient(90deg, rgba(200,215,255,0.25), transparent)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }} />
      </div>
      {children}
    </div>
  );
}

// ── Metric tile (animated counter, transparent) ────────────────────────
function MetricTile({ value, label, accent, active, onEnter, onLeave }: {
  value: number | string;
  label: string;
  accent: string;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const numValue = typeof value === "number" ? value : parseFloat(value);
  const isNum = !isNaN(numValue) && typeof value === "number";
  const animated = useCountUp(isNum ? numValue : 0, 1000);
  const display = isNum ? Math.round(animated).toString() : value;

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        padding: "8px 6px",
        textAlign: "center",
        cursor: "default",
        transition: "transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: active ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={{
        fontSize: 26, fontWeight: 700,
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        color: active ? accent : "#e8eeff",
        letterSpacing: "-0.02em", lineHeight: 1,
        textShadow: active
          ? `0 0 18px ${accent}cc, 0 0 6px ${accent}88, ${TS_STRONG}`
          : TS_STRONG,
        transition: "color 0.18s, text-shadow 0.18s",
      }}>
        {display}
      </div>
      <div style={{
        fontSize: 7.5, marginTop: 6, fontWeight: 700,
        color: active ? accent : "rgba(200,215,255,0.78)",
        letterSpacing: "0.22em",
        textTransform: "uppercase" as const,
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        textShadow: active ? `0 0 10px ${accent}aa, ${TS}` : TS,
        transition: "color 0.18s",
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────
export default function StatsPanel({ pages, graphData, activeDomains, onToggleDomain }: Props) {
  const [hm, setHm] = useState<string | null>(null);
  const [hs, setHs] = useState<string | null>(null);

  const real   = graphData.nodes.filter((n) => !n.broken);
  const ghosts = graphData.nodes.filter((n) =>  n.broken);
  const avgDeg = real.length ? +(real.reduce((s, n) => s + n.degree, 0) / real.length).toFixed(1) : 0;

  const tc: Record<string, number> = {};
  for (const n of real) tc[n.type] = (tc[n.type] ?? 0) + 1;
  const typeEntries = Object.entries(tc).sort((a, b) => b[1] - a[1]);
  const typeTotal   = typeEntries.reduce((s, [, c]) => s + c, 0);

  const dc: Record<string, number> = {};
  for (const p of pages) for (const d of p.domain) dc[d] = (dc[d] ?? 0) + 1;
  const domainEntries = Object.entries(dc).sort((a, b) => b[1] - a[1]);
  const domMax = domainEntries[0]?.[1] ?? 1;

  const top = [...real].sort((a, b) => b.degree - a.degree).slice(0, 5);

  // Donut
  const DS = 132, CX = DS / 2, CY = DS / 2, R = 54, IR = 34;
  let cur = 0;
  const slices = typeEntries.map(([type, count]) => {
    const pct = count / typeTotal, span = pct * 360;
    const path = arc(CX, CY, R, IR, cur, cur + span);
    cur += span;
    return { type, count, pct, path };
  });

  const METRICS = [
    { id: "pages",   value: real.length,                                       label: "PAGES",    accent: "#7dd3fc" },
    { id: "links",   value: graphData.edges.length,                            label: "LINKS",    accent: "#a78bfa" },
    { id: "ghosts",  value: ghosts.length,                                     label: "GHOSTS",   accent: "#c4b5fd" },
    { id: "avg",     value: avgDeg,                                            label: "AVG",      accent: "#67e8f9" },
    { id: "orphans", value: real.filter((n) => n.degree <= 1).length,          label: "ORPHANS",  accent: "#f0abfc" },
    { id: "sources", value: pages.reduce((s, p) => s + p.sources.length, 0),   label: "SOURCES",  accent: "#fbcfe8" },
  ];

  return (
    <div style={{
      position: "absolute", right: 28, top: 110,
      width: 520, pointerEvents: "auto", zIndex: 10,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 22,
    }}>
      {/* TOP-LEFT: Vault metrics */}
      <Section title="VAULT METRICS" accent="#7dd3fc">
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
        }}>
          {METRICS.map(({ id, value, label, accent }) => (
            <MetricTile
              key={id}
              value={value}
              label={label}
              accent={accent}
              active={hm === id}
              onEnter={() => setHm(id)}
              onLeave={() => setHm(null)}
            />
          ))}
        </div>
      </Section>

      {/* TOP-RIGHT: Content types donut */}
      <Section title="CONTENT SPECTRUM" accent="#a78bfa">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width={DS} height={DS} style={{
            flexShrink: 0,
            filter: "drop-shadow(0 0 10px rgba(167,139,250,0.25)) drop-shadow(0 2px 8px rgba(0,0,0,0.85))",
          }}>
            <circle cx={CX} cy={CY} r={R + 6} fill="none" stroke="rgba(200,215,255,0.14)" strokeWidth={1} />
            <circle cx={CX} cy={CY} r={R + 2} fill="none" stroke="rgba(200,215,255,0.10)" strokeWidth={1} strokeDasharray="2 4" />
            {slices.map(({ type, path }) => {
              const m  = TYPE_META[type] ?? { color: "#94a3b8" };
              const on = hs === type;
              return path ? (
                <path key={type} d={path} fill={m.color}
                  opacity={on ? 1 : hs ? 0.20 : 0.92}
                  filter={on ? `drop-shadow(0 0 10px ${m.color})` : `drop-shadow(0 0 4px ${m.color}88)`}
                  style={{ cursor: "pointer", transition: "opacity 0.18s, filter 0.18s" }}
                  onMouseEnter={() => setHs(type)}
                  onMouseLeave={() => setHs(null)}
                />
              ) : null;
            })}
            {/* Center hub: dark disc for text contrast */}
            <circle cx={CX} cy={CY} r={IR - 2} fill="rgba(0,0,0,0.55)"
              style={{ filter: "drop-shadow(0 0 6px rgba(0,0,0,0.95))" }} />
            <text x={CX} y={CY - 3} textAnchor="middle"
              fill="#e8eeff" fontSize={20} fontWeight={700}
              fontFamily="ui-monospace, monospace"
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.95))" }}>
              {typeTotal}
            </text>
            <text x={CX} y={CY + 11} textAnchor="middle"
              fill="rgba(200,215,255,0.78)" fontSize={7}
              fontFamily="ui-monospace, monospace" letterSpacing="0.22em"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.95))" }}>
              NODES
            </text>
          </svg>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            {slices.map(({ type, count, pct }) => {
              const m  = TYPE_META[type] ?? { color: "#94a3b8", label: type };
              const on = hs === type;
              return (
                <div key={type}
                  style={{ cursor: "default" }}
                  onMouseEnter={() => setHs(type)}
                  onMouseLeave={() => setHs(null)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: m.color, flexShrink: 0,
                      boxShadow: on
                        ? `0 0 10px ${m.color}, 0 0 3px ${m.color}, 0 0 14px rgba(0,0,0,0.85)`
                        : `0 0 6px ${m.color}aa, 0 0 12px rgba(0,0,0,0.85)`,
                      transition: "box-shadow 0.18s",
                    }} />
                    <span style={{
                      flex: 1, fontSize: 10,
                      color: on ? "#e8eeff" : "rgba(220,228,255,0.88)",
                      fontWeight: 500, letterSpacing: "0.02em",
                      textShadow: TS,
                      transition: "color 0.18s",
                    }}>{m.label}</span>
                    <span style={{
                      fontSize: 10.5, color: on ? "#ffffff" : "rgba(220,228,255,0.85)",
                      fontFamily: "ui-monospace, monospace", fontWeight: 700,
                      textShadow: TS,
                    }}>{count}</span>
                    <span style={{
                      fontSize: 9, color: "rgba(180,200,240,0.62)",
                      minWidth: 28, textAlign: "right",
                      fontFamily: "ui-monospace, monospace",
                      textShadow: TS,
                    }}>{Math.round(pct * 100)}%</span>
                  </div>
                  <Bar pct={pct} color={m.color} />
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* BOTTOM-LEFT: Domains */}
      <Section title="DOMAIN CHANNELS" accent="#67e8f9">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {domainEntries.slice(0, 5).map(([domain, count]) => {
            const color    = DOMAIN_COLOR[domain] ?? "#94a3b8";
            const isActive = activeDomains.has(domain);
            return (
              <div
                key={domain}
                onClick={() => onToggleDomain(domain)}
                style={{
                  cursor: "pointer",
                  padding: "5px 4px",
                  borderRadius: 4,
                  transition: "all 0.18s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(140,180,255,0.04)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: color, flexShrink: 0,
                      boxShadow: isActive
                        ? `0 0 12px ${color}, 0 0 4px ${color}, 0 0 14px rgba(0,0,0,0.85)`
                        : `0 0 7px ${color}cc, 0 0 12px rgba(0,0,0,0.85)`,
                      transition: "box-shadow 0.18s",
                    }} />
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
                      color: isActive ? "#ffffff" : "#e8eeff",
                      textTransform: "uppercase" as const,
                      transition: "color 0.18s",
                      textShadow: isActive ? `0 0 10px ${color}aa, ${TS}` : TS,
                    }}>{domain}</span>
                    {isActive && (
                      <span style={{
                        fontSize: 7.5, color: color,
                        fontFamily: "ui-monospace, monospace",
                        letterSpacing: "0.22em", padding: "1px 6px",
                        border: `1px solid ${color}88`, borderRadius: 2,
                        background: "transparent",
                        boxShadow: `0 0 8px ${color}55, 0 1px 4px rgba(0,0,0,0.7)`,
                        textShadow: `0 0 8px ${color}cc, ${TS}`,
                      }}>ON</span>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10.5, color: "rgba(220,228,255,0.85)",
                    fontFamily: "ui-monospace, monospace", fontWeight: 700,
                    textShadow: TS,
                  }}>{count}</span>
                </div>
                <Bar pct={count / domMax} color={color} height={isActive ? 3 : 2} />
              </div>
            );
          })}
        </div>
      </Section>

      {/* BOTTOM-RIGHT: Top connected */}
      <Section title="HIGH-DENSITY NODES" accent="#c4b5fd">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {top.map((node, i) => {
            const m    = TYPE_META[node.type] ?? { color: "#94a3b8" };
            const maxD = top[0]?.degree ?? 1;
            return (
              <div key={node.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 8.5, color: "rgba(180,200,240,0.78)", minWidth: 14,
                    textAlign: "right", fontFamily: "ui-monospace, monospace",
                    fontWeight: 700,
                    textShadow: TS,
                  }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: m.color, flexShrink: 0,
                    boxShadow: `0 0 8px ${m.color}cc, 0 0 12px rgba(0,0,0,0.85)`,
                  }} />
                  <span style={{
                    flex: 1, fontSize: 11, color: "#e8eeff",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    letterSpacing: "0.01em",
                    fontWeight: 500,
                    textShadow: TS,
                  }}>{node.label}</span>
                  <span style={{
                    fontSize: 10.5, color: m.color,
                    fontFamily: "ui-monospace, monospace", fontWeight: 700,
                    flexShrink: 0,
                    textShadow: `0 0 8px ${m.color}aa, ${TS}`,
                  }}>{node.degree}</span>
                </div>
                <Bar pct={node.degree / maxD} color={m.color} height={1.5} />
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
