"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceRadial,
} from "d3-force-3d";
import type { GraphData, GraphNode, GraphEdge, ParsedPage } from "@/lib/types";
import NodePreviewPanel from "./NodePreviewPanel";

interface Props {
  data: GraphData;
  activeDomains: Set<string>;
  pages?: ParsedPage[];
}

// ── Color palette ─────────────────────────────────────────────────────────
const DOMAIN_GLOW: Record<string, [number, number, number]> = {
  research: [0.45, 0.70, 1.00],
  reading:  [0.85, 0.55, 1.00],
  business: [0.40, 0.95, 0.85],
  personal: [1.00, 0.55, 0.85],
};
const TYPE_GLOW: Record<string, [number, number, number]> = {
  concept:          [0.55, 0.80, 1.00],
  person:           [0.50, 0.95, 0.85],
  "source-summary": [0.92, 0.78, 1.00],
  synthesis:        [0.85, 0.60, 1.00],
  ghost:            [0.30, 0.35, 0.55],
  meta:             [0.65, 0.70, 0.95],
  page:             [0.65, 0.70, 0.95],
};
function nodeColor(node: GraphNode): THREE.Color {
  if (node.broken) return new THREE.Color(...TYPE_GLOW.ghost);
  const dom = node.domain[0];
  const rgb = (dom && DOMAIN_GLOW[dom]) || TYPE_GLOW[node.type] || TYPE_GLOW.page;
  return new THREE.Color(...rgb);
}

type NodeClass = "core" | "section" | "leaf" | "ghost";
function nodeClass(id: string, broken?: boolean): NodeClass {
  if (broken) return "ghost";
  if (id === "index") return "core";
  if (id.endsWith("/index")) return "section";
  return "leaf";
}
function nodeRadius(node: GraphNode): number {
  const cls = nodeClass(node.id, node.broken);
  if (cls === "core")    return 1.65;
  if (cls === "section") return 0.85 + Math.log(node.degree + 1) * 0.12;
  return 0.30 + Math.log(node.degree + 1) * 0.22;
}

// ── 3D force layout ───────────────────────────────────────────────────────
interface Sim { positions: Map<string, THREE.Vector3>; }
function buildLayout(data: GraphData): Sim {
  const DOMAINS = ["research", "reading", "business", "personal"];
  const CLUSTER_RADIUS = 14;
  const clusterCenters: Record<string, THREE.Vector3> = {};
  DOMAINS.forEach((d, i) => {
    const theta = (i / DOMAINS.length) * Math.PI * 2;
    const phi = (i % 2 === 0 ? -1 : 1) * 0.35;
    clusterCenters[d] = new THREE.Vector3(
      Math.cos(theta) * CLUSTER_RADIUS,
      Math.sin(phi) * 6,
      Math.sin(theta) * CLUSTER_RADIUS
    );
  });

  const simNodes = data.nodes.map((n) => {
    const cls = nodeClass(n.id, n.broken);
    if (cls === "core") return { id: n.id, x: 0, y: 0, z: 0 };
    const dom = n.domain[0];
    const center = clusterCenters[dom] ?? new THREE.Vector3(
      (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 18
    );
    return {
      id: n.id,
      x: center.x + (Math.random() - 0.5) * 6,
      y: center.y + (Math.random() - 0.5) * 4,
      z: center.z + (Math.random() - 0.5) * 6,
    };
  });
  const simLinks = data.edges.map((e) => ({
    source: typeof e.source === "string" ? e.source : e.source.id,
    target: typeof e.target === "string" ? e.target : e.target.id,
  }));

  const sim = forceSimulation(simNodes, 3)
    .force("charge", forceManyBody().strength(-22))
    .force("link", forceLink(simLinks).id((d: { id: string }) => d.id).distance(3.2).strength(0.45))
    .force("center", forceCenter(0, 0, 0).strength(0.04))
    .force("radial", forceRadial(0, 0, 0, 0).strength(0.012))
    .stop();
  for (let i = 0; i < 220; i++) sim.tick();

  const positions = new Map<string, THREE.Vector3>();
  for (const sn of simNodes as Array<{ id: string; x: number; y: number; z: number }>) {
    positions.set(sn.id, new THREE.Vector3(sn.x, sn.y, sn.z));
  }
  return { positions };
}

// ── Glow sprite ───────────────────────────────────────────────────────────
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,    "rgba(255,255,255,1)");
  grad.addColorStop(0.3,  "rgba(255,255,255,0.6)");
  grad.addColorStop(0.55, "rgba(180,200,255,0.18)");
  grad.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Starfield ─────────────────────────────────────────────────────────────
