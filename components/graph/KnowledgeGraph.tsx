"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/types";
import NodeTooltip from "./NodeTooltip";

interface Props {
  data: GraphData;
  activeDomains: Set<string>;
}

const NODE_COLORS: Record<string, string> = {
  concept:          "#4f9cf9",
  person:           "#4ade80",
  "source-summary": "#facc15",
  synthesis:        "#c084fc",
  ghost:            "#27272a",
  page:             "#71717a",
  meta:             "#71717a",
};

function nodeColor(type: string): string {
  return NODE_COLORS[type] ?? "#71717a";
}


function nodeRadius(degree: number): number {
  return 5 + Math.log(degree + 1) * 5;
}

/* Deterministic pseudo-random starfield */
const STARS = Array.from({ length: 120 }, (_, i) => {
  const h1 = Math.abs(Math.sin(i * 127.1 + 1.3) * 43758.5453);
  const h2 = Math.abs(Math.sin(i * 311.7 + 5.7) * 43758.5453);
  const h3 = Math.abs(Math.sin(i * 73.1  + 2.1) * 43758.5453);
  const h4 = Math.abs(Math.sin(i * 47.3  + 9.9) * 43758.5453);
  return {
    x:    (h1 - Math.floor(h1)) * 100,
    y:    (h2 - Math.floor(h2)) * 100,
    r:    (h3 - Math.floor(h3)) * 1.0 + 0.3,
    o:    (h4 - Math.floor(h4)) * 0.18 + 0.04,
    dur:  2 + (h1 - Math.floor(h1)) * 4,
    blue: i % 5 === 0,
  };
});

/* Orbit ring radii */
const ORBIT_RINGS = [80, 150, 235, 335, 450];

