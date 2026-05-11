"use client";

import Link from "next/link";
import { useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  concept:          "#7dd3fc",
  person:           "#67e8f9",
  "source-summary": "#c4b5fd",
  synthesis:        "#a78bfa",
  page:             "rgba(200,215,255,0.65)",
  meta:             "rgba(200,215,255,0.65)",
  ghost:            "rgba(140,160,200,0.45)",
};

export interface NodeRef {
  slug: string;
  title: string;
  type: string;
}

interface Props {
  current:  NodeRef;
  outbound: NodeRef[];
  inbound:  NodeRef[];
  domain:   string | null;
  sectionSlug: string | null;
}

const MAX_GRAPH_NEIGHBORS = 10;

export default function NodeMap({ current, outbound, inbound, domain, sectionSlug }: Props) {
  // Neighbors for visual graph: outbound + inbound deduped, capped
  const neighborMap = new Map<string, { n: NodeRef; dir: "out" | "in" | "both" }>();
  for (const o of outbound) neighborMap.set(o.slug, { n: o, dir: "out" });
  for (const i of inbound) {
    const existing = neighborMap.get(i.slug);
    if (existing) existing.dir = "both";
    else neighborMap.set(i.slug, { n: i, dir: "in" });
  }
  const neighbors = Array.from(neighborMap.values()).slice(0, MAX_GRAPH_NEIGHBORS);
  const N = neighbors.length;

  const currentColor = TYPE_COLORS[current.type] ?? "#e6ecf8";

  return (
    <aside className="node-map-sidebar">
      {/* Breadcrumb */}
      <div style={{
        fontSize: 9.5, fontWeight: 600,
        color: "rgba(180,200,240,0.55)",
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        marginBottom: 14,
        display: "flex", alignItems: "center", gap: 6,
        flexWrap: "wrap" as const,
      }}>
        <Link href="/" style={{ color: "rgba(180,200,240,0.65)", textDecoration: "none" }}>
          Vault
        </Link>
        {domain && (
          <>
            <span style={{ opacity: 0.45 }}>›</span>
            {sectionSlug ? (
              <Link href={`/wiki/${sectionSlug}`} style={{
                color: TYPE_COLORS[current.type] ?? "rgba(180,200,240,0.78)",
                textDecoration: "none",
              }}>
                {domain}
              </Link>
            ) : (
              <span>{domain}</span>
            )}
          </>
        )}
      </div>

      {/* Title for section */}
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: currentColor,
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        marginBottom: 12,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: 1,
          background: currentColor,
          boxShadow: `0 0 6px ${currentColor}66`,
        }} />
        Connections
        <span style={{ marginLeft: "auto", color: "rgba(140,160,200,0.55)", fontWeight: 500 }}>
          {inbound.length + outbound.length}
        </span>
      </div>

      {/* Mini radial graph */}
      {N > 0 && (
        <div style={{
          width: "100%", display: "flex", justifyContent: "center",
          marginBottom: 18,
        }}>
          <svg viewBox="0 0 200 200" width="180" height="180" style={{ overflow: "visible" }}>
            {/* Edges */}
            {neighbors.map((nb, i) => {
              const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
              const x = 100 + Math.cos(angle) * 72;
              const y = 100 + Math.sin(angle) * 72;
              const dashed = nb.dir === "in";
              return (
                <line
                  key={`e-${nb.n.slug}`}
                  x1={100} y1={100} x2={x} y2={y}
                  stroke={nb.dir === "in" ? "rgba(167,139,250,0.30)" : "rgba(125,211,252,0.30)"}
                  strokeWidth={nb.dir === "both" ? 0.9 : 0.7}
                  strokeDasharray={dashed ? "2 3" : undefined}
                />
              );
            })}
            {/* Neighbor nodes */}
            {neighbors.map((nb, i) => {
              const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
              const x = 100 + Math.cos(angle) * 72;
              const y = 100 + Math.sin(angle) * 72;
              const c = TYPE_COLORS[nb.n.type] ?? "rgba(200,215,255,0.65)";
              return (
                <NeighborDot
                  key={nb.n.slug}
                  x={x} y={y}
                  color={c}
                  slug={nb.n.slug}
                  title={nb.n.title}
                />
              );
            })}
            {/* Center node */}
            <circle
              cx={100} cy={100} r={9}
              fill={currentColor}
              opacity={0.85}
              style={{ filter: `drop-shadow(0 0 6px ${currentColor}aa)` }}
            />
            <circle
              cx={100} cy={100} r={4}
              fill="#ffffff"
              opacity={0.95}
            />
            {/* Orbit ring */}
            <circle
              cx={100} cy={100} r={72}
              fill="none"
              stroke="rgba(140,180,255,0.08)"
              strokeWidth={0.6}
              strokeDasharray="2 4"
            />
          </svg>
        </div>
      )}

      {/* Inbound list */}
      {inbound.length > 0 && (
        <ListSection
          label="Inbound"
          count={inbound.length}
          accent="#a78bfa"
          items={inbound}
        />
      )}

      {/* Outbound list */}
      {outbound.length > 0 && (
        <ListSection
          label="Outbound"
          count={outbound.length}
          accent="#7dd3fc"
          items={outbound}
        />
      )}

      {/* Empty state */}
      {inbound.length === 0 && outbound.length === 0 && (
        <p style={{
          fontSize: 11, color: "rgba(140,160,200,0.55)",
          fontStyle: "italic",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          No connections yet.
        </p>
      )}

      <style>{`
        .node-map-sidebar {
          display: none;
          font-family: Inter, system-ui, sans-serif;
        }
        @media (min-width: 1240px) {
          .node-map-sidebar {
            display: block;
            position: fixed;
            top: 86px;
            left: calc(50vw - 740px / 2 - 240px);
            width: 210px;
            max-height: calc(100vh - 110px);
            overflow-y: auto;
            padding: 4px 4px 24px 0;
            color: rgba(220,228,245,0.85);
          }
          .node-map-sidebar::-webkit-scrollbar { width: 4px; }
          .node-map-sidebar::-webkit-scrollbar-track { background: transparent; }
          .node-map-sidebar::-webkit-scrollbar-thumb {
            background: rgba(140,180,255,0.18);
            border-radius: 2px;
          }
        }
        @media (min-width: 1400px) {
          .node-map-sidebar {
            left: calc(50vw - 740px / 2 - 260px);
            width: 232px;
          }
        }
      `}</style>
    </aside>
  );
}

