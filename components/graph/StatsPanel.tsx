"use client";

import { useState } from "react";
import type { ParsedPage, GraphData } from "@/lib/types";

interface Props {
  pages: ParsedPage[];
  graphData: GraphData;
  activeDomains: Set<string>;
  onToggleDomain: (d: string) => void;
}

const TYPE_META: Record<string, { color: string; label: string }> = {
  concept:          { color: "#4f9cf9", label: "Concept" },
  person:           { color: "#4ade80", label: "Person" },
  "source-summary": { color: "#facc15", label: "Source" },
  synthesis:        { color: "#c084fc", label: "Synthesis" },
  meta:             { color: "#71717a", label: "Meta" },
};
const DOMAIN_COLOR: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
};

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
function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i], cx = ((p.x + c.x) / 2).toFixed(1);
    d += ` C${cx},${p.y.toFixed(1)} ${cx},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }
  return d;
}
function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  let nm = m + n, ny = y;
  while (nm > 12) { nm -= 12; ny++; }
  while (nm < 1)  { nm += 12; ny--; }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
function nowMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mLabel(ym: string): string {
  const [, m] = ym.split("-");
  return ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][parseInt(m) - 1];
}

/* Section header with flanking lines */
function SectionHead({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.16em",
        color: "#3f3f46", fontFamily: "monospace", textTransform: "uppercase" as const,
        textShadow: "0 0 20px rgba(0,0,0,1)",
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

/* Thin bar with glow */
function Bar({ pct, color, height = 2 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct * 100}%`,
        background: color, borderRadius: 1,
        boxShadow: `0 0 6px ${color}60`,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

const TS = "0 0 20px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,1)";