function StarField({ count = 3200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 70 + Math.random() * 180;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const tint = Math.random();
      let cR, cG, cB;
      if (tint < 0.7)      { cR = 0.75 + Math.random() * 0.25; cG = 0.85 + Math.random() * 0.15; cB = 1.0; }
      else if (tint < 0.88){ cR = 0.7 + Math.random() * 0.25;  cG = 0.55 + Math.random() * 0.2;  cB = 1.0; }
      else                 { cR = 1.0; cG = 0.5 + Math.random() * 0.2; cB = 0.85 + Math.random() * 0.15; }
      colors[i * 3]     = cR; colors[i * 3 + 1] = cG; colors[i * 3 + 2] = cB;
      sizes[i] = 0.25 + Math.random() * 1.4;
    }
    return { positions, colors, sizes };
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.008;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.02) * 0.05;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-color"    args={[colors, 3]}    count={count} />
        <bufferAttribute attach="attributes-size"     args={[sizes, 1]}     count={count} />
      </bufferGeometry>
      <shaderMaterial
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float size; attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (260.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }`}
        fragmentShader={`
          varying vec3 vColor;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d);
            a = pow(a, 2.4);
            gl_FragColor = vec4(vColor, a);
          }`}
      />
    </points>
  );
}

// ── Volumetric dust (close drifting particles) ────────────────────────────
function Dust({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    const phases    = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
      const tint = Math.random();
      if (tint < 0.5)      { colors[i * 3] = 0.55; colors[i * 3 + 1] = 0.72; colors[i * 3 + 2] = 1.0; }
      else if (tint < 0.8) { colors[i * 3] = 0.85; colors[i * 3 + 1] = 0.6;  colors[i * 3 + 2] = 1.0; }
      else                 { colors[i * 3] = 1.0;  colors[i * 3 + 1] = 0.6;  colors[i * 3 + 2] = 0.85; }
      sizes[i]  = 0.4 + Math.random() * 0.9;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colors, sizes, phases };
  }, [count]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((s) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y = s.clock.elapsedTime * 0.012;
      ref.current.position.y = Math.sin(s.clock.elapsedTime * 0.06) * 0.5;
    }
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-color"    args={[colors, 3]}    count={count} />
        <bufferAttribute attach="attributes-size"     args={[sizes, 1]}     count={count} />
        <bufferAttribute attach="attributes-phase"    args={[phases, 1]}    count={count} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute float size; attribute float phase; attribute vec3 color;
          varying vec3 vColor; varying float vTw;
          uniform float uTime;
          void main() {
            vColor = color;
            vTw = 0.4 + 0.6 * sin(uTime * 1.1 + phase);
            vec3 p = position;
            p.y += sin(uTime * 0.3 + phase) * 0.4;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = size * (200.0 / -mvPosition.z) * vTw;
            gl_Position = projectionMatrix * mvPosition;
          }`}
        fragmentShader={`
          varying vec3 vColor; varying float vTw;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d);
            a = pow(a, 2.4) * vTw * 0.6;
            gl_FragColor = vec4(vColor, a);
          }`}
      />
    </points>
  );
}

// ── Nebula ────────────────────────────────────────────────────────────────
function Nebula() {
  const tex = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0,    "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(180,200,255,0.6)");
    grad.addColorStop(0.55, "rgba(120,90,220,0.18)");
    grad.addColorStop(1,    "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(canvas);
    t.needsUpdate = true;
    return t;
  }, []);
  const clouds = useMemo(() => [
    { pos: [-25, -6,  18] as const, scale: 60, color: [0.45, 0.55, 1.00] as const, rot: 0.2 },
    { pos: [ 28,  4, -22] as const, scale: 70, color: [0.75, 0.50, 1.00] as const, rot: -0.3 },
    { pos: [  6, 12,  -8] as const, scale: 45, color: [0.95, 0.55, 0.85] as const, rot: 0.7 },
    { pos: [-12, -10,-20] as const, scale: 55, color: [0.40, 0.85, 1.00] as const, rot: -0.5 },
  ], []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.z = clouds[i].rot + clock.elapsedTime * 0.005 * (i % 2 ? 1 : -1);
    });
  });
  return (
    <>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.pos as unknown as [number, number, number]} ref={(el) => { refs.current[i] = el; }}>
          <planeGeometry args={[c.scale, c.scale]} />
          <meshBasicMaterial
            map={tex} color={new THREE.Color(...c.color)}
            transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </>
  );
}

