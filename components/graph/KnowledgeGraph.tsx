"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
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
  return DOMAIN_COLORS[node.domain[0]] ?? TYPE_COLORS[node.type] ?? "#5a6080";
}
function nodeRadius(node: GraphNode): number {
  const cls = nodeClass(node.id, node.broken);
  if (cls === "core")    return 22;
  if (cls === "section") return 11 + Math.log(node.degree + 1) * 2;
  return 4 + Math.log(node.degree + 1) * 3.4;
}

/* ── Sphere geometry ── */
const SECTION_SPHERICAL: Record<string, { theta: number; phi: number }> = {
  research: { theta: 0,                phi: Math.PI / 3      },
  reading:  { theta: Math.PI / 2,      phi: 2 * Math.PI / 3  },
  business: { theta: Math.PI,          phi: Math.PI / 3      },
  personal: { theta: 3 * Math.PI / 2,  phi: 2 * Math.PI / 3  },
};

/* ── Galaxy generator (reduced for perf) ── */
interface GalaxyDot {
  x: number; y: number; r: number; o: number;
  layer: "arm" | "bulge" | "halo" | "dust" | "hotspot";
}
function frac(v: number) { return v - Math.floor(v); }
function hash(n: number) { return frac(Math.abs(Math.sin(n) * 43758.5453)); }

function spiralGalaxy(seed: number, opts: {
  arms: number; totalDots: number;
  maxR: number; logSpiralB: number; tilt: number; armWidth: number;
}): GalaxyDot[] {
  const dots: GalaxyDot[] = [];
  const { arms, totalDots, maxR, logSpiralB, tilt, armWidth } = opts;
  const armCount   = Math.floor(totalDots * 0.42);
  const bulgeCount = Math.floor(totalDots * 0.25);
  const haloCount  = Math.floor(totalDots * 0.18);
  const dustCount  = Math.floor(totalDots * 0.10);
  const hotCount   = Math.floor(totalDots * 0.05);

  for (let a = 0; a < arms; a++) {
    const armPhase = (a / arms) * Math.PI * 2;
    for (let i = 0; i < Math.floor(armCount / arms); i++) {
      const t = hash(seed + a * 3000 + i * 7.1);
      const rawDist = Math.pow(t, 0.6) * maxR;
      const spiralAngle = armPhase + Math.log(rawDist / 8 + 1) / logSpiralB;
      const spreadMag = (hash(seed + a * 3000 + i * 31.3) - 0.5) * armWidth * (0.4 + t * 0.8);
      const nx = -Math.sin(spiralAngle), ny = Math.cos(spiralAngle);
      const px = Math.cos(spiralAngle) * rawDist + nx * spreadMag;
      const py = (Math.sin(spiralAngle) * rawDist + ny * spreadMag) * tilt;
      const brightness = Math.exp(-rawDist / (maxR * 0.6));
      dots.push({
        x: px, y: py,
        r: (hash(seed + a * 3000 + i * 13.7) * 0.7 + 0.3) * (1.4 - t * 0.5),
        o: (hash(seed + a * 3000 + i * 47.3) * 0.25 + 0.10) * brightness + 0.04,
        layer: "arm",
      });
    }
  }
  for (let i = 0; i < bulgeCount; i++) {
    const angle = hash(seed + 6000 + i * 37.1) * Math.PI * 2;
    const r1 = hash(seed + 6000 + i * 73.3);
    const r2 = hash(seed + 6000 + i * 97.1);
    const r3 = hash(seed + 6000 + i * 53.7);
    const gaussDist = ((r1 + r2 + r3) / 3) * maxR * 0.35;
    dots.push({
      x: Math.cos(angle) * gaussDist,
      y: Math.sin(angle) * gaussDist * tilt * 0.85,
      r: hash(seed + 6000 + i * 11.7) * 1.6 + 0.5,
      o: Math.exp(-gaussDist / (maxR * 0.15)) * 0.40 + 0.04,
      layer: "bulge",
    });
  }
  for (let i = 0; i < haloCount; i++) {
    const angle = hash(seed + 9000 + i * 19.7) * Math.PI * 2;
    const dist = (0.4 + hash(seed + 9000 + i * 53.1) * 0.65) * maxR;
    dots.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * tilt * 0.9,
      r: hash(seed + 9000 + i * 31.3) * 0.4 + 0.1,
      o: hash(seed + 9000 + i * 67.9) * 0.07 + 0.02,
      layer: "halo",
    });
  }
  for (let i = 0; i < dustCount; i++) {
    const t = hash(seed + 12000 + i * 29.3);
    const dist = Math.pow(t, 0.5) * maxR * 0.75;
    const betweenAngle = hash(seed + 12000 + i * 61.7) * Math.PI * 2;
    dots.push({
      x: Math.cos(betweenAngle) * dist,
      y: Math.sin(betweenAngle) * dist * tilt,
      r: hash(seed + 12000 + i * 17.1) * 2.2 + 1.0,
      o: hash(seed + 12000 + i * 41.3) * 0.04 + 0.01,
      layer: "dust",
    });
  }
  for (let i = 0; i < hotCount; i++) {
    const armIdx = Math.floor(hash(seed + 15000 + i * 7) * arms);
    const armPhase = (armIdx / arms) * Math.PI * 2;
    const t = 0.2 + hash(seed + 15000 + i * 43.3) * 0.5;
    const dist = t * maxR;
    const angle = armPhase + Math.log(dist / 8 + 1) / logSpiralB;
    dots.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * tilt,
      r: hash(seed + 15000 + i * 19.1) * 1.8 + 0.9,
      o: hash(seed + 15000 + i * 57.3) * 0.45 + 0.25,
      layer: "hotspot",
    });
  }
  return dots;
}

