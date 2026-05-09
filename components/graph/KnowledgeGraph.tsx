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

/* ── Node classification ── */
type NodeClass = "core" | "section" | "leaf" | "ghost";
function nodeClass(id: string, broken?: boolean): NodeClass {
  if (broken) return "ghost";
  if (id === "index") return "core";
  if (id.endsWith("/index")) return "section";
  return "leaf";
}

/* ── Colors ── */
const DOMAIN_COLORS: Record<string, string> = {
  research: "#60a5fa",
  personal: "#fb7185",
  reading:  "#fbbf24",
  business: "#34d399",
};
const TYPE_COLORS: Record<string, string> = {
  concept:          "#5ba3ff",
  person:           "#3dd68c",
  "source-summary": "#f5c842",
  synthesis:        "#b87fff",
  ghost:            "#1e1e2e",
  page:             "#5a6080",
  meta:             "#5a6080",
};

function leafColor(node: GraphNode): string {
  const dc = DOMAIN_COLORS[node.domain[0]];
  return dc ?? TYPE_COLORS[node.type] ?? "#5a6080";
}

/* ── Radii ── */
function nodeRadius(node: GraphNode): number {
  const cls = nodeClass(node.id, node.broken);
  if (cls === "core")    return 20;
  if (cls === "section") return 10 + Math.log(node.degree + 1) * 2;
  return 4 + Math.log(node.degree + 1) * 3.5;
}

/* ── Section orbital positions ── */
const SECTION_ANGLES: Record<string, number> = {
  research: -Math.PI / 2,
  reading:   0,
  business:  Math.PI / 2,
  personal:  Math.PI,
};
const SECTION_ORBIT_R = 170;

/* ── Galaxy dot generator (deterministic) ── */
function galaxyDots(seed: number, count: number, maxR: number) {
  return Array.from({ length: count }, (_, i) => {
    const h1 = Math.abs(Math.sin((seed + i * 7) * 127.1 + 1.3) * 43758.5453);
    const h2 = Math.abs(Math.sin((seed + i * 7) * 311.7 + 5.7) * 43758.5453);
    const h3 = Math.abs(Math.sin((seed + i * 7) * 73.1  + 2.1) * 43758.5453);
    const h4 = Math.abs(Math.sin((seed + i * 7) * 47.3  + 9.9) * 43758.5453);
    const angle = (h1 - Math.floor(h1)) * 2 * Math.PI;
    const dist  = Math.sqrt(h2 - Math.floor(h2)) * maxR;
    return {
      x:   Math.cos(angle) * dist,
      y:   Math.sin(angle) * dist,
      r:   (h3 - Math.floor(h3)) * 0.9 + 0.15,
      o:   (h4 - Math.floor(h4)) * 0.55 + 0.08,
      dur: 2.5 + (h1 - Math.floor(h1)) * 4,
    };
  });
}

const CORE_DOTS = galaxyDots(0,   90, 110);
const SEC_DOTS: Record<string, ReturnType<typeof galaxyDots>> = {
  research: galaxyDots(100, 45, 72),
  personal: galaxyDots(200, 45, 72),
  reading:  galaxyDots(300, 45, 72),
  business: galaxyDots(400, 45, 72),
};

/* ── Background starfield ── */
const STARS = Array.from({ length: 120 }, (_, i) => {
  const h1 = Math.abs(Math.sin(i * 127.1 + 1.3) * 43758.5453);
  const h2 = Math.abs(Math.sin(i * 311.7 + 5.7) * 43758.5453);
  const h3 = Math.abs(Math.sin(i * 73.1  + 2.1) * 43758.5453);
  const h4 = Math.abs(Math.sin(i * 47.3  + 9.9) * 43758.5453);
  return {
    x:    (h1 - Math.floor(h1)) * 100,
    y:    (h2 - Math.floor(h2)) * 100,
    r:    (h3 - Math.floor(h3)) * 1.0 + 0.3,
    o:    (h4 - Math.floor(h4)) * 0.16 + 0.03,
    dur:  2 + (h1 - Math.floor(h1)) * 4,
    blue: i % 5 === 0,
  };
});

