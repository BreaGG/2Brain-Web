"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import type { GraphData, GraphNode, GraphEdge, ParsedPage } from "@/lib/types";
import NodePreviewPanel from "./NodePreviewPanel";
import HandTracking from "./HandTracking";

interface Props {
  data: GraphData;
  activeDomains: Set<string>;
  pages?: ParsedPage[];
  handActive?: boolean;
  onHandActiveChange?: (active: boolean) => void;
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
  /* Star type: shifts hue for realism (0=blue-white, 1=white, 2=yellow, 3=red giant) */
  starType: number;
}

/* Star palettes — realistic stellar spectrum */
const STAR_PALETTE_CORE = ["#a8c8ff", "#ffffff", "#ffeec0", "#ffb088"];
function starColorCore(t: number): string { return STAR_PALETTE_CORE[t]; }
function starColorSection(t: number, base: string): string {
  // Mix domain color with stellar tints
  switch (t) {
    case 0: return "#c8e0ff"; // hot blue
    case 1: return "#ffffff"; // white
    case 2: return base;       // domain color
    case 3: return "#ffb88a"; // red-orange (older stars)
    default: return base;
  }
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
      // Arms: bias toward blue-white near center, mix toward red-orange at edges
      const armColorRand = hash(seed + a * 3000 + i * 89.1);
      const armStarType = t < 0.3 ? (armColorRand < 0.7 ? 0 : 1)
                        : t < 0.6 ? Math.floor(armColorRand * 3)
                        : Math.min(3, Math.floor(armColorRand * 4));
      dots.push({
        x: px, y: py,
        r: (hash(seed + a * 3000 + i * 13.7) * 0.7 + 0.3) * (1.4 - t * 0.5),
        o: (hash(seed + a * 3000 + i * 47.3) * 0.25 + 0.10) * brightness + 0.04,
        layer: "arm",
        starType: armStarType,
      });
    }
  }
  for (let i = 0; i < bulgeCount; i++) {
    const angle = hash(seed + 6000 + i * 37.1) * Math.PI * 2;
    const r1 = hash(seed + 6000 + i * 73.3);
    const r2 = hash(seed + 6000 + i * 97.1);
    const r3 = hash(seed + 6000 + i * 53.7);
    const gaussDist = ((r1 + r2 + r3) / 3) * maxR * 0.35;
    // Bulge: mostly yellow/red old stars
    const bulgeStar = hash(seed + 6000 + i * 41.7) < 0.3 ? 1 : (hash(seed + 6000 + i * 53.1) < 0.5 ? 2 : 3);
    dots.push({
      x: Math.cos(angle) * gaussDist,
      y: Math.sin(angle) * gaussDist * tilt * 0.85,
      r: hash(seed + 6000 + i * 11.7) * 1.6 + 0.5,
      o: Math.exp(-gaussDist / (maxR * 0.15)) * 0.40 + 0.04,
      layer: "bulge",
      starType: bulgeStar,
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
      starType: 1,
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
      starType: 0,
    });
  }
  for (let i = 0; i < hotCount; i++) {
    const armIdx = Math.floor(hash(seed + 15000 + i * 7) * arms);
    const armPhase = (armIdx / arms) * Math.PI * 2;
    const t = 0.2 + hash(seed + 15000 + i * 43.3) * 0.5;
    const dist = t * maxR;
    const angle = armPhase + Math.log(dist / 8 + 1) / logSpiralB;
    // Hotspots = star-forming regions = blue-white
    dots.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * tilt,
      r: hash(seed + 15000 + i * 19.1) * 1.8 + 0.9,
      o: hash(seed + 15000 + i * 57.3) * 0.45 + 0.25,
      layer: "hotspot",
      starType: 0,
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
/* Stellar palette — realistic colors */
const STAR_COLORS = ["#f4f6ff", "#a8d8ff", "#fff4c0", "#ffd0a0", "#ffc8e0"];

interface Star { x: number; y: number; r: number; o: number; color: string; }

/* Background starfield — multi-tier (dim → featured) for richness */
const STARS: Star[] = Array.from({ length: 320 }, (_, i) => {
  const h1 = hash(i * 127.1 + 1.3);
  const h2 = hash(i * 311.7 + 5.7);
  const h3 = hash(i * 73.1  + 2.1);
  const h4 = hash(i * 47.3  + 9.9);
  const h5 = hash(i * 91.3  + 6.6);

  // Tier distribution: 60% tiny, 25% small, 12% medium, 3% featured
  let r: number, o: number;
  if      (h5 < 0.60) { r = h3 * 0.35 + 0.10; o = h4 * 0.14 + 0.025; }
  else if (h5 < 0.85) { r = h3 * 0.55 + 0.30; o = h4 * 0.22 + 0.08;  }
  else if (h5 < 0.97) { r = h3 * 0.85 + 0.55; o = h4 * 0.35 + 0.18;  }
  else                { r = h3 * 1.40 + 1.00; o = 0.55 + h4 * 0.40;  }

  // Color: 70% white, 15% blue, 9% yellow, 4% red-orange, 2% pink
  const ci = h2 < 0.70 ? 0 : h2 < 0.85 ? 1 : h2 < 0.94 ? 2 : h2 < 0.98 ? 3 : 4;

  return { x: h1 * 100, y: h2 * 100, r, o, color: STAR_COLORS[ci] };
});

/* Featured twinkling stars — bright stars with subtle opacity animation */
const TWINKLE_STARS: Star[] = Array.from({ length: 16 }, (_, i) => {
  const h1 = hash(i * 521.7 + 11);
  const h2 = hash(i * 379.3 + 19);
  const h3 = hash(i * 211.1 + 29);
  const h4 = hash(i * 637.9 + 37);
  const ci = h4 < 0.50 ? 0 : h4 < 0.70 ? 1 : h4 < 0.85 ? 2 : 3;
  return {
    x: h1 * 100, y: h2 * 100,
    r: 1.0 + h3 * 1.2,
    o: 0.6 + h3 * 0.30,
    color: STAR_COLORS[ci],
  };
});

/* Shooting stars — animated streaks */
interface ShootingStar {
  x1: number; y1: number; x2: number; y2: number;
  delay: number; dur: number;
}
const SHOOTING_STARS: ShootingStar[] = [
  { x1: 5,  y1: 15, x2: 35, y2: 38, delay: 0,  dur: 9  },
  { x1: 75, y1: 8,  x2: 95, y2: 28, delay: 4,  dur: 11 },
  { x1: 20, y1: 80, x2: 55, y2: 95, delay: 7,  dur: 13 },
  { x1: 80, y1: 65, x2: 60, y2: 88, delay: 12, dur: 10 },
];

/* Milky way — dense star cluster along band axis (band-local coords) */
interface BandStar { bx: number; by: number; r: number; o: number; color: string; }
const MILKY_STARS: BandStar[] = Array.from({ length: 220 }, (_, i) => {
  const h1 = hash(i * 53.13 + 100);
  const h2 = hash(i * 89.71 + 200);
  const h3 = hash(i * 41.31 + 300);
  const h4 = hash(i * 67.93 + 400);
  const h5 = hash(i * 23.17 + 500);
  // X: span band length, slight gaussian peak
  const bx = (h1 - 0.5) * 2; // [-1, 1]
  // Y: narrow gaussian (sum of uniforms approx) around band axis
  const by = ((h2 - 0.5) + (h3 - 0.5) + (h5 - 0.5)) / 2.4; // tight cluster
  // Tier
  let r: number, o: number;
  if      (h4 < 0.65) { r = 0.18 + h3 * 0.30; o = 0.05 + h4 * 0.18; }
  else if (h4 < 0.92) { r = 0.35 + h3 * 0.45; o = 0.18 + h4 * 0.25; }
  else                { r = 0.70 + h3 * 0.80; o = 0.45 + h4 * 0.30; }
  const ci = h5 < 0.70 ? 0 : h5 < 0.88 ? 1 : h5 < 0.96 ? 2 : 3;
  return { bx, by, r, o, color: STAR_COLORS[ci] };
});

/* ── Sphere rotation ── */
const ROTATION_SPEED = 0.0024;
const DRAG_SENSITIVITY = 0.006; // rad per pixel

/* ── Cube primitives (core node) ── */
const CUBE_VERTS: [number, number, number][] = [
  [-1,-1,-1], [ 1,-1,-1], [ 1, 1,-1], [-1, 1,-1],
  [-1,-1, 1], [ 1,-1, 1], [ 1, 1, 1], [-1, 1, 1],
];
const CUBE_EDGES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,0],         // back face
  [4,5],[5,6],[6,7],[7,4],         // front face
  [0,4],[1,5],[2,6],[3,7],         // connecting
];