export default function KnowledgeGraph({ data, activeDomains }: Props) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const gRef        = useRef<SVGGElement>(null);
  const simRef      = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const simNodesRef = useRef<GraphNode[]>([]);
  const rotationRef = useRef<number>(0);
  const router      = useRouter();

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 });
  const [dims, setDims] = useState({ w: 800, h: 600 });

  const dragRef = useRef<{ nodeId: string } | null>(null);

  const filteredNodes = data.nodes.filter(
    (n) => activeDomains.size === 0 || n.broken || n.domain.some((d) => activeDomains.has(d))
  );
  const filteredIds  = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data.edges.filter((e) => {
    const src = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
    const tgt = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
    return filteredIds.has(src) && filteredIds.has(tgt);
  });

  /* Resize observer */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg?.parentElement) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(svg.parentElement);
    setDims({ w: svg.parentElement.clientWidth, h: svg.parentElement.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* D3 zoom — once */
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on("zoom", (e) => {
        d3.select(gRef.current).attr("transform", e.transform.toString());
      });
    d3.select(svgRef.current).call(zoom);
  }, []);

  /* Simulation with perpetual orbital + globe rotation + cluster force */
  useEffect(() => {
    simRef.current?.stop();

    const nodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
    const edges = filteredEdges.map((e) => ({
      source: typeof e.source === "string" ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === "string" ? e.target : (e.target as GraphNode).id,
      broken: e.broken,
    }));

    simNodesRef.current = nodes;

    const cx = dims.w * 0.38;
    const cy = dims.h / 2;

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .alphaDecay(0)
      .velocityDecay(0.45)
      .alpha(0.08)
      .force(
        "link",
        d3.forceLink<GraphNode, { source: string; target: string; broken: boolean }>(edges)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3)
      )
      .force("charge", d3.forceManyBody().strength(-280).distanceMax(380))
      .force("center", d3.forceCenter(cx, cy).strength(0.04))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.degree) + 12))
      /* Tangential orbital drift — inner nodes faster (Kepler-like) */
      .force("orbital", () => {
        for (const node of nodes) {
          const dx = (node.x ?? 0) - cx;
          const dy = (node.y ?? 0) - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 0.22 / Math.max(dist / 180, 0.6);
          node.vx = (node.vx ?? 0) + (-dy / dist) * speed;
          node.vy = (node.vy ?? 0) + (dx  / dist) * speed;
        }
      })
      /* Domain-based cluster force — same domain nodes gravitate together */
      .force("cluster", () => {
        const byDomain: Record<string, GraphNode[]> = {};
        for (const node of nodes) {
          const d = node.domain[0] ?? "other";
          (byDomain[d] ??= []).push(node);
        }
        for (const group of Object.values(byDomain)) {
          if (group.length < 2) continue;
          const gcx2 = group.reduce((s, n) => s + (n.x ?? 0), 0) / group.length;
          const gcy2 = group.reduce((s, n) => s + (n.y ?? 0), 0) / group.length;
          for (const node of group) {
            node.vx = (node.vx ?? 0) + (gcx2 - (node.x ?? 0)) * 0.015;
            node.vy = (node.vy ?? 0) + (gcy2 - (node.y ?? 0)) * 0.015;
          }
        }
      });

    sim.on("tick", () => {
      rotationRef.current += 0.0015;
      const angle = rotationRef.current;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      setPositions(
        new Map(
          nodes.map((n) => {
            const dx = (n.x ?? 0) - cx;
            const dy = (n.y ?? 0) - cy;
            return [n.id, { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }];
          })
        )
      );
    });

    simRef.current = sim;
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes.length, filteredEdges.length, dims]);

  /* Drag handlers — apply inverse rotation when setting fx/fy */
  const onNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { nodeId };
    (e.target as Element).setPointerCapture(e.pointerId);
    simRef.current?.alphaTarget(0.3).restart();
  }, []);

  const onSvgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const node = simNodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
    if (!node || !svgRef.current) return;

    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const matrix = gRef.current ? (gRef.current as SVGGraphicsElement).getScreenCTM()?.inverse() : null;
    const local  = matrix ? pt.matrixTransform(matrix) : pt;
    const cx  = dims.w * 0.38;
    const cy  = dims.h / 2;
    const cos = Math.cos(rotationRef.current);
    const sin = Math.sin(rotationRef.current);
    const dx  = local.x - cx;
    const dy  = local.y - cy;
    node.fx = cx + dx * cos + dy * sin;
    node.fy = cy - dx * sin + dy * cos;
  }, [dims]);

  const onSvgPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    const node = simNodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
    if (node) { node.fx = null; node.fy = null; }
    simRef.current?.alphaTarget(0);
    dragRef.current = null;
  }, []);

  const neighborIds = useCallback((nodeId: string): Set<string> => {
    const ids = new Set<string>();
    for (const e of filteredEdges) {
      const src = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
      const tgt = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
      if (src === nodeId) ids.add(tgt);
      if (tgt === nodeId) ids.add(src);
    }
    return ids;
  }, [filteredEdges]);

  const gcx = dims.w * 0.38;
  const gcy = dims.h / 2;

  return (
    <div className="relative w-full h-full" style={{ background: "#00000f" }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
      >
        <defs>
          {/* Glow filters */}
          <filter id="glow-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-strong" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Nebula gradients */}
          <radialGradient id="nebula-1" gradientUnits="userSpaceOnUse"
            cx={gcx} cy={gcy} r={Math.min(dims.w, dims.h) * 0.50}>
            <stop offset="0%"   stopColor="#0d2860" stopOpacity="0.55" />
            <stop offset="35%"  stopColor="#060e30" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-2" gradientUnits="userSpaceOnUse"
            cx={gcx + 100} cy={gcy - 80} r={Math.min(dims.w, dims.h) * 0.32}>
            <stop offset="0%"   stopColor="#2a0a5e" stopOpacity="0.35" />
            <stop offset="60%"  stopColor="#130530" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-3" gradientUnits="userSpaceOnUse"
            cx={gcx - 80} cy={gcy + 100} r={Math.min(dims.w, dims.h) * 0.28}>
            <stop offset="0%"   stopColor="#051a40" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-4" gradientUnits="userSpaceOnUse"
            cx={gcx + 60} cy={gcy + 120} r={Math.min(dims.w, dims.h) * 0.20}>
            <stop offset="0%"   stopColor="#1a0840" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          {/* Dot grid */}
          <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.5" fill="#0a0a18" />
          </pattern>

        </defs>

        {/* ── Static background (outside zoom group) ── */}
        <rect width="100%" height="100%" fill="url(#dots)" />
        <rect width="100%" height="100%" fill="url(#nebula-1)" />
        <rect width="100%" height="100%" fill="url(#nebula-2)" />
        <rect width="100%" height="100%" fill="url(#nebula-3)" />
        <rect width="100%" height="100%" fill="url(#nebula-4)" />

        {/* Starfield */}
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill={s.blue ? "#a8d8ff" : "#ccd8ff"} opacity={s.o}>
            <animate attributeName="opacity"
              values={`${s.o};${s.o * 0.3};${s.o}`}
              dur={`${s.dur}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* ── Zoom group ── */}
        <g ref={gRef}>

          {/* Orbit rings */}
          {ORBIT_RINGS.map((r) => (
            <circle key={r} cx={gcx} cy={gcy} r={r}
              fill="none" stroke="#4f9cf9" strokeWidth={0.5}
              strokeOpacity={0.05} strokeDasharray="4 14" />
          ))}

          {/* Galaxy core glow */}
          <radialGradient id="core-g">
            <stop offset="0%"   stopColor="#4f9cf9" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4f9cf9" stopOpacity="0" />
          </radialGradient>
          <circle cx={gcx} cy={gcy} r={55} fill="url(#core-g)" opacity={0.8} />

          {/* Edges */}
          {filteredEdges.map((e, i) => {
            const srcId = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
            const tgtId = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
            const src = positions.get(srcId);
            const tgt = positions.get(tgtId);
            if (!src || !tgt) return null;
            const connected = hoveredNode && (hoveredNode.id === srcId || hoveredNode.id === tgtId);
            const dimmed    = hoveredNode && !connected;
            return (
              <line key={i}
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={connected ? (e.broken ? "#ef4444" : "#4f9cf9") : (e.broken ? "#ef444420" : "#222")}
                strokeWidth={connected ? 1.5 : 0.8}
                strokeDasharray={e.broken ? "4 3" : undefined}
                opacity={dimmed ? 0 : connected ? 0.7 : 0.5}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node, idx) => {
            const pos  = positions.get(node.id) ?? { x: gcx, y: gcy };
            const r    = nodeRadius(node.degree);
            const color = nodeColor(node.type);
            const neighbors  = hoveredNode ? neighborIds(hoveredNode.id) : null;
            const isHovered  = hoveredNode?.id === node.id;
            const isNeighbor = neighbors?.has(node.id) ?? false;
            const dimmed     = hoveredNode !== null && !isHovered && !isNeighbor;
            const highlighted = isHovered || isNeighbor;
            const pulseDur   = `${3.5 + (idx % 4) * 0.8}s`;
            const pulseDelay = `${(idx % 5) * 0.6}s`;

            return (
              <g key={node.id}
                transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: node.broken ? "default" : "grab" }}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onMouseEnter={(ev) => { if (!dragRef.current) { simRef.current?.stop(); setHoveredNode(node); setTooltipPos({ x: ev.clientX, y: ev.clientY }); } }}
                onMouseMove={(ev)  => { if (!dragRef.current) setTooltipPos({ x: ev.clientX, y: ev.clientY }); }}
                onMouseLeave={() => { simRef.current?.restart(); setHoveredNode(null); }}
                onClick={(e) => { if (!node.broken && !dragRef.current) router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
              >
                {/* Pulsing outer corona */}
                {!dimmed && !node.broken && (
                  <circle fill={color} opacity={0}>
                    <animate attributeName="r"       values={`${r+8};${r+20};${r+8}`}   dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.12;0.02;0.12"             dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                  </circle>
                )}

                {/* Mid glow ring */}
                {!dimmed && !node.broken && (
                  <circle r={r + 5} fill={color} opacity={highlighted ? 0.14 : 0.05} style={{ pointerEvents: "none" }} />
                )}

                {/* Hover halo */}
                {isHovered && (
                  <circle r={r + 14} fill={color} opacity={0.08} style={{ pointerEvents: "none" }} />
                )}

                {/* Main circle */}
                <circle
                  r={r}
                  fill={node.broken ? "transparent" : color}
                  fillOpacity={dimmed ? 0.04 : node.broken ? 0 : highlighted ? 1 : 0.88}
                  stroke={color}
                  strokeWidth={isHovered ? 2.5 : node.broken ? 1 : 1.5}
                  strokeOpacity={dimmed ? 0.05 : node.broken ? 0.25 : highlighted ? 1 : 0.75}
                  strokeDasharray={node.broken ? "3 2" : undefined}
                  filter={
                    isHovered  ? "url(#glow-strong)" :
                    isNeighbor ? "url(#glow)" :
                    dimmed     ? undefined :
                                 "url(#glow-soft)"
                  }
                />

                {/* Label */}
                {!dimmed && (
                  <text
                    textAnchor="middle"
                    y={r + 13}
                    fontSize={isHovered ? 10.5 : 9}
                    fontWeight={isHovered ? "600" : "400"}
                    fill={isHovered ? "#fff" : isNeighbor ? "#d4d4d8" : "#71717a"}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.label.length > 18 ? node.label.slice(0, 18) + "…" : node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredNode && !dragRef.current && (
        <NodeTooltip node={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />
      )}
    </div>
  );
}