// ── Galaxy Core: holographic cube cluster ─────────────────────────────────
function CoreOrbitalParticles({ count = 36 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    const phases    = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 1.9 + Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const tint = Math.random();
      if (tint < 0.55) { colors[i * 3] = 0.85; colors[i * 3 + 1] = 0.6;  colors[i * 3 + 2] = 1.0; } // violet
      else if (tint < 0.85) { colors[i * 3] = 0.45; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0; } // cyan
      else { colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0; }
      sizes[i] = 0.8 + Math.random() * 1.2;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colors, sizes, phases };
  }, [count]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((s) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y = s.clock.elapsedTime * 0.35;
      ref.current.rotation.x = s.clock.elapsedTime * 0.22;
    }
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
        <bufferAttribute attach="attributes-color"    args={[colors, 3]}    count={count} />
        <bufferAttribute attach="attributes-size"     args={[sizes, 1]}     count={count} />
        <bufferAttribute attach="attributes-phase"    args={[phases, 1]}    count={count} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute float size; attribute float phase; attribute vec3 color;
          varying vec3 vColor; varying float vTw;
          uniform float uTime;
          void main() {
            vColor = color;
            vTw = 0.5 + 0.5 * sin(uTime * 3.0 + phase);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (220.0 / -mvPosition.z) * vTw;
            gl_Position = projectionMatrix * mvPosition;
          }`}
        fragmentShader={`
          varying vec3 vColor; varying float vTw;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d);
            a = pow(a, 2.2) * vTw;
            gl_FragColor = vec4(vColor, a);
          }`}
      />
    </points>
  );
}

function GalaxyCore({
  position, hovered, selected, dim, onHover, onSelect, glowTex,
}: {
  position: THREE.Vector3;
  hovered: boolean;
  selected: boolean;
  dim: boolean;
  onHover: (h: boolean) => void;
  onSelect: () => void;
  glowTex: THREE.Texture;
}) {
  const outerRef  = useRef<THREE.Group>(null);
  const midRef    = useRef<THREE.Group>(null);
  const innerRef  = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const wholeRef  = useRef<THREE.Group>(null);

  // Pre-build edge geometries
  const edges = useMemo(() => ({
    outer: new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 3.2, 3.2)),
    mid:   new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 2.2, 2.2)),
    inner: new THREE.EdgesGeometry(new THREE.BoxGeometry(1.25, 1.25, 1.25)),
  }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (outerRef.current)  { outerRef.current.rotation.x = t * 0.12;  outerRef.current.rotation.y = t * 0.18; }
    if (midRef.current)    { midRef.current.rotation.y   = -t * 0.22; midRef.current.rotation.z   = t * 0.15; }
    if (innerRef.current)  { innerRef.current.rotation.x = -t * 0.32; innerRef.current.rotation.z = -t * 0.42; }
    if (sphereRef.current) { const s = 1 + Math.sin(t * 1.5) * 0.08; sphereRef.current.scale.setScalar(s); }
    if (wholeRef.current)  { wholeRef.current.position.y = position.y + Math.sin(t * 0.6) * 0.18; }
  });

  const op = dim ? 0.35 : 1;
  const boost = hovered || selected ? 1.5 : 1;
  const cVio = "#a78bfa";   // electric violet
  const cCya = "#67e8f9";   // cyan
  const cWht = "#ffffff";

  return (
    <group
      ref={wholeRef}
      position={position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(false); document.body.style.cursor = "default"; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Outer halo billboard — biggest glow */}
      <sprite scale={[9 * boost, 9 * boost, 9 * boost]}>
        <spriteMaterial map={glowTex} color={cVio} transparent opacity={0.55 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Outer cube (violet) */}
      <group ref={outerRef}>
        <mesh>
          <boxGeometry args={[3.2, 3.2, 3.2]} />
          <meshBasicMaterial color={cVio} transparent opacity={0.07 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <lineSegments geometry={edges.outer}>
          <lineBasicMaterial color={cVio} transparent opacity={(0.75 + (hovered ? 0.25 : 0)) * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      </group>

      {/* Mid cube (cyan) */}
      <group ref={midRef}>
        <mesh>
          <boxGeometry args={[2.2, 2.2, 2.2]} />
          <meshBasicMaterial color={cCya} transparent opacity={0.09 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <lineSegments geometry={edges.mid}>
          <lineBasicMaterial color={cCya} transparent opacity={(0.65 + (hovered ? 0.25 : 0)) * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      </group>

      {/* Inner cube (white-violet) */}
      <group ref={innerRef}>
        <mesh>
          <boxGeometry args={[1.25, 1.25, 1.25]} />
          <meshBasicMaterial color={cWht} transparent opacity={0.18 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <lineSegments geometry={edges.inner}>
          <lineBasicMaterial color="#e0e7ff" transparent opacity={(0.9) * op} blending={THREE.AdditiveBlending} depthWrite={false} />
        </lineSegments>
      </group>

      {/* Bright energy core sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.42, 28, 28]} />
        <meshBasicMaterial color={cWht} transparent opacity={0.95 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Sub-glow */}
      <sprite scale={[3.5, 3.5, 3.5]}>
        <spriteMaterial map={glowTex} color="#dbeafe" transparent opacity={0.85 * op} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Orbital particles */}
      <CoreOrbitalParticles count={42} />

      {/* Outer twin rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.55, 2.62, 96]} />
        <meshBasicMaterial color={cCya} transparent opacity={0.55 * op} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, Math.PI / 6]}>
        <ringGeometry args={[2.85, 2.92, 96]} />
        <meshBasicMaterial color={cVio} transparent opacity={0.45 * op} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Standard node (sphere + halo + rings on hover) ───────────────────────
interface NodeRender {
  node: GraphNode;
  position: THREE.Vector3;
  color: THREE.Color;
  radius: number;
  cls: NodeClass;
}

function StandardNode({
  item, hovered, selected, dim, onHover, onSelect, glowTex, idx,
}: {
  item: NodeRender; hovered: boolean; selected: boolean; dim: boolean;
  onHover: (id: string | null) => void; onSelect: () => void;
  glowTex: THREE.Texture; idx: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const isHL = hovered || selected;
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const breath = 1 + Math.sin(clock.elapsedTime * 1.2 + idx * 0.5) * 0.04;
    const target = isHL ? 1.6 : breath;
    groupRef.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
  });

  const opacity = dim ? 0.22 : 1;
  const haloScale = item.radius * (isHL ? 7.5 : 4.5);

  return (
    <group
      ref={groupRef}
      position={item.position}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(item.node.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
    >
      <mesh>
        <sphereGeometry args={[item.radius, 22, 22]} />
        <meshBasicMaterial color={item.color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[item.radius * 0.55, 18, 18]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={(isHL ? 0.95 : 0.7) * opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <sprite scale={[haloScale, haloScale, haloScale]}>
        <spriteMaterial map={glowTex} color={item.color} transparent opacity={(isHL ? 0.95 : 0.55) * opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {isHL && (
        <>
          <OrbitRing radius={item.radius * 2.4} color={item.color} speed={0.6}  axis="y" />
          <OrbitRing radius={item.radius * 3.1} color={item.color} speed={-0.4} axis="x" />
          <OrbitRing radius={item.radius * 3.8} color={item.color} speed={0.25} axis="z" />
        </>
      )}
    </group>
  );
}

function OrbitRing({ radius, color, speed, axis }: {
  radius: number; color: THREE.Color; speed: number; axis: "x" | "y" | "z";
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    if (axis === "y") ref.current.rotation.y = s.clock.elapsedTime * speed;
    if (axis === "x") ref.current.rotation.x = s.clock.elapsedTime * speed;
    if (axis === "z") ref.current.rotation.z = s.clock.elapsedTime * speed;
  });
  const rot: [number, number, number] =
    axis === "y" ? [Math.PI / 2, 0, 0] :
    axis === "x" ? [0, Math.PI / 2, 0] :
    [0, 0, 0];
  return (
    <mesh ref={ref} rotation={rot}>
      <ringGeometry args={[radius * 0.98, radius * 1.04, 96]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ── Edges ─────────────────────────────────────────────────────────────────
function Edges({
  edges, positions, hoveredId, selectedId,
}: {
  edges: GraphEdge[]; positions: Map<string, THREE.Vector3>;
  hoveredId: string | null; selectedId: string | null;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, lineCount } = useMemo(() => {
    const segs: number[] = [], colors: number[] = [], alphaA: number[] = [];
    let n = 0;
    for (const e of edges) {
      const sid = typeof e.source === "string" ? e.source : e.source.id;
      const tid = typeof e.target === "string" ? e.target : e.target.id;
      const a = positions.get(sid), b = positions.get(tid);
      if (!a || !b) continue;
      segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c1 = [0.47, 0.71, 1.00], c2 = [0.75, 0.55, 1.00];
      colors.push(...c1, ...c2);
      alphaA.push(0.35, 0.35);
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position",  new THREE.Float32BufferAttribute(segs, 3));
    g.setAttribute("color",     new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("baseAlpha", new THREE.Float32BufferAttribute(alphaA, 1));
    return { geometry: g, lineCount: n };
  }, [edges, positions]);

  useEffect(() => {
    const attr = geometry.getAttribute("baseAlpha") as THREE.BufferAttribute;
    if (!attr) return;
    let vi = 0;
    for (const e of edges) {
      const sid = typeof e.source === "string" ? e.source : e.source.id;
      const tid = typeof e.target === "string" ? e.target : e.target.id;
      if (!positions.has(sid) || !positions.has(tid)) continue;
      const focused = hoveredId || selectedId;
      const isHL = !!focused && (sid === focused || tid === focused);
      const dim = !!focused && !isHL;
      const a = isHL ? 0.85 : dim ? 0.06 : 0.32;
      attr.setX(vi * 2, a); attr.setX(vi * 2 + 1, a);
      vi++;
    }
    attr.needsUpdate = true;
  }, [edges, positions, hoveredId, selectedId, geometry]);

  useFrame((s) => { if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime; });
  if (lineCount === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute vec3 color; attribute float baseAlpha;
          varying vec3 vColor; varying float vAlpha; varying float vDepth;
          void main() {
            vColor = color; vAlpha = baseAlpha;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }`}
        fragmentShader={`
          varying vec3 vColor; varying float vAlpha; varying float vDepth;
          uniform float uTime;
          void main() {
            float dFade = clamp(1.0 - (vDepth - 30.0) / 60.0, 0.18, 1.0);
            float pulse = 0.6 + 0.4 * sin(uTime * 1.4 + vDepth * 0.3);
            float a = vAlpha * dFade * pulse;
            gl_FragColor = vec4(vColor, a);
          }`}
      />
    </lineSegments>
  );
}

