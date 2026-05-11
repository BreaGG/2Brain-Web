"use client";

import { useMemo, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ParsedPage } from "@/lib/types";

interface Props {
  pages: ParsedPage[];
  linkDegrees: Map<string, number>;
  activeDomains: Set<string>;
}

const TYPE_COLORS: Record<string, string> = {
  concept:          "#4f9cf9",
  person:           "#4ade80",
  "source-summary": "#facc15",
  synthesis:        "#c084fc",
};

// ── Heat color ramp ────────────────────────────────────────────────────────
const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0.0,  [12, 14, 30]],
  [0.15, [30, 58, 138]],
  [0.32, [37, 99, 235]],
  [0.5,  [16, 185, 129]],
  [0.68, [250, 204, 21]],
  [0.84, [249, 115, 22]],
  [1.0,  [239, 68, 68]],
];

function heatRGB(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [a, ca] = HEAT_STOPS[i];
    const [b, cb] = HEAT_STOPS[i + 1];
    if (x >= a && x <= b) {
      const k = (x - a) / (b - a);
      return [
        ca[0] + (cb[0] - ca[0]) * k,
        ca[1] + (cb[1] - ca[1]) * k,
        ca[2] + (cb[2] - ca[2]) * k,
      ];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

function heatHex(t: number): string {
  const [r, g, b] = heatRGB(t);
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// ── Activity score ─────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 9999;
  return Math.max(0, (Date.now() - d.getTime()) / 86400000);
}
function recencyScore(d: string): number {
  return Math.exp(-daysSince(d) / 120);
}

// ── Spiral grid placement ──────────────────────────────────────────────────
function spiralCoords(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (n === 0) return out;
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < n; i++) {
    out.push([x, y]);
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      [dx, dy] = [-dy, dx];
    }
    x += dx; y += dy;
  }
  return out;
}

// ── Scored notes ───────────────────────────────────────────────────────────
interface PeakData {
  page: ParsedPage;
  score: number;
  degree: number;
  worldX: number;   // x position on terrain
  worldZ: number;   // z position on terrain
  height: number;   // peak height
  sigma: number;    // gaussian radius
}

// Terrain config
const TERRAIN_SIZE = 60;        // world units (x and z extents = ±30)
const TERRAIN_SEGMENTS = 140;   // resolution of heightfield
const PEAK_SPACING = 3.2;       // distance between spiral cells
const MAX_HEIGHT = 6.5;
const PEAK_SIGMA = 1.6;         // gaussian radius

// ── Terrain mesh component ─────────────────────────────────────────────────
function Terrain({ peaks }: { peaks: PeakData[] }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS
    );
    g.rotateX(-Math.PI / 2); // make XZ plane (y up)

    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      let h = 0;
      // Sum gaussian contributions from all peaks
      for (const pk of peaks) {
        const dx = px - pk.worldX;
        const dz = pz - pk.worldZ;
        const r2 = dx * dx + dz * dz;
        const sig2 = pk.sigma * pk.sigma;
        h += pk.height * Math.exp(-r2 / (2 * sig2));
      }
      pos.setY(i, h);

      // Vertex color: score by height fraction
      const t = Math.min(1, h / MAX_HEIGHT);
      const [r, gn, b] = heatRGB(t);
      // Floor color when essentially flat
      const floorMix = Math.min(1, h / 0.4);
      const fr = 14 + (r - 14) * floorMix;
      const fg = 16 + (gn - 16) * floorMix;
      const fb = 34 + (b - 34) * floorMix;
      colors[i * 3]     = fr / 255;
      colors[i * 3 + 1] = fg / 255;
      colors[i * 3 + 2] = fb / 255;
    }

    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [peaks]);

  return (
    <mesh geometry={geom} receiveShadow castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.85}
        metalness={0.05}
        flatShading={false}
      />
    </mesh>
  );
}