interface CubeConfig {
  scale: number; color: string; strokeWidth: number; opacity: number;
  rxSpeed: number; rySpeed: number; rzSpeed: number;
  vertexR: number;
}
/* 4 nested cubes — very tight, single unit feel */
const CORE_CUBES: CubeConfig[] = [
  { scale: 30, color: "#5a90d8", strokeWidth: 0.8, opacity: 0.55, rxSpeed:  0.0016, rySpeed:  0.0010, rzSpeed:  0.0007, vertexR: 1.5 },
  { scale: 26, color: "#88baf0", strokeWidth: 0.9, opacity: 0.75, rxSpeed: -0.0026, rySpeed:  0.0034, rzSpeed: -0.0014, vertexR: 1.8 },
  { scale: 22, color: "#c0deff", strokeWidth: 1.0, opacity: 0.90, rxSpeed:  0.0042, rySpeed: -0.0028, rzSpeed:  0.0024, vertexR: 2.1 },
  { scale: 18, color: "#ffffff", strokeWidth: 1.2, opacity: 1.00, rxSpeed: -0.0058, rySpeed:  0.0050, rzSpeed:  0.0044, vertexR: 2.4 },
];

/* Build single-path d string for cube — 12 edges in one path */
function cubePathD(verts: { x: number; y: number; z: number }[], cx: number, cy: number): string {
  const p = (i: number) => `${(cx + verts[i].x).toFixed(1)} ${(cy + verts[i].y).toFixed(1)}`;
  return (
    `M${p(0)}L${p(1)}L${p(2)}L${p(3)}Z` +
    `M${p(4)}L${p(5)}L${p(6)}L${p(7)}Z` +
    `M${p(0)}L${p(4)}M${p(1)}L${p(5)}M${p(2)}L${p(6)}M${p(3)}L${p(7)}`
  );
}