export default function StatsPanel({ pages, graphData, activeDomains, onToggleDomain }: Props) {
  const [hm, setHm] = useState<string | null>(null);
  const [hs, setHs] = useState<string | null>(null);

  const real   = graphData.nodes.filter((n) => !n.broken);
  const ghosts = graphData.nodes.filter((n) =>  n.broken);
  const avgDeg = real.length ? (real.reduce((s, n) => s + n.degree, 0) / real.length).toFixed(1) : "0";

  const tc: Record<string, number> = {};
  for (const n of real) tc[n.type] = (tc[n.type] ?? 0) + 1;
  const typeEntries = Object.entries(tc).sort((a, b) => b[1] - a[1]);
  const typeTotal   = typeEntries.reduce((s, [, c]) => s + c, 0);

  const dc: Record<string, number> = {};
  for (const p of pages) for (const d of p.domain) dc[d] = (dc[d] ?? 0) + 1;
  const domainEntries = Object.entries(dc).sort((a, b) => b[1] - a[1]);
  const domMax = domainEntries[0]?.[1] ?? 1;

  const top = [...real].sort((a, b) => b.degree - a.degree).slice(0, 5);

  /* Donut */
  const DS = 150, CX = DS / 2, CY = DS / 2, R = 58, IR = 36;
  let cur = 0;
  const slices = typeEntries.map(([type, count]) => {
    const pct = count / typeTotal, span = pct * 360;
    const path = arc(CX, CY, R, IR, cur, cur + span);
    cur += span;
    return { type, count, pct, path };
  });

  /* Metrics */
  const METRICS = [
    { id: "pages",   value: real.length,                                         label: "Pages",        accent: "#4f9cf9" },
    { id: "links",   value: graphData.edges.length,                              label: "Links",        accent: "#4ade80" },
    { id: "ghosts",  value: ghosts.length,                                       label: "Ghosts",       accent: "#facc15" },
    { id: "avg",     value: avgDeg,                                               label: "Avg links",    accent: "#c084fc" },
    { id: "orphans", value: real.filter((n) => n.degree <= 1).length,            label: "Orphans",      accent: "#fb7185" },
    { id: "sources", value: pages.reduce((s, p) => s + p.sources.length, 0),    label: "Sources",      accent: "#34d399" },
  ];

  /* Timeline */
  const now = nowMonth();
  const tlMonths = [shiftMonth(now, -3), shiftMonth(now, -2), shiftMonth(now, -1), now];
  const tlData   = tlMonths.map((m) => ({
    m,
    total: pages.filter((p) => p.lastUpdated && p.lastUpdated.slice(0, 7) <= m).length,
  }));

  return (
    <>
      {/* ── 2×2 PANEL OVERLAY ── */}
      <div style={{
        position: "absolute", right: 90, top: 120,
        width: 480, pointerEvents: "auto", zIndex: 10,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 32,
      }}>

        {/* TOP-LEFT: Vault stats */}
        <div>
          <SectionHead label="Vault Stats" />
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            rowGap: 28, columnGap: 4,
            justifyItems: "center",
          }}>
            {METRICS.map(({ id, value, label, accent }) => {
              const on = hm === id;
              return (
                <div
                  key={id}
                  onMouseEnter={() => setHm(id)}
                  onMouseLeave={() => setHm(null)}
                  style={{
                    cursor: "default", textAlign: "center", width: "100%",
                    transform: on ? "scale(1.06)" : "scale(1)",
                    transition: "transform 0.18s",
                  }}
                >
                  <p style={{
                    fontSize: 34, fontWeight: 700, lineHeight: 1,
                    fontFamily: "monospace",
                    color: on ? accent : "#d4d4d8",
                    textShadow: on ? `0 0 24px ${accent}80, ${TS}` : TS,
                    transition: "color 0.18s, text-shadow 0.18s",
                    letterSpacing: "-0.02em",
                  }}>{value}</p>
                  <p style={{
                    fontSize: 9, marginTop: 6, fontWeight: 600,
                    color: on ? accent + "cc" : "#3f3f46",
                    textShadow: TS, transition: "color 0.18s",
                    letterSpacing: "0.12em", textTransform: "uppercase" as const,
                    fontFamily: "monospace",
                  }}>{label}</p>
                  {on && (
                    <div style={{
                      marginTop: 5, height: 1,
                      background: `linear-gradient(90deg, transparent, ${accent}60, transparent)`,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* TOP-RIGHT: Content types */}
        <div>
          <SectionHead label="Content Types" />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Donut */}
            <svg width={DS} height={DS} style={{ flexShrink: 0 }}>
              {/* Outer ring track */}
              <circle cx={CX} cy={CY} r={R + 4} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
              {slices.map(({ type, path }) => {
                const m  = TYPE_META[type] ?? { color: "#71717a" };
                const on = hs === type;
                return path ? (
                  <path key={type} d={path} fill={m.color}
                    opacity={on ? 1 : hs ? 0.15 : 0.8}
                    filter={on ? `drop-shadow(0 0 6px ${m.color}cc)` : undefined}
                    style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                    onMouseEnter={() => setHs(type)}
                    onMouseLeave={() => setHs(null)}
                  />
                ) : null;
              })}
              {/* Center */}
              <circle cx={CX} cy={CY} r={IR - 2} fill="rgba(0,0,0,0.8)" />
              <text x={CX} y={CY - 4} textAnchor="middle" fill="#e8e8e8" fontSize={22} fontWeight={700} fontFamily="monospace">{typeTotal}</text>
              <text x={CX} y={CY + 12} textAnchor="middle" fill="#3f3f46" fontSize={8} fontFamily="monospace" letterSpacing="0.12em">NODES</text>
            </svg>

            {/* Legend */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
              {slices.map(({ type, count, pct }) => {
                const m  = TYPE_META[type] ?? { color: "#71717a", label: type };
                const on = hs === type;
                return (
                  <div key={type}
                    style={{ cursor: "default" }}
                    onMouseEnter={() => setHs(type)}
                    onMouseLeave={() => setHs(null)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: m.color, flexShrink: 0,
                        boxShadow: on ? `0 0 6px ${m.color}` : "none",
                        transition: "box-shadow 0.15s",
                      }} />
                      <span style={{
                        flex: 1, fontSize: 10, textShadow: TS,
                        color: on ? "#e8e8e8" : "#71717a",
                        transition: "color 0.15s",
                      }}>{m.label}</span>
                      <span style={{ fontSize: 10, color: on ? "#fff" : "#52525b", fontFamily: "monospace", textShadow: TS }}>{count}</span>
                      <span style={{ fontSize: 9, color: "#27272a", minWidth: 26, textAlign: "right", fontFamily: "monospace", textShadow: TS }}>{Math.round(pct * 100)}%</span>
                    </div>
                    <Bar pct={pct} color={m.color} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* BOTTOM-LEFT: Domains */}
        <div>
          <SectionHead label="Domains" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {domainEntries.slice(0, 5).map(([domain, count]) => {
              const color    = DOMAIN_COLOR[domain] ?? "#71717a";
              const isActive = activeDomains.has(domain);
              return (
                <div
                  key={domain}
                  onClick={() => onToggleDomain(domain)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: color, flexShrink: 0,
                        boxShadow: isActive ? `0 0 8px ${color}` : `0 0 5px ${color}80`,
                        outline: isActive ? `2px solid ${color}50` : "none",
                        outlineOffset: 2,
                        transition: "all 0.15s",
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 500, textShadow: TS, letterSpacing: "0.04em",
                        color: isActive ? "#fff" : color,
                        transition: "color 0.15s",
                      }}>{domain}</span>
                      {isActive && (
                        <span style={{ fontSize: 8, color: color, fontFamily: "monospace", letterSpacing: "0.1em", opacity: 0.8 }}>ACTIVE</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace", textShadow: TS }}>{count}</span>
                  </div>
                  <Bar pct={count / domMax} color={color} height={isActive ? 3 : 2} />
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM-RIGHT: Most connected */}
        <div>
          <SectionHead label="Most Connected" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {top.map((node, i) => {
              const m    = TYPE_META[node.type] ?? { color: "#71717a" };
              const maxD = top[0]?.degree ?? 1;
              return (
                <div key={node.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{
                      fontSize: 9, color: "#27272a", minWidth: 10,
                      textAlign: "right", fontFamily: "monospace", textShadow: TS,
                    }}>{i + 1}</span>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: m.color, flexShrink: 0,
                      boxShadow: `0 0 5px ${m.color}80`,
                    }} />
                    <span style={{
                      flex: 1, fontSize: 11, color: "#a1a1aa",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textShadow: TS,
                    }}>{node.label}</span>
                    <span style={{
                      fontSize: 10, color: m.color,
                      fontFamily: "monospace", textShadow: TS, flexShrink: 0,
                    }}>{node.degree}</span>
                  </div>
                  <Bar pct={node.degree / maxD} color={m.color} height={1} />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── TIMELINE ── */}
      <TimelineChart data={tlData} />
    </>
  );
}

function TimelineChart({ data }: { data: { m: string; total: number }[] }) {
  const [hov, setHov] = useState<number | null>(null);

  const W = 380, H = 76;
  const PAD = { l: 10, r: 10, t: 8, b: 20 };
  const cW  = W - PAD.l - PAD.r;
  const cH  = H - PAD.t - PAD.b;
  const maxV = Math.max(...data.map((d) => d.total), 1);

  const pts = data.map((d, i) => ({
    x: PAD.l + (i / (data.length - 1)) * cW,
    y: PAD.t + cH - (d.total / maxV) * cH,
    ...d,
  }));

  const line = smooth(pts);
  const last = pts[pts.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${(PAD.t + cH).toFixed(1)} L${PAD.l},${(PAD.t + cH).toFixed(1)} Z`;
  const slotW = cW / (data.length - 1);
  const TS2 = "0 0 14px rgba(0,0,0,1)";

  return (
    <div style={{
      position: "absolute", bottom: 50, left: 0, right: 520,
      display: "flex", flexDirection: "column", alignItems: "center",
      pointerEvents: "auto", zIndex: 10,
    }}>
      <p style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.16em",
        textTransform: "uppercase" as const, color: "#2a2a2a",
        textShadow: TS2, marginBottom: 6, fontFamily: "monospace",
      }}>
        Knowledge Growth · Last 3 Months
      </p>
      <svg width={W} height={H} style={{ overflow: "visible" }} onMouseLeave={() => setHov(null)}>
        <defs>
          <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#4f9cf9" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#4f9cf9" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.5, 1].map((f) => (
          <line key={f}
            x1={PAD.l} y1={PAD.t + cH - f * cH}
            x2={PAD.l + cW} y2={PAD.t + cH - f * cH}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}

        <path d={area} fill="url(#tl-fill)" />
        <path d={line} fill="none" stroke="#4f9cf9" strokeWidth={1.5} opacity={0.8} />

        {/* Invisible hover zones */}
        {pts.map((pt, i) => (
          <rect key={i}
            x={i === 0 ? PAD.l : pt.x - slotW / 2}
            y={PAD.t} width={slotW} height={cH}
            fill="transparent" style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHov(i)}
          />
        ))}

        {/* Dots + tooltips */}
        {pts.map((pt, i) => {
          const on = hov === i;
          const bx = Math.max(PAD.l, Math.min(pt.x - 34, W - 78));
          return (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y}
                r={on ? 4 : 2.5}
                fill={on ? "#fff" : "#4f9cf9"}
                stroke={on ? "#4f9cf9" : "none"}
                strokeWidth={1.5}
              />
              {on && (
                <>
                  <line x1={pt.x} y1={PAD.t} x2={pt.x} y2={PAD.t + cH}
                    stroke="rgba(79,156,249,0.15)" strokeWidth={1} strokeDasharray="3 2" />
                  <rect x={bx} y={pt.y - 32} width={70} height={24} rx={3}
                    fill="rgba(3,5,12,0.97)" stroke="rgba(79,156,249,0.2)" />
                  <text x={bx + 35} y={pt.y - 20} textAnchor="middle"
                    fill="#e8e8e8" fontSize={10} fontWeight={700} fontFamily="monospace">{pt.total}</text>
                  <text x={bx + 35} y={pt.y - 10} textAnchor="middle"
                    fill="#52525b" fontSize={8} fontFamily="monospace" letterSpacing="0.1em">{mLabel(pt.m)}</text>
                </>
              )}
            </g>
          );
        })}

        {/* X axis */}
        <line x1={PAD.l} y1={PAD.t + cH} x2={PAD.l + cW} y2={PAD.t + cH}
          stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {data.map((d, i) => {
          const pt     = pts[i];
          const anchor = i === 0 ? "start" : i === data.length - 1 ? "end" : "middle";
          return (
            <text key={i} x={pt.x} y={PAD.t + cH + 13}
              textAnchor={anchor} fill="#27272a" fontSize={8}
              fontFamily="monospace" letterSpacing="0.08em">{mLabel(d.m)}</text>
          );
        })}
      </svg>
    </div>
  );
}