// ── Peak marker (clickable sphere at top of each mountain) ────────────────
function PeakMarker({
  peak,
  hovered,
  setHovered,
  onClick,
}: {
  peak: PeakData;
  hovered: boolean;
  setHovered: (s: string | null) => void;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const color = heatHex(peak.score);
  const typeColor = TYPE_COLORS[peak.page.type] ?? "#71717a";
  const size = 0.28 + peak.score * 0.32;

  useFrame((state) => {
    if (!ref.current) return;
    // Gentle pulse on hottest peaks
    const pulse = peak.score > 0.6
      ? 1 + Math.sin(state.clock.elapsedTime * 2 + peak.worldX) * 0.05
      : 1;
    const target = hovered ? 1.5 : pulse;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.18);
  });

  return (
    <group position={[peak.worldX, peak.height + 0.15, peak.worldZ]}>
      <mesh
        ref={ref}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(peak.page.slug); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(null); document.body.style.cursor = "default"; }}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <sphereGeometry args={[size, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.4 : 0.6}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
      {/* Type-color halo ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <ringGeometry args={[size * 1.4, size * 1.8, 24]} />
        <meshBasicMaterial color={typeColor} transparent opacity={hovered ? 0.9 : 0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Scene wrapper ──────────────────────────────────────────────────────────
function Scene({
  peaks,
  hoveredSlug,
  setHoveredSlug,
  onPeakClick,
}: {
  peaks: PeakData[];
  hoveredSlug: string | null;
  setHoveredSlug: (s: string | null) => void;
  onPeakClick: (slug: string) => void;
}) {
  const hoveredPeak = peaks.find((p) => p.page.slug === hoveredSlug);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.35} color="#a0b4cc" />
      <directionalLight
        position={[18, 26, 14]}
        intensity={1.3}
        color="#ffd4a0"
        castShadow
      />
      <directionalLight position={[-10, 12, -10]} intensity={0.35} color="#5070aa" />
      <pointLight position={[0, 12, 0]} intensity={0.4} color="#facc15" distance={40} />

      {/* Fog for depth */}
      <fog attach="fog" args={["#0a0a16", 35, 90]} />

      {/* Terrain */}
      <Terrain peaks={peaks} />

      {/* Peak markers */}
      {peaks.map((pk) => (
        <PeakMarker
          key={pk.page.slug}
          peak={pk}
          hovered={hoveredSlug === pk.page.slug}
          setHovered={setHoveredSlug}
          onClick={() => onPeakClick(pk.page.slug)}
        />
      ))}

      {/* Tooltip */}
      {hoveredPeak && (
        <Html
          position={[hoveredPeak.worldX, hoveredPeak.height + 1.3, hoveredPeak.worldZ]}
          center
          distanceFactor={10}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "rgba(8,8,18,0.92)",
            border: `1px solid ${heatHex(hoveredPeak.score)}66`,
            borderRadius: 5,
            padding: "8px 12px",
            color: "#fafafa",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            backdropFilter: "blur(8px)",
            boxShadow: `0 6px 24px rgba(0,0,0,0.5), 0 0 18px ${heatHex(hoveredPeak.score)}44`,
            fontFamily: "system-ui, sans-serif",
            minWidth: 140,
          }}>
            <div style={{ marginBottom: 4 }}>{hoveredPeak.page.title}</div>
            <div style={{
              fontSize: 9, color: "#a1a1aa",
              fontFamily: "monospace", letterSpacing: "0.08em",
              display: "flex", gap: 8,
            }}>
              <span style={{ color: TYPE_COLORS[hoveredPeak.page.type] ?? "#71717a" }}>
                {hoveredPeak.page.type.toUpperCase()}
              </span>
              <span>·</span>
              <span>↔{hoveredPeak.degree}</span>
              <span>·</span>
              <span style={{ color: heatHex(hoveredPeak.score) }}>
                {Math.round(hoveredPeak.score * 100)}%
              </span>
            </div>
          </div>
        </Html>
      )}

      {/* Orbit controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={12}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1, 0]}
      />
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Heatmap({ pages, linkDegrees, activeDomains }: Props) {
  const router = useRouter();
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  const { peaks, stats } = useMemo(() => {
    const filtered = activeDomains.size === 0
      ? pages
      : pages.filter((p) => p.domain.some((d) => activeDomains.has(d)));

    // Raw scores
    type Raw = { page: ParsedPage; raw: number; degree: number };
    const rawList: Raw[] = filtered.map((p) => {
      const degree = linkDegrees.get(p.slug) ?? 0;
      const sources = p.sources.length;
      const recency = recencyScore(p.lastUpdated);
      const raw = degree * 0.55 + sources * 0.25 + recency * 4 * 0.20;
      return { page: p, raw, degree };
    });

    // Sort desc → hottest first → placed at spiral center
    rawList.sort((a, b) => b.raw - a.raw);

    const max = Math.max(1, ...rawList.map((r) => r.raw));
    const spiral = spiralCoords(rawList.length);

    const peaks: PeakData[] = rawList.map((r, i) => {
      const score = r.raw / max;
      const [gx, gy] = spiral[i];
      return {
        page: r.page,
        score,
        degree: r.degree,
        worldX: gx * PEAK_SPACING,
        worldZ: gy * PEAK_SPACING,
        height: 0.4 + score * MAX_HEIGHT,
        sigma: PEAK_SIGMA * (0.7 + score * 0.5),
      };
    });

    const totalDegree = rawList.reduce((acc, s) => acc + s.degree, 0);
    const avgScore = peaks.length
      ? peaks.reduce((acc, p) => acc + p.score, 0) / peaks.length
      : 0;
    const hot = peaks.filter((p) => p.score >= 0.66).length;
    const cold = peaks.filter((p) => p.score < 0.2).length;

    return { peaks, stats: { totalDegree, avgScore, hot, cold, total: peaks.length } };
  }, [pages, linkDegrees, activeDomains]);

  return (
    <div
      data-heatmap-root="1"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      {/* Top header strip */}
      <header style={{
        flexShrink: 0,
        padding: "18px 28px 12px",
        zIndex: 2,
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, color: "#facc15",
            letterSpacing: "0.18em", fontFamily: "monospace",
            fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.85)",
          }}>
            ◉ MODO CARTA TÉRMICA · 3D
          </span>
          <span style={{
            fontSize: 9, color: "#71717a",
            fontFamily: "monospace", letterSpacing: "0.1em",
            textShadow: "0 1px 3px rgba(0,0,0,0.85)",
          }}>
            TERRAIN · {stats.total} PEAKS · DRAG TO ORBIT · SCROLL TO ZOOM
          </span>
        </div>
        <p style={{
          color: "#a1a1aa", fontSize: 12, maxWidth: 720, lineHeight: 1.5,
          textShadow: "0 1px 3px rgba(0,0,0,0.85)",
        }}>
          Cada montaña es una nota. Altura y color = actividad (links · sources · recencia).
          Pico central = nota más activa del vault.
        </p>
      </header>

      {/* 3D canvas */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <Canvas
          shadows
          camera={{ position: [22, 18, 26], fov: 45, near: 0.1, far: 200 }}
          style={{ background: "linear-gradient(180deg, #06060f 0%, #0a0a18 60%, #14142a 100%)" }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <Scene
              peaks={peaks}
              hoveredSlug={hoveredSlug}
              setHoveredSlug={setHoveredSlug}
              onPeakClick={(slug) => router.push(`/wiki/${slug}`)}
            />
          </Suspense>
        </Canvas>

        {/* Stats overlay (bottom-left) */}
        <div style={{
          position: "absolute", bottom: 18, left: 24,
          display: "flex", gap: 0,
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 5,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          overflow: "hidden",
          pointerEvents: "none",
        }}>
          <StatCell label="HOT"        value={stats.hot}       accent="#f97316" />
          <StatCell label="COLD"       value={stats.cold}      accent="#3b82f6" />
          <StatCell label="LINKS"      value={stats.totalDegree} accent="#a1a1aa" />
          <StatCell label="AVG"        value={`${(stats.avgScore * 100).toFixed(0)}%`} accent="#facc15" last />
        </div>

        {/* Legend (bottom-right) */}
        <div style={{
          position: "absolute", bottom: 22, right: 24,
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 9, color: "#a1a1aa",
          fontFamily: "monospace", letterSpacing: "0.12em",
          padding: "8px 14px",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 5,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          pointerEvents: "none",
        }}>
          <span>COLD</span>
          <div style={{
            width: 140, height: 6, borderRadius: 3,
            background: "linear-gradient(90deg, rgb(12,14,30), rgb(30,58,138), rgb(37,99,235), rgb(16,185,129), rgb(250,204,21), rgb(249,115,22), rgb(239,68,68))",
            border: "1px solid rgba(255,255,255,0.08)",
          }} />
          <span>HOT</span>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label, value, accent, last,
}: { label: string; value: number | string; accent: string; last?: boolean }) {
  return (
    <div style={{
      padding: "9px 16px",
      borderRight: last ? "none" : "1px solid rgba(255,255,255,0.05)",
      display: "flex", flexDirection: "column", gap: 2, minWidth: 70,
    }}>
      <span style={{
        fontSize: 8, color: "#52525b",
        fontFamily: "monospace", letterSpacing: "0.18em",
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 15, fontWeight: 700, color: accent,
        fontFamily: "monospace", letterSpacing: "-0.01em",
        lineHeight: 1,
      }}>
        {value}
      </span>
    </div>
  );
}