/* Project unit cube vertex with 3D rotation → 2D + depth */
function projectCubeVert(
  v: [number, number, number],
  rx: number, ry: number, rz: number,
  scale: number,
): { x: number; y: number; z: number } {
  let [x, y, z] = v;
  // Rotate around Z
  let nx = x * Math.cos(rz) - y * Math.sin(rz);
  let ny = x * Math.sin(rz) + y * Math.cos(rz);
  x = nx; y = ny;
  // Rotate around Y
  nx = x * Math.cos(ry) + z * Math.sin(ry);
  let nz = -x * Math.sin(ry) + z * Math.cos(ry);
  x = nx; z = nz;
  // Rotate around X
  ny = y * Math.cos(rx) - z * Math.sin(rx);
  nz = y * Math.sin(rx) + z * Math.cos(rx);
  return { x: x * scale, y: ny * scale, z: nz * scale };
}

/* ── Big bang animation ── */
const BIG_BANG_DURATION = 2200; // ms
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

/* ── Component ── */
export default function KnowledgeGraph({ data, activeDomains, pages, handActive: handActiveProp, onHandActiveChange }: Props) {
  /* Build slug → ParsedPage map for preview lookup */
  const pageBySlug = useMemo(() => {
    const m = new Map<string, ParsedPage>();
    if (pages) for (const p of pages) m.set(p.slug, p);
    return m;
  }, [pages]);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef   = useRef<SVGGElement>(null);
  const router = useRouter();

  const [dims,        setDims]        = useState({ w: 800, h: 600 });
  const [zoomScale,   setZoomScale]   = useState(1);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [handActiveLocal, setHandActiveLocal] = useState(false);
  const handActive = handActiveProp ?? handActiveLocal;
  const setHandActive = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(handActive) : v;
    if (onHandActiveChange) onHandActiveChange(next);
    else setHandActiveLocal(next);
  }, [handActive, onHandActiveChange]);
  const [mounted,     setMounted]     = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

  /* Cube state refs (one path per cube) */
  const cubeRotRef    = useRef(CORE_CUBES.map(() => ({ rx: 0, ry: 0, rz: 0 })));
  const cubePathRefs  = useRef<(SVGPathElement | null)[]>(CORE_CUBES.map(() => null));

  /* Big bang animation */
  const bigBangStartRef = useRef<number>(0);
  const bigBangProgRef  = useRef<number>(0);
  const sphereShellRef  = useRef<SVGCircleElement | null>(null);
  const sphereAtmoRef   = useRef<SVGCircleElement | null>(null);
  const coreNebulaRef   = useRef<SVGGElement | null>(null);

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
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .filter((event) => {
        if (event.type === "wheel") return true;
        return false;
      })
      .on("zoom", (e) => {
        d3.select(gRef.current).attr("transform", e.transform.toString());
        setZoomScale(e.transform.k);
      });
    zoomBehaviorRef.current = zoom;
    d3.select(svgRef.current).call(zoom);
  }, []);

  /* Center view — animate back to identity (full sphere visible) */
  const centerView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(500)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
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
      const color = isSpinal ? domainColor
                   : isConceptual ? domainColor + "99"
                   : domainColor + "aa";  // sectional: more visible
      const baseOp = isSpinal ? 0.65 : isConceptual ? 0.50 : 0.55;  // sectional bumped 0.28 → 0.55
      out.push({
        e, sId, tId,
        isSpinal, isConceptual,
        color, baseOpacity: baseOp,
        strokeWidth: isSpinal ? 1.3 : isConceptual ? 0.9 : 1.0,  // sectional 0.7 → 1.0
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
  /* Bigger default — sphere fills most of viewport */
  const sphereR = Math.min(dims.w, dims.h) * (isNarrow ? 0.52 : 0.50);
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
    bigBangStartRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      /* Big bang progress */
      const elapsed = now - bigBangStartRef.current;
      const bbT = Math.min(1, elapsed / BIG_BANG_DURATION);
      const bbScale   = easeOutCubic(bbT);
      const bbOpacity = easeOutQuint(Math.min(1, bbT * 1.15));
      bigBangProgRef.current = bbT;

      /* Skip DOM updates when nothing is changing — big perf win on hover */
      const isStatic = bbT >= 1 && pausedRef.current && !dragRef.current;
      if (isStatic) {
        id = requestAnimationFrame(tick);
        return;
      }

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

      // Compute positions (apply big bang lerp from center)
      for (const node of filteredNodesRef.current) {
        const sp = sphericalPosRef.current.get(node.id);
        let x = cx, y = cy, depth = 0.5;
        if (sp && !sp.isCore) {
          const t = sp.theta - rot;
          const sinP = Math.sin(sp.phi);
          const nx = sinP * Math.cos(t);
          const ny = -Math.cos(sp.phi);
          const nz = sinP * Math.sin(t);
          x = cx + nx * sphereR * bbScale;
          y = cy + ny * sphereR * bbScale;
          depth = (nz + 1) / 2;
        }
        positions.set(node.id, { x, y, depth });
      }

      // Update node DOM
      for (const [nodeId, p] of positions) {
        const el = nodeElRefs.current.get(nodeId);
        if (!el) continue;
        // Slight scale ease-in for nodes during big bang
        const nodeScale = 0.4 + bbScale * 0.6;
        el.setAttribute("transform", `translate(${p.x},${p.y}) scale(${nodeScale})`);
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
        el.style.opacity = String(opacity * bbOpacity);
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
        const sc = (0.55 + p.depth * 0.45) * bbScale;
        galaxy.setAttribute("transform", `translate(${p.x},${p.y}) rotate(${tilt}) scale(${sc})`);
        galaxy.style.opacity = String((0.30 + p.depth * 0.70) * bbOpacity);
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
        line.style.opacity = String(opacity * bbOpacity);
      }

      // Update CORE CUBES (single path per cube — fast)
      for (let ci = 0; ci < CORE_CUBES.length; ci++) {
        const cube = CORE_CUBES[ci];
        const cRot = cubeRotRef.current[ci];
        if (!pausedRef.current && !dragRef.current) {
          cRot.rx += cube.rxSpeed;
          cRot.ry += cube.rySpeed;
          cRot.rz += cube.rzSpeed;
        }
        const effScale = cube.scale * bbScale;
        const projVerts = CUBE_VERTS.map(v => projectCubeVert(v, cRot.rx, cRot.ry, cRot.rz, effScale));
        const path = cubePathRefs.current[ci];
        if (!path) continue;
        path.setAttribute("d", cubePathD(projVerts, cx, cy));
        path.style.opacity = String(cube.opacity * bbOpacity);
      }

      // Sphere shell + atmosphere fade-in
      if (sphereShellRef.current) sphereShellRef.current.style.opacity = String(0.10 * bbOpacity);
      if (sphereAtmoRef.current)  sphereAtmoRef.current.style.opacity  = String(bbOpacity);
      if (coreNebulaRef.current)  coreNebulaRef.current.style.opacity  = String(bbOpacity);

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
  const onNodeEnter = useCallback((node: GraphNode) => {
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
  }, [filteredEdges]);

  const onNodeLeave = useCallback(() => {
    pausedRef.current = false;
    hoveredIdRef.current = null;
    neighborSetRef.current = new Set();
    setHoveredNode(null);
  }, []);

  /* ── Render ── */
  return (
    <div className="relative w-full h-full" style={{ background: handActive ? "transparent" : "#00000f" }}>
      <svg
        ref={svgRef} width="100%" height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: "grab", touchAction: "none", position: "relative", zIndex: 1, opacity: handActive ? 0.95 : 1, transition: "opacity 0.4s ease" }}
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

          {/* Strong blur for milky way haze — very soft falloff */}
          <filter id="mw-blur" x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="9" />
          </filter>

          {/* Deep space nebulae — multi-color cosmic backdrop */}
          <radialGradient id="nebula-1" gradientUnits="userSpaceOnUse"
            cx={cx} cy={cy} r={Math.min(dims.w, dims.h) * 0.62}>
            <stop offset="0%"   stopColor="#0d2860" stopOpacity="0.40" />
            <stop offset="40%"  stopColor="#060e30" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-2" gradientUnits="userSpaceOnUse"
            cx={dims.w * 0.85} cy={dims.h * 0.18} r={Math.min(dims.w, dims.h) * 0.38}>
            <stop offset="0%"   stopColor="#3a0a6e" stopOpacity="0.26" />
            <stop offset="50%"  stopColor="#1a0840" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-3" gradientUnits="userSpaceOnUse"
            cx={dims.w * 0.10} cy={dims.h * 0.82} r={Math.min(dims.w, dims.h) * 0.42}>
            <stop offset="0%"   stopColor="#0a4868" stopOpacity="0.22" />
            <stop offset="60%"  stopColor="#040820" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-4" gradientUnits="userSpaceOnUse"
            cx={dims.w * 0.92} cy={dims.h * 0.85} r={Math.min(dims.w, dims.h) * 0.30}>
            <stop offset="0%"   stopColor="#5a1845" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nebula-5" gradientUnits="userSpaceOnUse"
            cx={dims.w * 0.18} cy={dims.h * 0.12} r={Math.min(dims.w, dims.h) * 0.28}>
            <stop offset="0%"   stopColor="#1a2868" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>

          {/* Milky way — multi-layer gradients for depth */}
          <linearGradient id="milky-way" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#1a2058" stopOpacity="0" />
            <stop offset="20%"  stopColor="#1f2a68" stopOpacity="0.12" />
            <stop offset="42%"  stopColor="#2a3878" stopOpacity="0.22" />
            <stop offset="55%"  stopColor="#3848a0" stopOpacity="0.28" />
            <stop offset="68%"  stopColor="#2a3878" stopOpacity="0.22" />
            <stop offset="80%"  stopColor="#1f2a68" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1a2058" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="milky-way-bright" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="20%"  stopColor="#5060c8" stopOpacity="0" />
            <stop offset="40%"  stopColor="#7888d8" stopOpacity="0.18" />
            <stop offset="55%"  stopColor="#a0b0e8" stopOpacity="0.30" />
            <stop offset="70%"  stopColor="#7888d8" stopOpacity="0.18" />
            <stop offset="80%"  stopColor="#5060c8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="milky-way-warm" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="30%"  stopColor="#603858" stopOpacity="0" />
            <stop offset="50%"  stopColor="#a06090" stopOpacity="0.10" />
            <stop offset="70%"  stopColor="#603858" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="milky-dust" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="15%"  stopColor="#000005" stopOpacity="0" />
            <stop offset="50%"  stopColor="#000008" stopOpacity="0.45" />
            <stop offset="85%"  stopColor="#000005" stopOpacity="0" />
          </linearGradient>

          {/* Distant galaxy gradients */}
          <radialGradient id="far-gal-1" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#c8d8ff" stopOpacity="0.35" />
            <stop offset="35%"  stopColor="#5070c0" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000020" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="far-gal-2" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffd8b0" stopOpacity="0.30" />
            <stop offset="40%"  stopColor="#a07050" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#200810" stopOpacity="0" />
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

        {/* Deep space cosmic backdrop */}
        <rect width="100%" height="100%" fill="url(#dots)" />
        <rect width="100%" height="100%" fill="url(#nebula-3)" />
        <rect width="100%" height="100%" fill="url(#nebula-5)" />
        <rect width="100%" height="100%" fill="url(#nebula-2)" />
        <rect width="100%" height="100%" fill="url(#nebula-4)" />
        <rect width="100%" height="100%" fill="url(#nebula-1)" />

        {/* Milky way diagonal band — multi-layer + dense star cluster */}
        <g
          style={{ pointerEvents: "none" }}
          transform={`rotate(-22 ${dims.w * 0.5} ${dims.h * 0.5})`}
        >
          {(() => {
            const mwCx = dims.w * 0.5;
            const mwCy = dims.h * 0.5;
            const W = Math.max(dims.w, dims.h);
            const bandLen = W * 1.10;
            const halfL = bandLen / 2;
            const bandH = Math.min(dims.w, dims.h) * 0.16;   // outer width
            const innerH = Math.min(dims.w, dims.h) * 0.07;  // inner bright width
            const dustH = Math.min(dims.w, dims.h) * 0.020;  // dust lane
            return (
              <>
                {/* Haze layers — blurred + lower opacity to be subtle, not protagonist */}
                <g filter="url(#mw-blur)" opacity={0.55}>
                  <ellipse cx={mwCx} cy={mwCy} rx={halfL} ry={bandH * 1.4}
                    fill="url(#milky-way)" opacity={0.65} />
                  <ellipse cx={mwCx + W * 0.08} cy={mwCy - bandH * 0.15} rx={halfL * 0.7} ry={bandH * 0.85}
                    fill="url(#milky-way-warm)" opacity={0.6} />
                  <ellipse cx={mwCx} cy={mwCy} rx={halfL * 0.80} ry={innerH * 1.3}
                    fill="url(#milky-way-bright)" opacity={0.50} />
                  {/* Dust lane (slight darken) */}
                  <ellipse cx={mwCx} cy={mwCy + dustH * 1.5} rx={halfL * 0.70} ry={dustH * 1.3}
                    fill="url(#milky-dust)" opacity={0.55} />
                </g>
                {/* Star cluster — sharp, NO blur */}
                {MILKY_STARS.map((s, i) => (
                  <circle key={i}
                    cx={mwCx + s.bx * halfL * 0.92}
                    cy={mwCy + s.by * bandH * 1.4}
                    r={s.r}
                    fill={s.color}
                    opacity={s.o * 0.9}
                  />
                ))}
              </>
            );
          })()}
        </g>

        {/* Distant galaxies — small far-away cosmic objects */}
        <g style={{ pointerEvents: "none" }}>
          {/* Far galaxy 1 (blue spiral, top-left area) */}
          <g transform={`translate(${dims.w * 0.14} ${dims.h * 0.22}) rotate(35)`}>
            <ellipse rx={28} ry={9} fill="url(#far-gal-1)" />
            <ellipse rx={14} ry={4.5} fill="#a8c8ff" opacity={0.18} />
            <circle r={1.5} fill="#fff" opacity={0.55} />
          </g>
          {/* Far galaxy 2 (warm tone, bottom-right) */}
          <g transform={`translate(${dims.w * 0.82} ${dims.h * 0.78}) rotate(-15)`}>
            <ellipse rx={22} ry={7} fill="url(#far-gal-2)" />
            <ellipse rx={10} ry={3.2} fill="#ffd0a0" opacity={0.16} />
            <circle r={1.2} fill="#fff" opacity={0.48} />
          </g>
          {/* Far galaxy 3 (small blue, lower-left) */}
          <g transform={`translate(${dims.w * 0.06} ${dims.h * 0.55}) rotate(60)`}>
            <ellipse rx={14} ry={4} fill="url(#far-gal-1)" opacity={0.7} />
            <circle r={0.9} fill="#fff" opacity={0.40} />
          </g>
        </g>

        {/* Stars — multi-tier, multi-color */}
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill={s.color} opacity={s.o} />
        ))}

        {/* Twinkling featured stars */}
        {TWINKLE_STARS.map((s, i) => {
          const dur = 2.5 + (i % 5) * 0.7;
          const delay = (i % 7) * 0.5;
          return (
            <circle key={`tw-${i}`} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
              fill={s.color} opacity={s.o} filter="url(#glow-soft)">
              <animate attributeName="opacity"
                values={`${s.o};${s.o * 0.25};${s.o};${s.o * 0.5};${s.o}`}
                dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
              <animate attributeName="r"
                values={`${s.r};${s.r * 1.4};${s.r};${s.r * 1.2};${s.r}`}
                dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
            </circle>
          );
        })}

        {/* Shooting stars — streaks */}
        {SHOOTING_STARS.map((s, i) => {
          const sx = (s.x1 / 100) * dims.w;
          const sy = (s.y1 / 100) * dims.h;
          const ex = (s.x2 / 100) * dims.w;
          const ey = (s.y2 / 100) * dims.h;
          const len = 26;
          const dx = ex - sx;
          const dy = ey - sy;
          const ang = Math.atan2(dy, dx);
          const tailX = -Math.cos(ang) * len;
          const tailY = -Math.sin(ang) * len;
          return (
            <g key={`sh-${i}`} style={{ pointerEvents: "none" }}>
              <line x1={0} y1={0} x2={tailX} y2={tailY}
                stroke="#fff" strokeWidth={1.3}
                strokeLinecap="round"
                opacity={0}
                filter="url(#glow-soft)">
                <animate attributeName="opacity"
                  values="0;0;0.95;0.85;0"
                  keyTimes="0;0.45;0.50;0.62;0.72"
                  dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
                <animateTransform attributeName="transform" type="translate"
                  values={`${sx},${sy};${ex},${ey}`}
                  keyTimes="0;1"
                  dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
              </line>
            </g>
          );
        })}

        {/* Zoom group */}
        <g ref={gRef}>
          {/* Sphere shell + atmosphere — refs for big bang fade */}
          <circle ref={sphereAtmoRef} cx={cx} cy={cy} r={sphereR * 1.04}
            fill="url(#sphere-atmo)" pointerEvents="none" style={{ opacity: 0 }} />
          <circle ref={sphereShellRef} cx={cx} cy={cy} r={sphereR}
            fill="none" stroke="#1a3060" strokeWidth={0.5}
            strokeOpacity={1} strokeDasharray="2 14" style={{ opacity: 0 }} />

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
                  <ellipse rx={240} ry={108} fill={`url(#gneb-${dom})`} opacity={0.5} />
                  <ellipse rx={170} ry={78}  fill={`url(#gneb-${dom})`} opacity={0.55} />
                  <ellipse rx={100} ry={46}  fill={`url(#gneb-${dom})`} opacity={0.6} />
                  <g style={{
                    animation: `spin ${speed}s linear infinite ${dom === "personal" || dom === "business" ? "reverse" : ""}`,
                    transformOrigin: "0 0",
                  }}>
                    {dots.map((d, i) => {
                      let fill: string;
                      switch (d.layer) {
                        case "bulge":   fill = starColorSection(d.starType, color); break;
                        case "hotspot": fill = "#c8e0ff"; break; // hot blue HII regions
                        case "arm":     fill = starColorSection(d.starType, color); break;
                        case "dust":    fill = `${color}10`; break;
                        default:        fill = `${color}80`; break;
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

          {/* CORE — backdrop nebula glow + multi-cube structure */}
          <g ref={coreNebulaRef} style={{ pointerEvents: "none" }}>
            {/* Reduced nebula backdrop (atmospheric glow behind cubes) */}
            <g transform={`translate(${cx},${cy})`}>
              <ellipse rx={290} ry={125} fill="url(#gneb-core-outer)" opacity={0.5} />
              <ellipse rx={210} ry={92}  fill="url(#gneb-core-inner)" opacity={0.55} />
              <ellipse rx={130} ry={58}  fill="url(#gneb-core-inner)" opacity={0.45} />
              <ellipse rx={65}  ry={28}  fill="url(#gneb-core-inner)" opacity={0.40} />
              <g style={{ animation: `spin ${CORE_ROTATION_SPEED}s linear infinite`, transformOrigin: "0 0", opacity: 0.55 }}>
                {CORE_GALAXY.map((d, i) => {
                  let fill: string;
                  switch (d.layer) {
                    case "bulge":   fill = starColorCore(d.starType); break;
                    case "hotspot": fill = "#a0d4ff"; break;
                    case "arm":     fill = starColorCore(d.starType); break;
                    case "dust":    fill = "#080f24"; break;
                    default:        fill = "#3868a0"; break;
                  }
                  return (
                    <circle key={i} cx={d.x} cy={d.y} r={d.r}
                      fill={fill} opacity={d.o * 0.7}
                      filter={d.layer === "hotspot" ? "url(#glow-soft)" : undefined} />
                  );
                })}
              </g>
            </g>

            {/* Multi-cube structure — 4 nested cubes, single path each */}
            {CORE_CUBES.map((cube, ci) => (
              <path
                key={`cube-${ci}`}
                ref={(el) => { cubePathRefs.current[ci] = el; }}
                d=""
                fill="none"
                stroke={cube.color}
                strokeWidth={cube.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={ci >= 2 ? "url(#glow-soft)" : undefined}
                style={{ opacity: 0 }}
              />
            ))}

            {/* Innermost glowing core point */}
            <circle cx={cx} cy={cy} r={4} fill="#fff"
              filter="url(#glow-strong)" opacity={0.95}>
              <animate attributeName="r" values="3.5;5;3.5" dur="3.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;1;0.85" dur="3.5s" repeatCount="indefinite" />
            </circle>
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
              /* Core visual = cubes (rendered separately). Keep <g> for click/hover only. */
              return (
                <g key={node.id}
                  data-node="1"
                  ref={(el) => {
                    if (el) nodeElRefs.current.set(node.id, el);
                    else    nodeElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => onNodeEnter(node)}
                  onMouseLeave={onNodeLeave}
                  onClick={(e) => { router.push("/wiki/index"); e.stopPropagation(); }}
                >
                  {/* Invisible click target sized for cubes */}
                  <circle r={38} fill="transparent" pointerEvents="all" />
                  {/* Hover ring around cubes */}
                  {isHovered && (
                    <circle r={44} fill="none" stroke="#a8d0ff" strokeWidth={0.8}
                      strokeOpacity={0.55} strokeDasharray="4 6" />
                  )}
                  {showLabel && (
                    <text textAnchor="middle" y={56}
                      fontSize={13} fontWeight={700}
                      letterSpacing="0.18em"
                      fill={isHovered ? "#fff" : "#a8d0ff"}
                      style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" }}
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
              /* Section = nested wireframe spheres (3 layers, like core cubes but spheres) */
              const tilt = SEC_TILT_ANGLES[dom] ?? 0;
              return (
                <g key={node.id}
                  data-node="1"
                  ref={(el) => {
                    if (el) nodeElRefs.current.set(node.id, el);
                    else    nodeElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => onNodeEnter(node)}
                  onMouseLeave={onNodeLeave}
                  onClick={(e) => { router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
                >
                  {/* Hover halo */}
                  {isHovered && (
                    <circle r={r + 14} fill={color} opacity={0.10} style={{ pointerEvents: "none" }} />
                  )}
                  {/* Invisible click target covering full sphere */}
                  <circle r={r + 7} fill="transparent" pointerEvents="all" />
                  {/* Static rotation tilt for 3D feel */}
                  <g transform={`rotate(${tilt})`} style={{ pointerEvents: "none" }}>
                    {/* Outer wireframe sphere — dim, large */}
                    <circle r={r + 7} fill="none" stroke={color}
                      strokeWidth={0.4} strokeOpacity={isHovered ? 0.40 : 0.22} />
                    <ellipse rx={r + 7} ry={(r + 7) * 0.32} fill="none" stroke={color}
                      strokeWidth={0.4} strokeOpacity={isHovered ? 0.50 : 0.28} />
                    <ellipse rx={(r + 7) * 0.32} ry={r + 7} fill="none" stroke={color}
                      strokeWidth={0.4} strokeOpacity={isHovered ? 0.40 : 0.20} />

                    {/* Mid wireframe sphere */}
                    <circle r={r + 2.5} fill="none" stroke={color}
                      strokeWidth={0.7} strokeOpacity={isHovered ? 0.85 : 0.55} />
                    <ellipse rx={r + 2.5} ry={(r + 2.5) * 0.34} fill="none" stroke={color}
                      strokeWidth={0.7} strokeOpacity={isHovered ? 0.85 : 0.60} />

                    {/* Inner wireframe sphere — bright */}
                    <circle r={r * 0.78} fill="none" stroke={color}
                      strokeWidth={0.9} strokeOpacity={0.95}
                      filter={isHovered ? "url(#glow-strong)" : "url(#glow-soft)"} />
                    <ellipse rx={r * 0.78} ry={r * 0.26} fill="none" stroke={color}
                      strokeWidth={0.9} strokeOpacity={0.95}
                      filter={isHovered ? "url(#glow-strong)" : "url(#glow-soft)"} />

                    {/* Solid bright core */}
                    <circle r={r * 0.36} fill={color} filter="url(#glow)" />
                    <circle r={r * 0.16} fill="#fff" opacity={0.92} />
                  </g>
                  {showLabel && (
                    <text textAnchor="middle" y={r + 18}
                      fontSize={Math.max(9, 11 / zoomScale + 2)} fontWeight={600}
                      letterSpacing="0.06em"
                      fill={isHovered ? "#fff" : color}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {node.label}
                    </text>
                  )}
                </g>
              );
            }

            // LEAF / GHOST — wireframe sphere/planet aesthetic
            const color = cls === "ghost" ? "#27272a" : leafColor(node);
            const highlighted = isHovered || isNeighbor;
            /* Deterministic tilt per leaf for visual variety (not random per render) */
            const leafTilt = ((node.id.length * 17) % 60) - 30;

            if (node.broken) {
              return (
                <g key={node.id}
                  data-node="1"
                  ref={(el) => {
                    if (el) nodeElRefs.current.set(node.id, el);
                    else    nodeElRefs.current.delete(node.id);
                  }}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: "default" }}
                  onMouseEnter={() => onNodeEnter(node)}
                  onMouseLeave={onNodeLeave}
                >
                  <circle r={r + 2} fill="transparent" pointerEvents="all" />
                  <circle r={r} fill="none" stroke={color}
                    strokeWidth={0.8} strokeOpacity={0.30}
                    strokeDasharray="3 2" />
                </g>
              );
            }

            return (
              <g key={node.id}
                data-node="1"
                ref={(el) => {
                  if (el) nodeElRefs.current.set(node.id, el);
                  else    nodeElRefs.current.delete(node.id);
                }}
                transform={`translate(${cx},${cy})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => onNodeEnter(node)}
                onMouseLeave={onNodeLeave}
                onClick={(e) => { router.push(`/wiki/${node.id}`); e.stopPropagation(); }}
              >
                {/* Hover halo */}
                {isHovered && (
                  <circle r={r + 10} fill={color} opacity={0.10} style={{ pointerEvents: "none" }} />
                )}
                {/* Invisible click target */}
                <circle r={r + 4} fill="transparent" pointerEvents="all" />
                {/* Wireframe sphere with tilted equator/meridian */}
                <g transform={`rotate(${leafTilt})`} style={{ pointerEvents: "none" }}>
                  {/* Outer faint ring */}
                  <circle r={r + 1.5} fill="none" stroke={color}
                    strokeWidth={0.4}
                    strokeOpacity={highlighted ? 0.55 : 0.25} />
                  {/* Equatorial ellipse (3D feel) */}
                  <ellipse rx={r + 1} ry={(r + 1) * 0.30} fill="none" stroke={color}
                    strokeWidth={0.55}
                    strokeOpacity={highlighted ? 0.85 : 0.50} />
                  {/* Solid inner sphere (the planet) */}
                  <circle r={r * 0.62} fill={color}
                    fillOpacity={highlighted ? 1 : 0.85}
                    filter={isHovered ? "url(#glow-strong)" : isNeighbor ? "url(#glow)" : "url(#glow-soft)"} />
                  {/* Bright highlight (shine) */}
                  <circle cx={-r * 0.20} cy={-r * 0.22} r={r * 0.22}
                    fill="#fff" opacity={highlighted ? 0.75 : 0.55} />
                </g>
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

      <NodePreviewPanel
        node={hoveredNode}
        page={hoveredNode ? pageBySlug.get(hoveredNode.id) ?? null : null}
      />

      {/* Hand tracking overlay (video stays here, behind SVG via z-index) */}
      <HandTracking
        active={handActive}
        svgRef={svgRef}
        onClose={() => setHandActive(false)}
      />

      {/* Buttons portaled to body to escape nav/footer stacking context */}
      {mounted && createPortal(<>
      <button
        onClick={centerView}
        title="Center view (reset zoom)"
        style={{
          position: "fixed",
          bottom: 60,
          left: 24,
          zIndex: 9999,
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(2,4,10,0.85)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 5,
          color: "#a1a1aa",
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          transition: "all 0.15s",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(79,156,249,0.45)";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.background = "rgba(79,156,249,0.10)";
          e.currentTarget.style.boxShadow = "0 0 0 1px rgba(79,156,249,0.20), 0 0 18px rgba(79,156,249,0.18), 0 8px 24px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
          e.currentTarget.style.color = "#a1a1aa";
          e.currentTarget.style.background = "rgba(2,4,10,0.85)";
          e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)";
        }}
      >
        {/* Crosshair / center icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="6" />
          <line x1="12" y1="2"  x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2"  y1="12" x2="5"  y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {/* Hand-tracking toggle button (above center button) */}
      <button
        onClick={() => setHandActive((v) => !v)}
        title={handActive ? "Disable hand tracking" : "Enable hand tracking"}
        style={{
          position: "fixed",
          bottom: 108,
          left: 24,
          zIndex: 9999,
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: handActive ? "rgba(79,156,249,0.18)" : "rgba(2,4,10,0.85)",
          border: handActive ? "1px solid rgba(79,156,249,0.55)" : "1px solid rgba(255,255,255,0.10)",
          borderRadius: 5,
          color: handActive ? "#4f9cf9" : "#a1a1aa",
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          transition: "all 0.15s",
          boxShadow: handActive
            ? "0 0 0 1px rgba(79,156,249,0.30), 0 0 22px rgba(79,156,249,0.30), 0 8px 24px rgba(0,0,0,0.6)"
            : "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)",
        }}
        onMouseEnter={(e) => {
          if (handActive) return;
          e.currentTarget.style.borderColor = "rgba(79,156,249,0.45)";
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.background = "rgba(79,156,249,0.10)";
          e.currentTarget.style.boxShadow = "0 0 0 1px rgba(79,156,249,0.20), 0 0 18px rgba(79,156,249,0.18), 0 8px 24px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          if (handActive) return;
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
          e.currentTarget.style.color = "#a1a1aa";
          e.currentTarget.style.background = "rgba(2,4,10,0.85)";
          e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.6)";
        }}
      >
        {/* Hand icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
          <path d="M12 11V4.5a1.5 1.5 0 1 1 3 0V11" />
          <path d="M15 11V6.5a1.5 1.5 0 1 1 3 0V13" />
          <path d="M9 11V8.5a1.5 1.5 0 1 0-3 0v6.2c0 2.7 2 5.3 5 6.3 1.5.5 3 .5 4.5 0 2.4-.8 4.5-3 4.5-6.3V11" />
        </svg>
      </button>

      </>, document.body)}
    </div>
  );
}