/* ── Neighbor dot with hover label ─────────────────────────────────────── */
function NeighborDot({ x, y, color, slug, title }: {
  x: number; y: number; color: string; slug: string; title: string;
}) {
  const [hover, setHover] = useState(false);
  // Label position offset from dot direction
  const dx = x - 100, dy = y - 100;
  const len = Math.hypot(dx, dy);
  const lx = x + (dx / len) * 9;
  const ly = y + (dy / len) * 9;
  const anchor: "start" | "middle" | "end" =
    dx > 12 ? "start" : dx < -12 ? "end" : "middle";

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer" }}
    >
      <Link href={`/wiki/${slug}`}>
        <circle
          cx={x} cy={y} r={hover ? 5.5 : 4}
          fill={color}
          opacity={hover ? 1 : 0.85}
          style={{
            filter: hover
              ? `drop-shadow(0 0 8px ${color})`
              : `drop-shadow(0 0 4px ${color}88)`,
            transition: "all 0.15s",
          }}
        />
        {hover && (
          <text
            x={lx} y={ly + 3}
            textAnchor={anchor}
            fill="#f4f7ff"
            fontSize={9}
            style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.95))" }}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {title.length > 22 ? title.slice(0, 22) + "…" : title}
          </text>
        )}
      </Link>
    </g>
  );
}

/* ── List section (Inbound / Outbound) ─────────────────────────────────── */
function ListSection({ label, count, accent, items }: {
  label: string; count: number; accent: string; items: NodeRef[];
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9, fontWeight: 600,
        color: "rgba(180,200,240,0.55)",
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        marginBottom: 8,
      }}>
        <span style={{
          width: 3, height: 3, borderRadius: "50%",
          background: accent,
          boxShadow: `0 0 5px ${accent}88`,
        }} />
        {label}
        <span style={{ marginLeft: "auto", color: "rgba(140,160,200,0.55)", fontWeight: 500 }}>
          {count}
        </span>
      </div>
      <ul style={{
        listStyle: "none", margin: 0, padding: 0,
        display: "flex", flexDirection: "column", gap: 1,
      }}>
        {items.slice(0, 12).map((it) => (
          <ListItem key={it.slug} item={it} />
        ))}
        {items.length > 12 && (
          <li style={{
            fontSize: 10, color: "rgba(140,160,200,0.55)",
            paddingLeft: 14, marginTop: 4,
          }}>
            + {items.length - 12} more
          </li>
        )}
      </ul>
    </div>
  );
}

function ListItem({ item }: { item: NodeRef }) {
  const [hover, setHover] = useState(false);
  const c = TYPE_COLORS[item.type] ?? "rgba(200,215,255,0.65)";
  return (
    <li>
      <Link
        href={`/wiki/${item.slug}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 8px 5px 4px",
          borderRadius: 4,
          fontSize: 11.5,
          color: hover ? "#f4f7ff" : "rgba(220,228,245,0.82)",
          textDecoration: "none",
          background: hover ? "rgba(140,180,255,0.06)" : "transparent",
          transition: "color 0.18s, background 0.18s",
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: c,
          boxShadow: hover ? `0 0 6px ${c}` : `0 0 4px ${c}88`,
          flexShrink: 0,
          transition: "box-shadow 0.18s",
        }} />
        <span style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.title}
        </span>
      </Link>
    </li>
  );
}