/* Reduced counts: 380 core + 4×180 sec = ~1100 (was 4200) */
const CORE_GALAXY = spiralGalaxy(0, {
  arms: 4, totalDots: 380, maxR: 200, logSpiralB: 0.38, tilt: 0.42, armWidth: 32,
});
const SEC_GALAXIES: Record<string, GalaxyDot[]> = {
  research: spiralGalaxy(100, { arms: 3, totalDots: 180, maxR: 130, logSpiralB: 0.42, tilt: 0.48, armWidth: 22 }),
  personal: spiralGalaxy(200, { arms: 2, totalDots: 180, maxR: 130, logSpiralB: 0.30, tilt: 0.55, armWidth: 26 }),
  reading:  spiralGalaxy(300, { arms: 3, totalDots: 180, maxR: 130, logSpiralB: 0.40, tilt: 0.45, armWidth: 20 }),
  business: spiralGalaxy(400, { arms: 4, totalDots: 180, maxR: 130, logSpiralB: 0.34, tilt: 0.50, armWidth: 24 }),
};
const SEC_TILT_ANGLES: Record<string, number> = {
  research: -15, personal: 25, reading: -35, business: 10,
};
const CORE_ROTATION_SPEED = 240;
const SEC_ROTATION_SPEEDS: Record<string, number> = {
  research: 180, personal: 210, reading: 165, business: 195,
};

/* ── Background starfield ── */
const STARS = Array.from({ length: 100 }, (_, i) => {
  const h1 = hash(i * 127.1 + 1.3);
  const h2 = hash(i * 311.7 + 5.7);
  const h3 = hash(i * 73.1  + 2.1);
  const h4 = hash(i * 47.3  + 9.9);
  return {
    x: h1 * 100, y: h2 * 100,
    r: h3 * 1.0 + 0.3,
    o: h4 * 0.20 + 0.04,
    blue: i % 5 === 0,
  };
});

/* ── Sphere rotation ── */
const ROTATION_SPEED = 0.0024;
const DRAG_SENSITIVITY = 0.006; // rad per pixel