// ── Camera framer — cinematic tween ───────────────────────────────────────
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface FrameTarget { camPos: THREE.Vector3; target: THREE.Vector3; duration: number; }

function CameraFramer({ tick, request }: { tick: number; request: FrameTarget | null }) {
  const { camera } = useThree();
  const tweenRef = useRef<{
    start: number; duration: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    if (!request) return;
    // Read current target from drei controls (camera.userData.target stashed)
    const controls = (camera as unknown as { userData?: { target?: THREE.Vector3 } }).userData;
    const currentTarget = controls?.target?.clone() ?? new THREE.Vector3(0, 0, 0);
    tweenRef.current = {
      start: performance.now(),
      duration: request.duration,
      fromPos: camera.position.clone(),
      toPos: request.camPos.clone(),
      fromTarget: currentTarget,
      toTarget: request.target.clone(),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useFrame(() => {
    if (!tweenRef.current) return;
    const tw = tweenRef.current;
    const t = Math.min(1, (performance.now() - tw.start) / tw.duration);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    const tgt = (camera as unknown as { userData: { target: THREE.Vector3 } }).userData.target;
    tgt.lerpVectors(tw.fromTarget, tw.toTarget, e);
    if (t >= 1) tweenRef.current = null;
  });
  return null;
}

// ── Controls types & constants ────────────────────────────────────────────
export const ZOOM_MIN_DIST = 10;
export const ZOOM_MAX_DIST = 140;
export const ZOOM_DEFAULT  = 38;

interface TrackballHandle {
  target: THREE.Vector3;
  update?: () => void;
}

// Bridge: keep camera.userData.target in sync with controls.target (for CameraFramer)
function ControlsBridge({ controlsRef }: { controlsRef: React.RefObject<TrackballHandle | null> }) {
  const { camera } = useThree();
  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    (camera as unknown as { userData: { target: THREE.Vector3 } }).userData.target = c.target;
  });
  return null;
}