/* ── Component ── */
export default function KnowledgeGraph({ data, activeDomains }: Props) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const gRef        = useRef<SVGGElement>(null);
  const simRef      = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const simNodesRef = useRef<GraphNode[]>([]);
  const rotationRef = useRef<number>(0);
  const router      = useRouter();

  const [positions,    setPositions]    = useState<Map<string, { x: number; y: number }>>(new Map());
  const [hoveredNode,  setHoveredNode]  = useState<GraphNode | null>(null);
  const [tooltipPos,   setTooltipPos]   = useState({ x: 0, y: 0 });
  const [dims,         setDims]         = useState({ w: 800, h: 600 });
  const [zoomScale,    setZoomScale]    = useState(1);

  const dragRef = useRef<{ nodeId: string } | null>(null);

  const filteredNodes = data.nodes.filter(
    (n) => activeDomains.size === 0 || n.broken ||
           nodeClass(n.id) === "core" || nodeClass(n.id) === "section" ||
           n.domain.some((d) => activeDomains.has(d))
  );
  const filteredIds   = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data.edges.filter((e) => {
    const src = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
    const tgt = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
    return filteredIds.has(src) && filteredIds.has(tgt);
  });

  /* Resize */
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

  /* D3 zoom — once, tracks scale */
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.06, 10])
      .on("zoom", (e) => {
        d3.select(gRef.current).attr("transform", e.transform.toString());
        setZoomScale(e.transform.k);
      });
    d3.select(svgRef.current).call(zoom);
  }, []);

  /* ── Simulation ── */
  useEffect(() => {
    simRef.current?.stop();

    const nodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
    const edges = filteredEdges.map((e) => ({
      source: typeof e.source === "string" ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === "string" ? e.target : (e.target as GraphNode).id,
      broken: e.broken,
    }));

    simNodesRef.current = nodes;

    const cx = dims.w * 0.40;
    const cy = dims.h / 2;

    /* Fix core */
    const coreNode = nodes.find((n) => n.id === "index");
    if (coreNode) {
      coreNode.x = cx; coreNode.y = cy;
      coreNode.fx = cx; coreNode.fy = cy;
    }

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .alphaDecay(0)
      .velocityDecay(0.48)
      .alpha(0.08)
      .force(
        "link",
        d3.forceLink<GraphNode, { source: string; target: string; broken: boolean }>(edges)
          .id((d) => d.id)
          .distance((e) => {
            const s = typeof e.source === "object" ? (e.source as GraphNode).id : e.source;
            const t = typeof e.target === "object" ? (e.target as GraphNode).id : e.target;
            const sc = nodeClass(s); const tc = nodeClass(t);
            if (sc === "core"    || tc === "core")    return SECTION_ORBIT_R * 0.9;
            if (sc === "section" || tc === "section") return 110;
            return 75;
          })
          .strength(0.35)
      )
      .force("charge", d3.forceManyBody().strength(-180).distanceMax(300))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 10))
      .force("orbital", () => {
        for (const node of nodes) {
          if (node.fx != null) continue;
          const dx = (node.x ?? 0) - cx;
          const dy = (node.y ?? 0) - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const cls  = nodeClass(node.id, node.broken);
          const base = cls === "section" ? 0.10 : 0.18;
          const speed = base / Math.max(dist / 180, 0.5);
          node.vx = (node.vx ?? 0) + (-dy / dist) * speed;
          node.vy = (node.vy ?? 0) + (dx  / dist) * speed;
        }
      })
      .force("section-orbit", () => {
        const sections = nodes.filter((n) => n.id.endsWith("/index") && n.id !== "index");
        const step = (2 * Math.PI) / Math.max(sections.length, 1);
        sections.forEach((node, i) => {
          const domain = node.id.split("/")[0];
          const angle  = SECTION_ANGLES[domain] ?? i * step;
          const tx = cx + Math.cos(angle) * SECTION_ORBIT_R;
          const ty = cy + Math.sin(angle) * SECTION_ORBIT_R;
          node.vx = (node.vx ?? 0) + (tx - (node.x ?? 0)) * 0.07;
          node.vy = (node.vy ?? 0) + (ty - (node.y ?? 0)) * 0.07;
        });
      })
      .force("galaxy-cluster", () => {
        const sectionPos: Record<string, { x: number; y: number }> = {};
        for (const node of nodes) {
          if (node.id.endsWith("/index") && node.id !== "index") {
            sectionPos[node.id.split("/")[0]] = { x: node.x ?? cx, y: node.y ?? cy };
          }
        }
        for (const node of nodes) {
          if (node.fx != null || node.id.endsWith("/index")) continue;
          const target = sectionPos[node.domain[0]];
          if (!target) continue;
          const strength = node.broken ? 0.006 : 0.025;
          node.vx = (node.vx ?? 0) + (target.x - (node.x ?? 0)) * strength;
          node.vy = (node.vy ?? 0) + (target.y - (node.y ?? 0)) * strength;
        }
      });

    sim.on("tick", () => {
      rotationRef.current += 0.0012;
      const angle = rotationRef.current;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      setPositions(
        new Map(nodes.map((n) => {
          const dx = (n.x ?? 0) - cx;
          const dy = (n.y ?? 0) - cy;
          return [n.id, { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }];
        }))
      );
    });

    simRef.current = sim;
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes.length, filteredEdges.length, dims]);

  /* Drag */
  const onNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (nodeId === "index") return;
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { nodeId };
    (e.target as Element).setPointerCapture(e.pointerId);
    simRef.current?.alphaTarget(0.3).restart();
  }, []);

  const onSvgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const node = simNodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
    if (!node || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const matrix = gRef.current
      ? (gRef.current as SVGGraphicsElement).getScreenCTM()?.inverse()
      : null;
    const local = matrix ? pt.matrixTransform(matrix) : pt;
    const cx = dims.w * 0.40, cy = dims.h / 2;
    const cos = Math.cos(rotationRef.current), sin = Math.sin(rotationRef.current);
    const dx = local.x - cx, dy = local.y - cy;
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

  const gcx = dims.w * 0.40;
  const gcy = dims.h / 2;

  /* Section nodes in current frame */
  const sectionNodes = filteredNodes.filter(
    (n) => n.id.endsWith("/index") && n.id !== "index"
  );

  return (
    <div className="relative w-full h-full" style={{ background: "#00000f" }}>
      <svg
        ref={svgRef} width="100%" height="100%"
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
          <filter id="glow-core" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="18" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Background nebulas */}
          <radialGradient id="nebula-1" gradientUnits="userSpaceOnUse"
            cx={gcx} cy={gcy} r={Math.min(dims.w, dims.h) * 0.52}>
            <stop offset="0%"   stopColor="#0d2860" stopOpacity="0.55" />
            <stop offset="35%"  stopColor="#060e30" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-2" gradientUnits="userSpaceOnUse"
            cx={gcx + 120} cy={gcy - 90} r={Math.min(dims.w, dims.h) * 0.30}>
            <stop offset="0%"   stopColor="#2a0a5e" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-3" gradientUnits="userSpaceOnUse"
            cx={gcx - 90} cy={gcy + 110} r={Math.min(dims.w, dims.h) * 0.26}>
            <stop offset="0%"   stopColor="#051a40" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          {/* Core galaxy nebula — centered at 0,0 for use in translated group */}
          <radialGradient id="gneb-core-inner" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#8ec8ff" stopOpacity="0.45" />
            <stop offset="30%"  stopColor="#3060c0" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0a1040" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gneb-core-outer" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#2040a0" stopOpacity="0.20" />
            <stop offset="60%"  stopColor="#080e30" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          {/* Section galaxy nebulas per domain */}
          {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
            <radialGradient key={`gneb-${domain}`} id={`gneb-${domain}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
              <stop offset="40%"  stopColor={color} stopOpacity="0.10" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          ))}

          {/* Core sphere gradient */}
          <radialGradient id="core-grad" cx="38%" cy="32%" r="68%">
            <stop offset="0%"   stopColor="#e8f4ff" stopOpacity="1" />
            <stop offset="40%"  stopColor="#a8d0ff" stopOpacity="1" />
            <stop offset="100%" stopColor="#3060a0" stopOpacity="1" />
          </radialGradient>

          {/* Section sphere gradients */}
          {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
            <radialGradient key={`sec-${domain}`} id={`sec-${domain}`} cx="38%" cy="32%" r="68%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="40%"  stopColor={color}   stopOpacity="1" />
              <stop offset="100%" stopColor={color}   stopOpacity="0.55" />
            </radialGradient>
          ))}

          <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.5" fill="#0a0a18" />
          </pattern>
        </defs>

        {/* ── Static background ── */}
        <rect width="100%" height="100%" fill="url(#dots)" />
        <rect width="100%" height="100%" fill="url(#nebula-1)" />
        <rect width="100%" height="100%" fill="url(#nebula-2)" />
        <rect width="100%" height="100%" fill="url(#nebula-3)" />
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill={s.blue ? "#a8d8ff" : "#ccd8ff"} opacity={s.o}>
            <animate attributeName="opacity" values={`${s.o};${s.o * 0.25};${s.o}`}
              dur={`${s.dur}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* ── Zoom group ── */}
        <g ref={gRef}>

          {/* ── Core galaxy nebula (at physics center = always gcx,gcy) ── */}
          <g transform={`translate(${gcx},${gcy})`} style={{ pointerEvents: "none" }}>
            {/* Outer diffuse cloud */}
            <ellipse rx={130} ry={110} fill="url(#gneb-core-outer)" />
            {/* Inner bright core */}
            <ellipse rx={70}  ry={60}  fill="url(#gneb-core-inner)" />
            {/* Galaxy dots */}
            {CORE_DOTS.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r}
                fill="#9ac8ff" opacity={d.o}>
                <animate attributeName="opacity"
                  values={`${d.o};${d.o * 0.3};${d.o}`}
                  dur={`${d.dur}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>

          {/* ── Section galaxy nebulas (at rendered positions) ── */}
          {sectionNodes.map((node) => {
            const pos    = positions.get(node.id);
            if (!pos) return null;
            const domain = node.id.split("/")[0];
            const color  = DOMAIN_COLORS[domain] ?? "#5a6080";
            const dots   = SEC_DOTS[domain] ?? SEC_DOTS.research;
            return (
              <g key={`gneb-${node.id}`}
                transform={`translate(${pos.x},${pos.y})`}
                style={{ pointerEvents: "none" }}>
                <ellipse rx={90} ry={75} fill={`url(#gneb-${domain})`} />
                {dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={d.r}
                    fill={color} opacity={d.o * 0.7}>
                    <animate attributeName="opacity"
                      values={`${d.o * 0.7};${d.o * 0.15};${d.o * 0.7}`}
                      dur={`${d.dur}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            );
          })}

          {/* Orbit rings */}
          {[SECTION_ORBIT_R, SECTION_ORBIT_R * 1.65, SECTION_ORBIT_R * 2.5].map((r) => (
            <circle key={r} cx={gcx} cy={gcy} r={r}
              fill="none" stroke="#4f9cf9" strokeWidth={0.4}
              strokeOpacity={0.04} strokeDasharray="5 18" />
          ))}

          {/* ── Edges ── */}
          {filteredEdges.map((e, i) => {
            const srcId = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
            const tgtId = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
            const src = positions.get(srcId);
            const tgt = positions.get(tgtId);
            if (!src || !tgt) return null;

            const sc = nodeClass(srcId); const tc = nodeClass(tgtId);
            const isSpinal    = sc === "core" || tc === "core";
            const isSectional = !isSpinal && (sc === "section" || tc === "section");
            const connected   = hoveredNode && (hoveredNode.id === srcId || hoveredNode.id === tgtId);
            const dimmed      = hoveredNode && !connected;

            let edgeColor = "#1a1a2e";
            if (connected)        edgeColor = e.broken ? "#ef4444" : "#7fc8ff";
            else if (isSpinal) {
              const sid = sc === "core" ? tgtId : srcId;
              edgeColor = (DOMAIN_COLORS[sid.split("/")[0]] ?? "#4f9cf9");
            } else if (isSectional) {
              const sid = sc === "section" ? srcId : tgtId;
              edgeColor = (DOMAIN_COLORS[sid.split("/")[0]] ?? "#4f9cf9") + "55";
            }

            return (
              <line key={i}
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={edgeColor}
                strokeWidth={isSpinal ? 1.2 : isSectional ? 0.9 : 0.6}
                strokeDasharray={e.broken ? "4 3" : undefined}
                opacity={dimmed ? 0 : connected ? 0.9 : isSpinal ? 0.55 : isSectional ? 0.35 : 0.22}
              />
            );
          })}

          {/* ── Nodes ── */}
          {filteredNodes.map((node, idx) => {
            const pos  = positions.get(node.id) ?? { x: gcx, y: gcy };
            const cls  = nodeClass(node.id, node.broken);
            const r    = nodeRadius(node);

            const neighbors   = hoveredNode ? neighborIds(hoveredNode.id) : null;
            const isHovered   = hoveredNode?.id === node.id;
            const isNeighbor  = neighbors?.has(node.id) ?? false;
            const dimmed      = hoveredNode !== null && !isHovered && !isNeighbor;
            const highlighted = isHovered || isNeighbor;

            const pulseDur   = `${3.5 + (idx % 4) * 0.8}s`;
            const pulseDelay = `${(idx % 5) * 0.6}s`;

            /* Zoom-aware label: core+section always visible; leaves show when zoomed in */
            const showLabel  = cls === "core" || cls === "section"
              ? !dimmed
              : !dimmed && (zoomScale > 1.4 || isHovered || isNeighbor);

            /* ── CORE ── */
            if (cls === "core") {
              return (
                <g key={node.id} transform={`translate(${pos.x},${pos.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(ev) => { if (!dragRef.current) { simRef.current?.stop(); setHoveredNode(node); setTooltipPos({ x: ev.clientX, y: ev.clientY }); } }}
                  onMouseMove={(ev)  => { if (!dragRef.current) setTooltipPos({ x: ev.clientX, y: ev.clientY }); }}
                  onMouseLeave={() => { simRef.current?.restart(); setHoveredNode(null); }}
                  onClick={(e) => { router.push("/wiki/index"); e.stopPropagation(); }}
                >
                  <circle fill="#6ab4ff" opacity={0}>
                    <animate attributeName="r"       values="28;60;28" dur="9s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.12;0.02;0.12" dur="9s" repeatCount="indefinite" />
                  </circle>
                  <circle r={r + 10} fill="#4080c0" opacity={isHovered ? 0.22 : 0.10} />
                  <circle r={r + 6}  fill="none" stroke="#a8d0ff" strokeWidth={0.8}
                    strokeOpacity={0.35} strokeDasharray="4 8" />
                  <circle r={r} fill="url(#core-grad)"
                    filter={isHovered ? "url(#glow-core)" : "url(#glow-strong)"} />
                  {showLabel && (
                    <text textAnchor="middle" y={r + 18}
                      fontSize={12 / zoomScale + 3} fontWeight={700}
                      fill={isHovered ? "#fff" : "#7ab8ff"}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                      filter="url(#glow-soft)">
                      {node.label}
                    </text>
                  )}
                </g>
              );
            }

            /* ── SECTION ── */
            if (cls === "section") {
              const domain = node.id.split("/")[0];
              const color  = DOMAIN_COLORS[domain] ?? "#5a6080";
              return (
                <g key={node.id} transform={`translate(${pos.x},${pos.y})`}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => onNodePointerDown(e, node.id)}
                  onMouseEnter={(ev) => { if (!dragRef.current) { simRef.current?.stop(); setHoveredNode(node); setTooltipPos({ x: ev.clientX, y: ev.clientY }); } }}
                  onMouseMove={(ev)  => { if (!dragRef.current) setTooltipPos({ x: ev.clientX, y: ev.clientY }); }}
                  onMouseLeave={() => { simRef.current?.restart(); setHoveredNode(null); }}
                  onClick={(e) => { router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
                >
                  <circle fill={color} opacity={0}>
                    <animate attributeName="r"       values={`${r+6};${r+20};${r+6}`} dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.18;0.03;0.18"           dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                  </circle>
                  <circle r={r + 5} fill={color} opacity={isHovered ? 0.24 : dimmed ? 0.01 : 0.10} />
                  <circle r={r + 4} fill="none" stroke={color} strokeWidth={0.7}
                    strokeOpacity={dimmed ? 0.04 : 0.30} strokeDasharray="3 6" />
                  <circle r={r}
                    fill={`url(#sec-${domain})`}
                    fillOpacity={dimmed ? 0.14 : 1}
                    stroke={color} strokeWidth={isHovered ? 2 : 1.2}
                    strokeOpacity={dimmed ? 0.05 : 0.8}
                    filter={isHovered ? "url(#glow-strong)" : "url(#glow)"}
                  />
                  {showLabel && (
                    <text textAnchor="middle" y={r + 16}
                      fontSize={Math.max(9, 11 / zoomScale + 2)} fontWeight={600}
                      fill={dimmed ? "#2a2a3a" : isHovered ? "#fff" : color}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.label}
                    </text>
                  )}
                </g>
              );
            }

            /* ── LEAF / GHOST ── */
            const color = cls === "ghost" ? "#27272a" : leafColor(node);
            return (
              <g key={node.id} transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: node.broken ? "default" : "grab" }}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onMouseEnter={(ev) => { if (!dragRef.current) { simRef.current?.stop(); setHoveredNode(node); setTooltipPos({ x: ev.clientX, y: ev.clientY }); } }}
                onMouseMove={(ev)  => { if (!dragRef.current) setTooltipPos({ x: ev.clientX, y: ev.clientY }); }}
                onMouseLeave={() => { simRef.current?.restart(); setHoveredNode(null); }}
                onClick={(e) => { if (!node.broken && !dragRef.current) router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
              >
                {!dimmed && !node.broken && (
                  <circle fill={color} opacity={0}>
                    <animate attributeName="r"       values={`${r+5};${r+14};${r+5}`} dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.14;0.02;0.14"           dur={pulseDur} begin={pulseDelay} repeatCount="indefinite" />
                  </circle>
                )}
                {!dimmed && !node.broken && (
                  <circle r={r + 4} fill={color} opacity={highlighted ? 0.16 : 0.04}
                    style={{ pointerEvents: "none" }} />
                )}
                {isHovered && (
                  <circle r={r + 12} fill={color} opacity={0.08} style={{ pointerEvents: "none" }} />
                )}
                <circle r={r}
                  fill={node.broken ? "transparent" : color}
                  fillOpacity={dimmed ? 0.04 : node.broken ? 0 : highlighted ? 1 : 0.85}
                  stroke={color}
                  strokeWidth={isHovered ? 2 : node.broken ? 0.8 : 1.2}
                  strokeOpacity={dimmed ? 0.04 : node.broken ? 0.18 : highlighted ? 1 : 0.65}
                  strokeDasharray={node.broken ? "3 2" : undefined}
                  filter={
                    isHovered  ? "url(#glow-strong)" :
                    isNeighbor ? "url(#glow)" :
                    dimmed     ? undefined : "url(#glow-soft)"
                  }
                />
                {showLabel && (
                  <text textAnchor="middle" y={r + 12}
                    fontSize={isHovered ? 10 : 8.5}
                    fontWeight={isHovered ? "600" : "400"}
                    fill={isHovered ? "#fff" : isNeighbor ? "#c8d0e0" : "#4a5070"}
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {node.label.length > 22 ? node.label.slice(0, 22) + "…" : node.label}
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