/* ── Component ── */
export default function KnowledgeGraph({ data, activeDomains }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef   = useRef<SVGGElement>(null);
  const router = useRouter();

  const [dims,        setDims]        = useState({ w: 800, h: 600 });
  const [zoomScale,   setZoomScale]   = useState(1);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos,  setTooltipPos]  = useState({ x: 0, y: 0 });

  /* Animation refs (no React state for rotation) */
  const rotationRef    = useRef(0);
  const pausedRef      = useRef(false);
  const dragRef        = useRef<{ startX: number; startRot: number } | null>(null);
  const hoveredIdRef   = useRef<string | null>(null);
  const neighborSetRef = useRef<Set<string>>(new Set());

  /* Geometry refs (for use inside rAF) */
  const cxRef      = useRef(0);
  const cyRef      = useRef(0);
  const sphereRRef = useRef(0);

  /* DOM element refs */
  const nodeElRefs   = useRef(new Map<string, SVGGElement>());
  const edgeElRefs   = useRef(new Map<string, SVGLineElement>());
  const galaxyElRefs = useRef(new Map<string, SVGGElement>());

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

  /* D3 zoom (pan + zoom) */
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .filter((event) => {
        // Disable pan/zoom drag — we own pointer drag for rotation
        if (event.type === "wheel") return true;
        return false;
      })
      .on("zoom", (e) => {
        d3.select(gRef.current).attr("transform", e.transform.toString());
        setZoomScale(e.transform.k);
      });
    d3.select(svgRef.current).call(zoom);
  }, []);

  /* Filtered data */
  const filteredNodes = useMemo(
    () => data.nodes.filter(n =>
      activeDomains.size === 0 || n.broken ||
      nodeClass(n.id) === "core" || nodeClass(n.id) === "section" ||
      n.domain.some(d => activeDomains.has(d))
    ),
    [data.nodes, activeDomains]
  );
  const filteredIds = useMemo(
    () => new Set(filteredNodes.map(n => n.id)),
    [filteredNodes]
  );
  const filteredEdges = useMemo(
    () => data.edges.filter(e => {
      const s = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
      return filteredIds.has(s) && filteredIds.has(t);
    }),
    [data.edges, filteredIds]
  );

  /* Filter edges by visibility rules */
  interface ProcessedEdge {
    e: GraphEdge; sId: string; tId: string;
    isSpinal: boolean; isConceptual: boolean;
    color: string; baseOpacity: number;
    strokeWidth: number; dashArray: string | undefined;
    key: string;
  }
  const processedEdges = useMemo<ProcessedEdge[]>(() => {
    const out: ProcessedEdge[] = [];
    const nodeMap = new Map(filteredNodes.map(n => [n.id, n]));
    for (const e of filteredEdges) {
      const sId = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
      const tId = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
      const sNode = nodeMap.get(sId);
      const tNode = nodeMap.get(tId);
      if (!sNode || !tNode) continue;
      const sc = nodeClass(sId), tc = nodeClass(tId);
      const isSpinal    = (sc === "core" && tc === "section") || (tc === "core" && sc === "section");
      const isSectional = !isSpinal && (
        (sc === "section" && (tc === "leaf" || tc === "ghost")) ||
        (tc === "section" && (sc === "leaf" || sc === "ghost"))
      );
      const isConceptual = !isSpinal && !isSectional &&
        sc === "leaf" && tc === "leaf" && (
          (sNode.type === "concept" && tNode.type === "source-summary") ||
          (sNode.type === "source-summary" && tNode.type === "concept")
        );
      if (!isSpinal && !isSectional && !isConceptual) continue;

      const sectionId = isSpinal
        ? (sc === "core" ? tId : sId)
        : isConceptual
          ? sId
          : (sc === "section" ? sId : tId);
      const dom = sectionId.split("/")[0];
      const domainColor = DOMAIN_COLORS[dom] ?? DOMAIN_COLORS[sNode.domain[0]] ?? "#4f9cf9";
      const color = isSpinal ? domainColor : isConceptual ? domainColor + "99" : domainColor + "55";
      const baseOp = isSpinal ? 0.55 : isConceptual ? 0.45 : 0.28;
      out.push({
        e, sId, tId,
        isSpinal, isConceptual,
        color, baseOpacity: baseOp,
        strokeWidth: isSpinal ? 1.2 : isConceptual ? 0.9 : 0.7,
        dashArray: e.broken ? "4 3" : isConceptual ? "2 4" : undefined,
        key: `${sId}__${tId}`,
      });
    }
    return out;
  }, [filteredEdges, filteredNodes]);

  /* Spherical positions */
  const sphericalPositions = useMemo(() => {
    const map = new Map<string, { theta: number; phi: number; isCore: boolean }>();
    const sectionLeaves: Record<string, GraphNode[]> = {};
    for (const n of filteredNodes) {
      if (n.id === "index") {
        map.set(n.id, { theta: 0, phi: 0, isCore: true });
        continue;
      }
      if (n.id.endsWith("/index")) {
        const dom = n.id.split("/")[0];
        const sp = SECTION_SPHERICAL[dom] ?? { theta: 0, phi: Math.PI / 2 };
        map.set(n.id, { ...sp, isCore: false });
        continue;
      }
      const dom = n.domain[0] ?? "research";
      if (!sectionLeaves[dom]) sectionLeaves[dom] = [];
      sectionLeaves[dom].push(n);
    }
    for (const [dom, leaves] of Object.entries(sectionLeaves)) {
      const sp = SECTION_SPHERICAL[dom] ?? { theta: 0, phi: Math.PI / 2 };
      const sinPhi = Math.max(Math.sin(sp.phi), 0.3);
      leaves.forEach((n, i) => {
        const seedBase = i * 73.13 + dom.length * 17.3;
        const a = hash(seedBase) * Math.PI * 2;
        const r = 0.30 + hash(seedBase + 7.7) * 0.50;
        const newPhi = sp.phi + r * Math.sin(a);
        map.set(n.id, {
          theta: sp.theta + (r * Math.cos(a)) / sinPhi,
          phi: Math.max(0.20, Math.min(Math.PI - 0.20, newPhi)),
          isCore: false,
        });
      });
    }
    return map;
  }, [filteredNodes]);

  /* Geometry — center sphere when no side panel (mobile/narrow) */
  const isNarrow = dims.w < 900;
  const cx = isNarrow ? dims.w * 0.5 : dims.w * 0.40;
  const cy = dims.h * 0.5;
  const sphereR = Math.min(dims.w, dims.h) * (isNarrow ? 0.40 : 0.36);
  cxRef.current = cx;
  cyRef.current = cy;
  sphereRRef.current = sphereR;

  /* Refs to data for rAF */
  const filteredNodesRef    = useRef(filteredNodes);
  const processedEdgesRef   = useRef(processedEdges);
  const sphericalPosRef     = useRef(sphericalPositions);
  filteredNodesRef.current  = filteredNodes;
  processedEdgesRef.current = processedEdges;
  sphericalPosRef.current   = sphericalPositions;

  /* ── rAF animation loop (direct DOM updates) ── */
  useEffect(() => {
    let id: number;
    const tick = () => {
      if (!pausedRef.current && !dragRef.current) {
        rotationRef.current += ROTATION_SPEED;
      }
      const rot     = rotationRef.current;
      const cx      = cxRef.current;
      const cy      = cyRef.current;
      const sphereR = sphereRRef.current;
      const hoverId = hoveredIdRef.current;
      const neighbors = neighborSetRef.current;

      const positions = new Map<string, { x: number; y: number; depth: number }>();

      // Compute positions
      for (const node of filteredNodesRef.current) {
        const sp = sphericalPosRef.current.get(node.id);
        let x = cx, y = cy, depth = 0.5;
        if (sp && !sp.isCore) {
          const t = sp.theta - rot;
          const sinP = Math.sin(sp.phi);
          const nx = sinP * Math.cos(t);
          const ny = -Math.cos(sp.phi);
          const nz = sinP * Math.sin(t);
          x = cx + nx * sphereR;
          y = cy + ny * sphereR;
          depth = (nz + 1) / 2;
        }
        positions.set(node.id, { x, y, depth });
      }

      // Update node DOM
      for (const [nodeId, p] of positions) {
        const el = nodeElRefs.current.get(nodeId);
        if (!el) continue;
        el.setAttribute("transform", `translate(${p.x},${p.y})`);
        let opacity: number;
        if (hoverId) {
          if (hoverId === nodeId || neighbors.has(nodeId)) {
            opacity = 0.6 + p.depth * 0.4;
          } else {
            opacity = 0.04;
          }
        } else {
          opacity = 0.30 + p.depth * 0.70;
        }
        el.style.opacity = String(opacity);
      }

      // Update section galaxy DOM
      for (const node of filteredNodesRef.current) {
        if (nodeClass(node.id) !== "section") continue;
        const p = positions.get(node.id);
        if (!p) continue;
        const galaxy = galaxyElRefs.current.get(node.id);
        if (!galaxy) continue;
        const dom = node.id.split("/")[0];
        const tilt = SEC_TILT_ANGLES[dom] ?? 0;
        const sc = 0.55 + p.depth * 0.45;
        galaxy.setAttribute("transform", `translate(${p.x},${p.y}) rotate(${tilt}) scale(${sc})`);
        galaxy.style.opacity = String(0.30 + p.depth * 0.70);
      }

      // Update edge DOM
      for (const pe of processedEdgesRef.current) {
        const line = edgeElRefs.current.get(pe.key);
        if (!line) continue;
        const src = positions.get(pe.sId);
        const tgt = positions.get(pe.tId);
        if (!src || !tgt) { line.style.opacity = "0"; continue; }
        line.setAttribute("x1", String(src.x));
        line.setAttribute("y1", String(src.y));
        line.setAttribute("x2", String(tgt.x));
        line.setAttribute("y2", String(tgt.y));
        const minDepth = Math.min(src.depth, tgt.depth);
        let opacity: number;
        if (hoverId) {
          if (pe.sId === hoverId || pe.tId === hoverId) opacity = 0.9;
          else opacity = 0;
        } else {
          opacity = pe.baseOpacity * (0.3 + minDepth * 0.7);
        }
        line.style.opacity = String(opacity);
      }

      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  /* ── Drag rotation ── */
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    if (target.closest("[data-node]")) return; // skip drag on nodes
    dragRef.current = { startX: e.clientX, startRot: rotationRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "grabbing";
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    rotationRef.current = dragRef.current.startRot + dx * DRAG_SENSITIVITY;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    document.body.style.cursor = "";
  }, []);

  /* ── Hover handlers ── */
  const onNodeEnter = useCallback((node: GraphNode, ev: React.MouseEvent) => {
    if (dragRef.current) return;
    pausedRef.current = true;
    hoveredIdRef.current = node.id;
    const ns = new Set<string>();
    for (const e of filteredEdges) {
      const s = typeof e.source === "string" ? e.source : (e.source as GraphNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as GraphNode).id;
      if (s === node.id) ns.add(t);
      if (t === node.id) ns.add(s);
    }
    neighborSetRef.current = ns;
    setHoveredNode(node);
    setTooltipPos({ x: ev.clientX, y: ev.clientY });
  }, [filteredEdges]);

  const onNodeLeave = useCallback(() => {
    pausedRef.current = false;
    hoveredIdRef.current = null;
    neighborSetRef.current = new Set();
    setHoveredNode(null);
  }, []);

  const onNodeMove = useCallback((ev: React.MouseEvent) => {
    setTooltipPos({ x: ev.clientX, y: ev.clientY });
  }, []);

  /* ── Render ── */
  return (
    <div className="relative w-full h-full" style={{ background: "#00000f" }}>
      <svg
        ref={svgRef} width="100%" height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: "grab", touchAction: "none" }}
      >
        <defs>
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

          <radialGradient id="nebula-1" gradientUnits="userSpaceOnUse"
            cx={cx} cy={cy} r={Math.min(dims.w, dims.h) * 0.55}>
            <stop offset="0%"   stopColor="#0d2860" stopOpacity="0.45" />
            <stop offset="40%"  stopColor="#060e30" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-2" gradientUnits="userSpaceOnUse"
            cx={cx + 140} cy={cy - 100} r={Math.min(dims.w, dims.h) * 0.32}>
            <stop offset="0%"   stopColor="#2a0a5e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="sphere-atmo" cx="50%" cy="50%" r="50%">
            <stop offset="60%"  stopColor="#000020" stopOpacity="0" />
            <stop offset="88%"  stopColor="#0a1840" stopOpacity="0.18" />
            <stop offset="98%"  stopColor="#1530a0" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#000005" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="gneb-core-inner" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#a0d0ff" stopOpacity="0.40" />
            <stop offset="15%"  stopColor="#6090d0" stopOpacity="0.28" />
            <stop offset="40%"  stopColor="#2850a0" stopOpacity="0.12" />
            <stop offset="70%"  stopColor="#101840" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gneb-core-outer" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#102060" stopOpacity="0.14" />
            <stop offset="25%"  stopColor="#0a1040" stopOpacity="0.08" />
            <stop offset="60%"  stopColor="#050820" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
            <radialGradient key={`gneb-${domain}`} id={`gneb-${domain}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
              <stop offset="20%"  stopColor={color} stopOpacity="0.12" />
              <stop offset="50%"  stopColor={color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
          ))}

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

        {/* Static background */}
        <rect width="100%" height="100%" fill="url(#dots)" />
        <rect width="100%" height="100%" fill="url(#nebula-1)" />
        <rect width="100%" height="100%" fill="url(#nebula-2)" />
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill={s.blue ? "#a8d8ff" : "#ccd8ff"} opacity={s.o} />
        ))}

        {/* Zoom group */}
        <g ref={gRef}>
          {/* Sphere shell */}
          <circle cx={cx} cy={cy} r={sphereR * 1.04}
            fill="url(#sphere-atmo)" pointerEvents="none" />
          <circle cx={cx} cy={cy} r={sphereR}
            fill="none" stroke="#1a3060" strokeWidth={0.5}
            strokeOpacity={0.10} strokeDasharray="2 14" />

          {/* Section galaxies (rendered once, positions via DOM in rAF) */}
          {filteredNodes
            .filter(n => nodeClass(n.id) === "section")
            .map((node) => {
              const dom = node.id.split("/")[0];
              const color = DOMAIN_COLORS[dom] ?? "#5a6080";
              const dots = SEC_GALAXIES[dom] ?? SEC_GALAXIES.research;
              const speed = SEC_ROTATION_SPEEDS[dom] ?? 180;
              const tilt = SEC_TILT_ANGLES[dom] ?? 0;
              return (
                <g key={`gneb-${node.id}`}
                  ref={(el) => {
                    if (el) galaxyElRefs.current.set(node.id, el);
                    else    galaxyElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy}) rotate(${tilt})`}
                  style={{ pointerEvents: "none", opacity: 0.6 }}
                >
                  <ellipse rx={200} ry={92} fill={`url(#gneb-${dom})`} opacity={0.5} />
                  <ellipse rx={140} ry={66} fill={`url(#gneb-${dom})`} opacity={0.55} />
                  <ellipse rx={80}  ry={38} fill={`url(#gneb-${dom})`} opacity={0.6} />
                  <g style={{
                    animation: `spin ${speed}s linear infinite ${dom === "personal" || dom === "business" ? "reverse" : ""}`,
                    transformOrigin: "0 0",
                  }}>
                    {dots.map((d, i) => {
                      let fill: string;
                      switch (d.layer) {
                        case "bulge":   fill = "#ffffff"; break;
                        case "hotspot": fill = color;     break;
                        case "arm":     fill = color;     break;
                        case "dust":    fill = `${color}10`; break;
                        default:        fill = `${color}70`; break;
                      }
                      return (
                        <circle key={i} cx={d.x} cy={d.y} r={d.r}
                          fill={fill} opacity={d.o}
                          filter={d.layer === "hotspot" ? "url(#glow-soft)" : undefined} />
                      );
                    })}
                  </g>
                  <ellipse rx={11} ry={5.5} fill="#fff"  opacity={0.28} filter="url(#glow)" />
                  <ellipse rx={5}  ry={2.5} fill={color} opacity={0.45} filter="url(#glow-soft)" />
                </g>
              );
            })}

          {/* CORE GALAXY (always at center) */}
          <g transform={`translate(${cx},${cy})`} style={{ pointerEvents: "none" }}>
            <ellipse rx={300} ry={130} fill="url(#gneb-core-outer)" opacity={0.6} />
            <ellipse rx={220} ry={95}  fill="url(#gneb-core-outer)" opacity={0.5} />
            <ellipse rx={150} ry={65}  fill="url(#gneb-core-inner)" opacity={0.7} />
            <ellipse rx={85}  ry={38}  fill="url(#gneb-core-inner)" opacity={0.6} />
            <ellipse rx={40}  ry={18}  fill="url(#gneb-core-inner)" opacity={0.5} />
            <g style={{ animation: `spin ${CORE_ROTATION_SPEED}s linear infinite`, transformOrigin: "0 0" }}>
              {CORE_GALAXY.map((d, i) => {
                let fill: string;
                switch (d.layer) {
                  case "bulge":   fill = "#d8e8ff"; break;
                  case "hotspot": fill = "#a0d4ff"; break;
                  case "arm":     fill = "#7ab0e8"; break;
                  case "dust":    fill = "#0a1225"; break;
                  default:        fill = "#4878b0"; break;
                }
                return (
                  <circle key={i} cx={d.x} cy={d.y} r={d.r}
                    fill={fill} opacity={d.o}
                    filter={d.layer === "hotspot" ? "url(#glow-soft)" : undefined} />
                );
              })}
            </g>
            <ellipse rx={20} ry={9}  fill="#c8e0ff" opacity={0.30} filter="url(#glow-strong)" />
            <ellipse rx={10} ry={5}  fill="#e8f4ff" opacity={0.45} filter="url(#glow)" />
          </g>

          {/* EDGES (positions/opacity via rAF) */}
          {processedEdges.map((pe) => {
            const isHoverConnected = hoveredNode &&
              (pe.sId === hoveredNode.id || pe.tId === hoveredNode.id);
            const stroke = isHoverConnected
              ? (pe.e.broken ? "#ef4444" : "#7fc8ff")
              : pe.color;
            return (
              <line key={pe.key}
                ref={(el) => {
                  if (el) edgeElRefs.current.set(pe.key, el);
                  else    edgeElRefs.current.delete(pe.key);
                }}
                x1={cx} y1={cy} x2={cx} y2={cy}
                stroke={stroke}
                strokeWidth={pe.strokeWidth}
                strokeDasharray={pe.dashArray}
                style={{ opacity: 0 }}
              />
            );
          })}

          {/* NODES (positions/opacity via rAF) */}
          {filteredNodes.map((node) => {
            const cls = nodeClass(node.id, node.broken);
            const r   = nodeRadius(node);
            const isHovered  = hoveredNode?.id === node.id;
            const isNeighbor = hoveredNode ? neighborSetRef.current.has(node.id) : false;
            const showLabel  = (cls === "core" || cls === "section") || isHovered || (zoomScale > 1.4 && cls === "leaf");

            if (cls === "core") {
              return (
                <g key={node.id}
                  data-node="1"
                  ref={(el) => {
                    if (el) nodeElRefs.current.set(node.id, el);
                    else    nodeElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(ev) => onNodeEnter(node, ev)}
                  onMouseMove={onNodeMove}
                  onMouseLeave={onNodeLeave}
                  onClick={(e) => { router.push("/wiki/index"); e.stopPropagation(); }}
                >
                  <circle r={r + 10} fill="#4080c0" opacity={isHovered ? 0.22 : 0.10} />
                  <circle r={r + 6}  fill="none" stroke="#a8d0ff" strokeWidth={0.8}
                    strokeOpacity={0.35} strokeDasharray="4 8" />
                  <circle r={r}      fill="#7ab8ff"
                    filter={isHovered ? "url(#glow-strong)" : "url(#glow)"} />
                  {showLabel && (
                    <text textAnchor="middle" y={r + 18}
                      fontSize={14} fontWeight={700}
                      fill={isHovered ? "#fff" : "#a8d0ff"}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                      filter="url(#glow-soft)">
                      {node.label}
                    </text>
                  )}
                </g>
              );
            }

            if (cls === "section") {
              const dom = node.id.split("/")[0];
              const color = DOMAIN_COLORS[dom] ?? "#5a6080";
              return (
                <g key={node.id}
                  data-node="1"
                  ref={(el) => {
                    if (el) nodeElRefs.current.set(node.id, el);
                    else    nodeElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(ev) => onNodeEnter(node, ev)}
                  onMouseMove={onNodeMove}
                  onMouseLeave={onNodeLeave}
                  onClick={(e) => { router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
                >
                  <circle r={r + 5} fill={color} opacity={isHovered ? 0.24 : 0.10} />
                  <circle r={r + 4} fill="none" stroke={color} strokeWidth={0.7}
                    strokeOpacity={0.30} strokeDasharray="3 6" />
                  <circle r={r}
                    fill={`url(#sec-${dom})`}
                    stroke={color} strokeWidth={isHovered ? 2 : 1.2}
                    strokeOpacity={0.8}
                    filter={isHovered ? "url(#glow-strong)" : "url(#glow)"} />
                  {showLabel && (
                    <text textAnchor="middle" y={r + 16}
                      fontSize={Math.max(9, 11 / zoomScale + 2)} fontWeight={600}
                      fill={isHovered ? "#fff" : color}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.label}
                    </text>
                  )}
                </g>
              );
            }

            // LEAF / GHOST
            const color = cls === "ghost" ? "#27272a" : leafColor(node);
            const highlighted = isHovered || isNeighbor;
            return (
              <g key={node.id}
                data-node="1"
                ref={(el) => {
                  if (el) nodeElRefs.current.set(node.id, el);
                  else    nodeElRefs.current.delete(node.id);
                }}
                transform={`translate(${cx},${cy})`}
                style={{ cursor: node.broken ? "default" : "pointer" }}
                onMouseEnter={(ev) => onNodeEnter(node, ev)}
                onMouseMove={onNodeMove}
                onMouseLeave={onNodeLeave}
                onClick={(e) => { if (!node.broken) router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
              >
                {!node.broken && (
                  <circle r={r + 4} fill={color} opacity={highlighted ? 0.16 : 0.04}
                    style={{ pointerEvents: "none" }} />
                )}
                {isHovered && (
                  <circle r={r + 12} fill={color} opacity={0.08} style={{ pointerEvents: "none" }} />
                )}
                <circle r={r}
                  fill={node.broken ? "transparent" : color}
                  fillOpacity={node.broken ? 0 : highlighted ? 1 : 0.85}
                  stroke={color}
                  strokeWidth={isHovered ? 2 : node.broken ? 0.8 : 1.2}
                  strokeOpacity={node.broken ? 0.25 : highlighted ? 1 : 0.65}
                  strokeDasharray={node.broken ? "3 2" : undefined}
                  filter={isHovered ? "url(#glow-strong)" : isNeighbor ? "url(#glow)" : "url(#glow-soft)"} />
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

      {hoveredNode && (
        <NodeTooltip node={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />
      )}
    </div>
  );
}