// SmoothZoom: maintains targetDistRef value, lerps actual camera distance toward it
// each frame along the camera→target direction. Wheel/pinch handlers (outside Canvas)
// nudge targetDistRef. This decouples input cadence from frame cadence, producing
// weighty cinematic zoom regardless of trackpad event rate.
function SmoothZoom({
  controlsRef, targetDistRef, currentDistRef,
}: {
  controlsRef: React.RefObject<TrackballHandle | null>;
  targetDistRef: React.RefObject<number>;
  currentDistRef: React.RefObject<number>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const target = c.target;

    // Initialize current distance lazily
    if (currentDistRef.current == null || currentDistRef.current <= 0) {
      currentDistRef.current = camera.position.distanceTo(target);
    }

    // Exponential ease toward target distance (perceptually linear at all scales)
    const cur = currentDistRef.current;
    const goal = targetDistRef.current ?? ZOOM_DEFAULT;
    const next = cur + (goal - cur) * 0.11;
    currentDistRef.current = next;

    // Preserve current direction (set by user rotation), just adjust distance
    const dir = camera.position.clone().sub(target);
    const len = dir.length();
    if (len < 0.0001) return;
    dir.multiplyScalar(next / len);
    camera.position.copy(target).add(dir);
  });
  return null;
}

// IdleDrift: while idle, slowly orbit camera around target on Y axis (auto-orbit
// for TrackballControls, which has no built-in autoRotate). Cinematic: gentle
// acceleration into drift via lerp'd speed.
function IdleDrift({
  controlsRef, idle, speedRef,
}: {
  controlsRef: React.RefObject<TrackballHandle | null>;
  idle: boolean;
  speedRef: React.RefObject<number>;
}) {
  const { camera } = useThree();
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame((_, dt) => {
    const c = controlsRef.current;
    if (!c) return;
    const target = idle ? 0.06 : 0;
    speedRef.current = (speedRef.current ?? 0) + (target - (speedRef.current ?? 0)) * 0.045;
    if ((speedRef.current ?? 0) < 0.002) return;
    const offset = camera.position.clone().sub(c.target);
    offset.applyAxisAngle(yAxis, (speedRef.current ?? 0) * dt);
    camera.position.copy(c.target).add(offset);
  });
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────
function Scene({
  data, activeDomains, onPick, hoveredId, selectedId, setHoveredId,
  framerTick, framerRequest,
  controlsRef,
}: Props & {
  onPick: (slug: string) => void;
  hoveredId: string | null; selectedId: string | null;
  setHoveredId: (id: string | null) => void;
  framerTick: number; framerRequest: FrameTarget | null;
  controlsRef: React.RefObject<TrackballHandle | null>;
}) {
  const layout = useMemo(() => buildLayout(data), [data]);
  const visibleNodes = useMemo(() => {
    if (activeDomains.size === 0) return data.nodes;
    return data.nodes.filter((n) =>
      n.id === "index" || n.id.endsWith("/index") ||
      n.domain.some((d) => activeDomains.has(d))
    );
  }, [data.nodes, activeDomains]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => data.edges.filter((e) => {
    const sid = typeof e.source === "string" ? e.source : e.source.id;
    const tid = typeof e.target === "string" ? e.target : e.target.id;
    return visibleNodeIds.has(sid) && visibleNodeIds.has(tid);
  }), [data.edges, visibleNodeIds]);
  const neighborIds = useMemo(() => {
    const focused = hoveredId || selectedId;
    if (!focused) return new Set<string>();
    const out = new Set<string>([focused]);
    for (const e of visibleEdges) {
      const sid = typeof e.source === "string" ? e.source : e.source.id;
      const tid = typeof e.target === "string" ? e.target : e.target.id;
      if (sid === focused) out.add(tid);
      if (tid === focused) out.add(sid);
    }
    return out;
  }, [hoveredId, selectedId, visibleEdges]);

  const items: NodeRender[] = useMemo(() => visibleNodes.map((n) => ({
    node: n,
    position: layout.positions.get(n.id) ?? new THREE.Vector3(),
    color: nodeColor(n),
    radius: nodeRadius(n),
    cls: nodeClass(n.id, n.broken),
  })), [visibleNodes, layout]);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const focused = hoveredId || selectedId;

  return (
    <>
      <color attach="background" args={["#050816"]} />
      <fog attach="fog" args={["#070B1A", 30, 130]} />
      <ambientLight intensity={0.18} color="#7088c0" />

      <StarField count={3200} />
      <Nebula />
      <Dust count={220} />

      <Edges edges={visibleEdges} positions={layout.positions} hoveredId={hoveredId} selectedId={selectedId} />

      {items.map((it, idx) => {
        const isHovered  = hoveredId === it.node.id;
        const isSelected = selectedId === it.node.id;
        const isHL       = isHovered || isSelected;
        const dim        = !!focused && !isHL && !neighborIds.has(it.node.id);

        if (it.cls === "core") {
          return (
            <GalaxyCore
              key={it.node.id}
              position={it.position}
              hovered={isHovered}
              selected={isSelected}
              dim={dim}
              onHover={(h) => setHoveredId(h ? it.node.id : null)}
              onSelect={() => onPick(it.node.id)}
              glowTex={glowTex}
            />
          );
        }
        return (
          <StandardNode
            key={it.node.id} item={it} idx={idx} glowTex={glowTex}
            hovered={isHovered} selected={isSelected} dim={dim}
            onHover={setHoveredId} onSelect={() => onPick(it.node.id)}
          />
        );
      })}

      <ControlsBridge controlsRef={controlsRef} />
      <CameraFramer tick={framerTick} request={framerRequest} />
    </>
  );
}

// ── Animated number counter ───────────────────────────────────────────────
function useCountUp(value: number, durationMs = 900): number {
  const [v, setV] = useState(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const startRef = useRef(0);

  useEffect(() => {
    fromRef.current = v;
    toRef.current = value;
    startRef.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const t = Math.min(1, (performance.now() - startRef.current) / durationMs);
      const e = easeInOutCubic(t);
      const cur = fromRef.current + (toRef.current - fromRef.current) * e;
      setV(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return v;
}

// ── Top-level component ───────────────────────────────────────────────────
export default function GalaxyGraph({ data, activeDomains, pages }: Props) {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [idle, setIdle] = useState(false);
  const [framerTick, setFramerTick] = useState(0);
  const [framerRequest, setFramerRequest] = useState<FrameTarget | null>(null);
  const controlsRef    = useRef<TrackballHandle | null>(null);
  const wrapperRef     = useRef<HTMLDivElement | null>(null);
  const targetDistRef  = useRef<number>(ZOOM_DEFAULT);
  const currentDistRef = useRef<number>(ZOOM_DEFAULT);
  const idleSpeedRef   = useRef<number>(0);
  const lastTapRef     = useRef<number>(0);
  const lastInteractRef = useRef<number>(Date.now());

  useEffect(() => {
    const i = setInterval(() => setIdle(Date.now() - lastInteractRef.current > 3500), 500);
    return () => clearInterval(i);
  }, []);
  function bumpInteract() {
    lastInteractRef.current = Date.now();
    if (idle) setIdle(false);
  }

  // ── Custom wheel/trackpad zoom: nudges targetDistRef (eased by SmoothZoom) ──
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Don't preventDefault on regular scroll events bubbling from HUD panels
      if (!(e.target as Element).closest?.("[data-knowledge-graph]")) return;
      e.preventDefault();
      // Trackpad pinch fires wheel with ctrlKey + tiny deltaY; mouse wheel large deltaY
      const trackpadPinch = e.ctrlKey;
      const factor = trackpadPinch ? 0.014 : 0.0016;
      // Exponential: same perceived speed at all distances
      const next = targetDistRef.current * Math.exp(e.deltaY * factor);
      targetDistRef.current = Math.max(ZOOM_MIN_DIST, Math.min(ZOOM_MAX_DIST, next));
      bumpInteract();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Two-finger touch pinch zoom ──
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let lastDist: number | null = null;
    const dist = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { lastDist = dist(e.touches); bumpInteract(); }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastDist == null) return;
      e.preventDefault();
      const d = dist(e.touches);
      const ratio = lastDist / d;
      const next = targetDistRef.current * ratio;
      targetDistRef.current = Math.max(ZOOM_MIN_DIST, Math.min(ZOOM_MAX_DIST, next));
      lastDist = d;
      bumpInteract();
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) lastDist = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove",  onMove,  { passive: false });
    el.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedNode = selectedId ? data.nodes.find((n) => n.id === selectedId) ?? null : null;
  const hoveredNode  = hoveredId  ? data.nodes.find((n) => n.id === hoveredId)  ?? null : null;
  const previewNode = hoveredNode || selectedNode;
  const previewPage = previewNode && pages ? pages.find((p) => p.slug === previewNode.id) ?? null : null;

  function handlePick(id: string) {
    if (selectedId === id) router.push(`/wiki/${id}`);
    else setSelectedId(id);
    bumpInteract();
  }

  // Center button → cinematic camera reset to galaxy core
  function centerGalaxy() {
    setFramerRequest({
      camPos: new THREE.Vector3(0, 8, 38),
      target: new THREE.Vector3(0, 0, 0),
      duration: 1400,
    });
    setFramerTick((t) => t + 1);
    bumpInteract();
  }

  return (
    <div
      ref={wrapperRef}
      data-knowledge-graph="1"
      style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 45%, #0A1022 0%, #070B1A 50%, #050816 100%)",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        bumpInteract();
        // Double-tap / double-click detection → recenter galaxy
        const now = performance.now();
        if (now - lastTapRef.current < 320) {
          lastTapRef.current = 0;
          centerGalaxy();
        } else {
          lastTapRef.current = now;
        }
      }}
    >
      <Canvas
        camera={{ position: [0, 8, 38], fov: 55, near: 0.1, far: 400 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onPointerMissed={() => setSelectedId(null)}
      >
        <Suspense fallback={null}>
          <Scene
            data={data}
            activeDomains={activeDomains}
            onPick={handlePick}
            hoveredId={hoveredId}
            selectedId={selectedId}
            setHoveredId={(id) => { setHoveredId(id); bumpInteract(); }}
            framerTick={framerTick}
            framerRequest={framerRequest}
            controlsRef={controlsRef}
          />

          {/* TrackballControls: free 360° rotation in all axes — feels like
              manipulating a celestial sphere. Zoom is disabled here and handled
              by our SmoothZoom system (wheel + touch pinch outside Canvas). */}
          <TrackballControls
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={(r: any) => { controlsRef.current = r; }}
            rotateSpeed={2.4}
            zoomSpeed={1.0}
            panSpeed={0.4}
            dynamicDampingFactor={0.10}
            staticMoving={false}
            noZoom
            noPan
            minDistance={ZOOM_MIN_DIST}
            maxDistance={ZOOM_MAX_DIST}
            target={[0, 0, 0]}
          />

          <SmoothZoom
            controlsRef={controlsRef}
            targetDistRef={targetDistRef}
            currentDistRef={currentDistRef}
          />
          <IdleDrift controlsRef={controlsRef} idle={idle} speedRef={idleSpeedRef} />

          <EffectComposer multisampling={0} enableNormalPass={false}>
            <Bloom intensity={1.65} luminanceThreshold={0.04} luminanceSmoothing={0.52} mipmapBlur radius={0.88} />
            <ChromaticAberration
              offset={[0.0008, 0.0012] as unknown as THREE.Vector2}
              blendFunction={BlendFunction.NORMAL}
              radialModulation={false}
              modulationOffset={0}
            />
            <Vignette eskil={false} offset={0.22} darkness={0.88} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      <NodePreviewPanel node={previewNode} page={previewPage} />
      <CornerBrackets />
      <Telemetry
        nodeCount={data.nodes.length}
        edgeCount={data.edges.length}
        hovered={hoveredNode?.label ?? null}
        selected={selectedNode?.label ?? null}
        idle={idle}
      />
      <CenterButton onCenter={centerGalaxy} />
      <GestureHints />
    </div>
  );
}

// ── HUD: Corner brackets ──────────────────────────────────────────────────
function CornerBrackets() {
  const c = "rgba(140,180,255,0.45)";
  const size = 22;
  const base: React.CSSProperties = { position: "absolute", width: size, height: size, pointerEvents: "none", zIndex: 9 };
  return (
    <>
      <div style={{ ...base, top: 18,    left: 18,    borderTop:    `1px solid ${c}`, borderLeft:   `1px solid ${c}` }} />
      <div style={{ ...base, top: 18,    right: 18,   borderTop:    `1px solid ${c}`, borderRight:  `1px solid ${c}` }} />
      <div style={{ ...base, bottom: 18, left: 18,    borderBottom: `1px solid ${c}`, borderLeft:   `1px solid ${c}` }} />
      <div style={{ ...base, bottom: 18, right: 18,   borderBottom: `1px solid ${c}`, borderRight:  `1px solid ${c}` }} />
    </>
  );
}

// ── HUD: Telemetry (glassmorphism) ────────────────────────────────────────
function Telemetry({ nodeCount, edgeCount, hovered, selected, idle }: {
  nodeCount: number; edgeCount: number; hovered: string | null; selected: string | null; idle: boolean;
}) {
  const animNodes = useCountUp(nodeCount, 1000);
  const animEdges = useCountUp(edgeCount, 1100);

  return (
    <div style={{
      position: "absolute",
      bottom: 50, right: 28,
      pointerEvents: "none",
      zIndex: 11,
      minWidth: 220,
    }}>
      <div style={{
        position: "relative",
        background: "rgba(7,11,26,0.45)",
        backdropFilter: "blur(22px) saturate(140%)",
        WebkitBackdropFilter: "blur(22px) saturate(140%)",
        border: "1px solid rgba(140,180,255,0.14)",
        borderRadius: 8,
        padding: "12px 16px 12px 16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.40), 0 0 0 1px rgba(120,160,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}>
        {/* Top scanning line */}
        <div style={{
          position: "absolute", top: 0, left: 10, right: 10, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(140,180,255,0.55), transparent)",
        }} />
        {/* Corner ticks */}
        <span style={{ position: "absolute", top: 4,  left: 4,  width: 6, height: 6, borderTop: "1px solid rgba(140,180,255,0.55)", borderLeft: "1px solid rgba(140,180,255,0.55)" }} />
        <span style={{ position: "absolute", top: 4,  right: 4, width: 6, height: 6, borderTop: "1px solid rgba(140,180,255,0.55)", borderRight: "1px solid rgba(140,180,255,0.55)" }} />
        <span style={{ position: "absolute", bottom: 4, left: 4,  width: 6, height: 6, borderBottom: "1px solid rgba(140,180,255,0.55)", borderLeft: "1px solid rgba(140,180,255,0.55)" }} />
        <span style={{ position: "absolute", bottom: 4, right: 4, width: 6, height: 6, borderBottom: "1px solid rgba(140,180,255,0.55)", borderRight: "1px solid rgba(140,180,255,0.55)" }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: idle ? "#a78bfa" : "#67e8f9",
            boxShadow: `0 0 8px ${idle ? "#a78bfaaa" : "#67e8f9aa"}`,
            animation: "pulse 2s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.16em",
            color: "rgba(200,215,255,0.9)",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
          }}>
            GALAXY · {idle ? "DRIFT" : "ACTIVE"}
          </span>
        </div>

        {/* Metrics row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "4px 16px", marginBottom: 10,
        }}>
          <MetricMini label="NODES" value={Math.round(animNodes)} accent="#67e8f9" />
          <MetricMini label="LINKS" value={Math.round(animEdges)} accent="#a78bfa" />
        </div>

        {/* Context line */}
        <div style={{
          paddingTop: 8,
          borderTop: "1px solid rgba(140,180,255,0.08)",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 9, letterSpacing: "0.12em",
          color: "rgba(180,200,240,0.55)",
          lineHeight: 1.6,
          minHeight: 28,
        }}>
          {selected ? (
            <div style={{ color: "rgba(220,225,255,0.95)" }}>▸ SEL · {selected.slice(0, 28).toUpperCase()}</div>
          ) : hovered ? (
            <div style={{ color: "rgba(200,215,255,0.85)" }}>◇ HOV · {hovered.slice(0, 28).toUpperCase()}</div>
          ) : (
            <div style={{ opacity: 0.55 }}>{idle ? "◌ AUTO-ORBIT ENGAGED" : "◌ AWAITING INPUT"}</div>
          )}
        </div>
      </div>

      {/* Inject pulse keyframes once */}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

function MetricMini({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div>
      <div style={{
        fontSize: 7.5, fontWeight: 700, letterSpacing: "0.18em",
        color: "rgba(150,170,210,0.55)",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 700,
        color: accent,
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        letterSpacing: "-0.01em", lineHeight: 1,
        textShadow: `0 0 12px ${accent}66`,
      }}>{String(value).padStart(3, "0")}</div>
    </div>
  );
}

// ── HUD: Center Galaxy button ─────────────────────────────────────────────
function CenterButton({ onCenter }: { onCenter: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{
      position: "absolute",
      bottom: 50, left: "50%",
      transform: "translateX(-50%)",
      zIndex: 11,
      pointerEvents: "auto",
    }}>
      <button
        onClick={onCenter}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 18px 10px 14px",
          background: hover
            ? "linear-gradient(135deg, rgba(103,232,249,0.18) 0%, rgba(167,139,250,0.18) 100%)"
            : "rgba(7,11,26,0.45)",
          backdropFilter: "blur(22px) saturate(160%)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          border: `1px solid ${hover ? "rgba(167,139,250,0.55)" : "rgba(140,180,255,0.22)"}`,
          borderRadius: 100,
          cursor: "pointer",
          color: hover ? "#e0e7ff" : "rgba(200,215,255,0.85)",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: pressed ? "scale(0.97)" : hover ? "scale(1.04)" : "scale(1)",
          boxShadow: hover
            ? "0 8px 28px rgba(103,232,249,0.25), 0 0 0 4px rgba(167,139,250,0.10), 0 0 30px rgba(167,139,250,0.35), inset 0 1px 0 rgba(255,255,255,0.08)"
            : "0 4px 18px rgba(0,0,0,0.45), 0 0 0 1px rgba(140,180,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Top scanning line */}
        <span style={{
          position: "absolute", top: 0, left: 16, right: 16, height: 1,
          background: `linear-gradient(90deg, transparent, ${hover ? "rgba(167,139,250,0.85)" : "rgba(140,180,255,0.4)"}, transparent)`,
          pointerEvents: "none",
        }} />
        {/* Icon: crosshair / target */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="3"  stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="8"  stroke="currentColor" strokeWidth="1"   opacity="0.55" />
          <line x1="12" y1="2"  x2="12" y2="5"  stroke="currentColor" strokeWidth="1.5" />
          <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
          <line x1="2"  y1="12" x2="5"  y2="12" stroke="currentColor" strokeWidth="1.5" />
          <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>CENTER GALAXY</span>
      </button>
    </div>
  );
}

// ── HUD: Gesture hints (subtle interaction cues) ──────────────────────────
function GestureHints() {
  const [collapsed, setCollapsed] = useState(false);
  // Auto-collapse after 8s if user hasn't dismissed
  useEffect(() => {
    const t = setTimeout(() => setCollapsed(true), 9000);
    return () => clearTimeout(t);
  }, []);

  const HINTS: { icon: React.ReactNode; label: string; sub: string }[] = [
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8h12" />
          <path d="M3 11l3-3-3-3" transform="rotate(180 4.5 8)" />
          <path d="M21 11l-3-3 3-3" transform="rotate(180 19.5 8)" />
          <path d="M9 14a3 3 0 006 0" />
        </svg>
      ),
      label: "PINCH", sub: "ZOOM",
    },
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 010 16" />
          <path d="M12 8v8" />
        </svg>
      ),
      label: "DRAG", sub: "ROTATE",
    },
    {
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" opacity="0.55" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      ),
      label: "DBL-TAP", sub: "CENTER",
    },
  ];

  return (
    <div style={{
      position: "absolute",
      bottom: 50, left: "50%",
      transform: `translate(calc(-50% + 0px), ${collapsed ? 64 : 110}px)`,
      transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s",
      zIndex: 10,
      pointerEvents: "auto",
      opacity: collapsed ? 0.55 : 1,
    }}>
      <div
        onMouseEnter={() => setCollapsed(false)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", gap: 0,
          background: "rgba(7,11,26,0.42)",
          backdropFilter: "blur(22px) saturate(140%)",
          WebkitBackdropFilter: "blur(22px) saturate(140%)",
          border: "1px solid rgba(140,180,255,0.14)",
          borderRadius: 999,
          padding: "6px 8px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45), 0 0 18px rgba(167,139,250,0.10), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
        }}
      >
        {/* Top scan line */}
        <span style={{
          position: "absolute", top: 0, left: 16, right: 16, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(140,180,255,0.55), transparent)",
          pointerEvents: "none",
        }} />
        {HINTS.map((h, i) => (
          <div key={h.label} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 12px",
            borderRight: i < HINTS.length - 1 ? "1px solid rgba(140,180,255,0.08)" : "none",
            color: "rgba(200,215,255,0.85)",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
          }}>
            <span style={{
              display: "inline-flex", alignItems: "center",
              color: "#67e8f9",
              filter: "drop-shadow(0 0 5px rgba(103,232,249,0.7))",
            }}>{h.icon}</span>
            <span style={{
              fontSize: 8.5, fontWeight: 700,
              letterSpacing: "0.18em",
              color: "rgba(224,231,255,0.92)",
            }}>{h.label}</span>
            <span style={{
              fontSize: 8, color: "rgba(140,160,200,0.55)",
              letterSpacing: "0.16em",
            }}>→ {h.sub}</span>
          </div>
        ))}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Show gestures" : "Hide gestures"}
          style={{
            marginLeft: 4,
            width: 22, height: 22,
            border: "1px solid rgba(140,180,255,0.18)",
            background: "rgba(7,11,26,0.55)",
            borderRadius: "50%",
            color: "rgba(180,200,240,0.72)",
            fontSize: 11, lineHeight: 1, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "ui-monospace, monospace",
            transition: "all 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(167,139,250,0.55)";
            e.currentTarget.style.color = "#e0e7ff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(140,180,255,0.18)";
            e.currentTarget.style.color = "rgba(180,200,240,0.72)";
          }}
        >
          {collapsed ? "?" : "×"}
        </button>
      </div>
    </div>
  );
}
