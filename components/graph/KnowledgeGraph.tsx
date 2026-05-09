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

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "var(--node-concept)",
  person: "var(--node-person)",
  "source-summary": "var(--node-source)",
  synthesis: "var(--node-synthesis)",
  ghost: "var(--node-ghost)",
  page: "var(--node-meta)",
  meta: "var(--node-meta)",
};

function nodeColor(type: string): string {
  return NODE_TYPE_COLORS[type] ?? "var(--node-meta)";
}

function nodeRadius(degree: number): number {
  return 6 + Math.log(degree + 1) * 4;
}

export default function KnowledgeGraph({ data, activeDomains }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  // Live simulation nodes — mutated by D3, read by drag handlers
  const simNodesRef = useRef<GraphNode[]>([]);
  const router = useRouter();

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dims, setDims] = useState({ w: 800, h: 600 });

  // Drag state
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);

  const filteredNodes = data.nodes.filter(
    (n) => activeDomains.size === 0 || n.broken || n.domain.some((d) => activeDomains.has(d))
  );
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data.edges.filter((e) => {
    const src = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
    const tgt = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
    return filteredIds.has(src) && filteredIds.has(tgt);
  });

  // Container resize
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

  // D3 zoom — applied once
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on("zoom", (e) => {
      d3.select(gRef.current).attr("transform", e.transform.toString());
    });
    d3.select(svgRef.current).call(zoom);
  }, []);

  // D3 simulation — physics only, React owns the DOM
  useEffect(() => {
    simRef.current?.stop();

    const nodes: GraphNode[] = filteredNodes.map((n) => ({ ...n }));
    const edges = filteredEdges.map((e) => ({
      source: typeof e.source === "string" ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === "string" ? e.target : (e.target as GraphNode).id,
      broken: e.broken,
    }));

    simNodesRef.current = nodes;

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, { source: string; target: string; broken: boolean }>(edges).id((d) => d.id).distance(90).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(dims.w / 2, dims.h / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => nodeRadius(d.degree) + 6));

    sim.on("tick", () => {
      setPositions(new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])));
    });

    simRef.current = sim;
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes.length, filteredEdges.length, dims]);

  // React-based drag handlers (no D3 drag — React owns the SVG)
  const onNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    simRef.current?.alphaTarget(0.3).restart();
  }, []);

  const onSvgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { nodeId } = dragRef.current;
    const node = simNodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;

    // Convert screen coords to SVG local coords accounting for zoom/pan
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const g = gRef.current;
    const matrix = g ? (g as SVGGraphicsElement).getScreenCTM()?.inverse() : null;
    const local = matrix ? pt.matrixTransform(matrix) : pt;

    node.fx = local.x;
    node.fy = local.y;
  }, []);

  const onSvgPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    const { nodeId } = dragRef.current;
    const node = simNodesRef.current.find((n) => n.id === nodeId);
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

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className="bg-transparent"
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerLeave={onSvgPointerUp}
      >
        <g ref={gRef}>
          {/* Edges */}
          {filteredEdges.map((e, i) => {
            const srcId = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
            const tgtId = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
            const src = positions.get(srcId);
            const tgt = positions.get(tgtId);
            if (!src || !tgt) return null;
            const dimmed =
              hoveredNode !== null &&
              hoveredNode.id !== srcId &&
              hoveredNode.id !== tgtId &&
              !neighborIds(hoveredNode.id).has(srcId) &&
              !neighborIds(hoveredNode.id).has(tgtId);
            return (
              <line
                key={i}
                x1={src.x} y1={src.y}
                x2={tgt.x} y2={tgt.y}
                stroke={e.broken ? "var(--edge-broken)" : "var(--edge-color)"}
                strokeWidth={1}
                strokeDasharray={e.broken ? "4 3" : undefined}
                opacity={dimmed ? 0.05 : hoveredNode ? 0.6 : 0.4}
              />
            );
          })}

          {/* Nodes */}
          {filteredNodes.map((node) => {
            const pos = positions.get(node.id) ?? { x: dims.w / 2, y: dims.h / 2 };
            const r = nodeRadius(node.degree);
            const neighbors = hoveredNode ? neighborIds(hoveredNode.id) : null;
            const isHovered = hoveredNode?.id === node.id;
            const isNeighbor = neighbors?.has(node.id) ?? false;
            const dimmed = hoveredNode !== null && !isHovered && !isNeighbor;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: node.broken ? "default" : dragRef.current ? "grabbing" : "grab" }}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onMouseEnter={(ev) => {
                  if (dragRef.current) return;
                  setHoveredNode(node);
                  setTooltipPos({ x: ev.clientX, y: ev.clientY });
                }}
                onMouseMove={(ev) => {
                  if (dragRef.current) return;
                  setTooltipPos({ x: ev.clientX, y: ev.clientY });
                }}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => {
                  // Only navigate if it wasn't a drag
                  if (!node.broken && !dragRef.current) router.push(`/wiki/${node.id}`);
                  e.stopPropagation();
                }}
              >
                <circle
                  r={r}
                  fill={nodeColor(node.type)}
                  fillOpacity={dimmed ? 0.15 : node.broken ? 0.3 : 0.85}
                  stroke={nodeColor(node.type)}
                  strokeWidth={node.broken ? 1 : isHovered ? 2 : 0.5}
                  strokeOpacity={dimmed ? 0.1 : 1}
                  strokeDasharray={node.broken ? "3 2" : undefined}
                />
                {r > 10 && (
                  <text
                    textAnchor="middle"
                    dy="0.3em"
                    fontSize={Math.min(r * 0.7, 11)}
                    fill="white"
                    opacity={dimmed ? 0.1 : 0.9}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.label.length > 12 ? node.label.slice(0, 12) + "…" : node.label}
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
