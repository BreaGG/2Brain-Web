"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { ParsedPage } from "@/lib/types";

interface Props {
  pages: ParsedPage[];
  linkDegrees: Map<string, number>;
  activeDomains: Set<string>;
}

/* ──────────────────────────────────────────────────────────────────────────
   ACTIVITY SCORE
   degree (link in/out) + sources (grounding) + recency (decay 120d)
   ────────────────────────────────────────────────────────────────────────── */
function daysSince(d: string): number {
  if (!d) return 9999;
  const t = new Date(d).getTime();
  return isNaN(t) ? 9999 : Math.max(0, (Date.now() - t) / 86400000);
}
function recencyScore(d: string): number { return Math.exp(-daysSince(d) / 120); }

/* ──────────────────────────────────────────────────────────────────────────
   SPIRAL PLACEMENT — hottest at center, fanning outward
   ────────────────────────────────────────────────────────────────────────── */
function spiralCoords(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (n === 0) return out;
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < n; i++) {
    out.push([x, y]);
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx; y += dy;
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   TYPE PALETTE (galaxy aligned)
   ────────────────────────────────────────────────────────────────────────── */
const TYPE_GLOW: Record<string, string> = {
  concept:          "#7dd3fc",
  person:           "#67e8f9",
  "source-summary": "#c4b5fd",
  synthesis:        "#a78bfa",
  ghost:            "#94a3b8",
  meta:             "#94a3b8",
  page:             "#94a3b8",
};

interface Peak {
  page: ParsedPage;
  score: number;        // 0..1 normalized
  degree: number;
  x: number;            // world X
  z: number;            // world Z
  height: number;       // base mountain height
  sigma: number;        // gaussian radius
}

/* ──────────────────────────────────────────────────────────────────────────
   TERRAIN CONFIG
   ────────────────────────────────────────────────────────────────────────── */
const TERRAIN_SIZE     = 80;     // world units (XZ extent ±40)
const TERRAIN_SEGMENTS = 220;    // grid resolution → 48 600 verts
const PEAK_SPACING     = 4.0;
const MAX_HEIGHT       = 7.5;
const PEAK_SIGMA_BASE  = 2.0;
const SAT_FLAT_NOISE   = 0.18;   // ambient terrain undulation amplitude

/* ──────────────────────────────────────────────────────────────────────────
   VALUE NOISE (CPU side — same fn lives in shader for fragment variation)
   ────────────────────────────────────────────────────────────────────────── */
function hash2(x: number, y: number): number {
  return ((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1 + 1) % 1;
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix,        fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix,     iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix,     iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number): number {
  return 0.5 * vnoise(x,       y) +
         0.25 * vnoise(x * 2,  y * 2) +
         0.125 * vnoise(x * 4, y * 4);
}

/* ──────────────────────────────────────────────────────────────────────────
   TERRAIN MESH
   ────────────────────────────────────────────────────────────────────────── */
const TERRAIN_VERTEX = /* glsl */ `
  attribute float aBaseHeight;
  varying float vHeight;
  varying float vBase;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  uniform float uTime;

  void main() {
    vec3 displaced = position;
    // Subtle breathing on tall areas
    float breath = sin(position.x * 0.18 + uTime * 0.45)
                 * sin(position.z * 0.21 + uTime * 0.38);
    float liftFactor = smoothstep(0.4, 4.5, aBaseHeight);
    displaced.y = aBaseHeight + breath * 0.10 * liftFactor;

    vBase    = aBaseHeight;
    vHeight  = displaced.y;
    vec4 wp  = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    vNormal   = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TERRAIN_FRAGMENT = /* glsl */ `
  precision highp float;
  varying float vHeight;
  varying float vBase;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  uniform float uTime;
  uniform float uMaxHeight;
  uniform vec3  uCameraPos;

  // Value noise for surface micro-detail
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Heat gradient — sci-fi navy → cyan → violet → magenta → hot
  vec3 heatRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.025, 0.045, 0.13);   // deep ocean
    vec3 c1 = vec3(0.055, 0.18,  0.42);   // deep blue
    vec3 c2 = vec3(0.16,  0.46,  0.85);   // electric blue
    vec3 c3 = vec3(0.40,  0.85,  1.00);   // cyan
    vec3 c4 = vec3(0.68,  0.50,  1.00);   // violet
    vec3 c5 = vec3(0.96,  0.45,  0.85);   // magenta
    vec3 c6 = vec3(1.00,  0.62,  0.30);   // hot orange (peaks only)

    if (t < 0.12) return mix(c0, c1, smoothstep(0.0,  0.12, t));
    if (t < 0.30) return mix(c1, c2, smoothstep(0.12, 0.30, t));
    if (t < 0.50) return mix(c2, c3, smoothstep(0.30, 0.50, t));
    if (t < 0.70) return mix(c3, c4, smoothstep(0.50, 0.70, t));
    if (t < 0.88) return mix(c4, c5, smoothstep(0.70, 0.88, t));
    return mix(c5, c6, smoothstep(0.88, 1.0, t));
  }

  void main() {
    float maxH = max(uMaxHeight, 0.001);
    float tBase = clamp(vBase / maxH, 0.0, 1.0);

    // Base heat color
    vec3 col = heatRamp(tBase);

    // Lighting: key + rim + fill
    vec3 lightDir = normalize(vec3(0.55, 0.85, 0.30));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float wrap = (diff * 0.7 + 0.3);              // soft wrap
    col *= wrap;

    // Rim lighting (Fresnel)
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    rim = pow(rim, 2.2);
    col += rim * vec3(0.45, 0.70, 1.0) * 0.35;   // icy blue rim

    // Topographic contour lines — equal-altitude rings
    float lineSpacing = 0.7;
    float contourBand = abs(fract(vBase / lineSpacing - 0.5) - 0.5) / fwidth(vBase / lineSpacing);
    float contour = 1.0 - smoothstep(0.0, 1.5, contourBand);
    // Stronger contours on lifted terrain
    contour *= smoothstep(0.05, 0.8, tBase);
    col += contour * vec3(0.55, 0.85, 1.0) * 0.30;

    // Micro-noise surface variation
    float n = vnoise(vWorldPos.xz * 0.55 + uTime * 0.02);
    col += (n - 0.5) * 0.03;

    // Hotspot emissive halo at peaks
    float hot = smoothstep(0.72, 1.0, tBase);
    col += hot * vec3(1.0, 0.55, 0.85) * 0.55;

    // Atmospheric depth fog (distance-based)
    float dist = length(vWorldPos - uCameraPos);
    float fog = smoothstep(35.0, 95.0, dist);
    col = mix(col, vec3(0.025, 0.04, 0.10), fog * 0.85);

    // Subtle vertical attenuation for flat ocean
    float oceanDarken = 1.0 - smoothstep(0.0, 0.15, tBase) * 0.0;
    col *= mix(0.55, 1.0, smoothstep(0.0, 0.25, tBase));

    gl_FragColor = vec4(col, 1.0);
  }
`;

function Terrain({ peaks, maxHeight }: { peaks: Peak[]; maxHeight: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const baseHeights = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = 0;
      // Sum gaussian contributions from peaks
      for (const pk of peaks) {
        const dx = x - pk.x, dz = z - pk.z;
        const r2 = dx * dx + dz * dz;
        const s2 = pk.sigma * pk.sigma;
        h += pk.height * Math.exp(-r2 / (2 * s2));
      }
      // Add layered noise for organic undulation (small amplitude)
      const dist = Math.sqrt(x * x + z * z);
      const noiseAmp = SAT_FLAT_NOISE * (1.0 - Math.min(1, dist / 50));  // damped at far edges
      h += (fbm(x * 0.18, z * 0.18) - 0.5) * noiseAmp * 2.0;
      // Slight global low-frequency wave
      h += (fbm(x * 0.05, z * 0.05) - 0.5) * 0.4;

      pos.setY(i, h);
      baseHeights[i] = h;
    }

    g.setAttribute("aBaseHeight", new THREE.BufferAttribute(baseHeights, 1));
    g.computeVertexNormals();
    return g;
  }, [peaks]);

  useFrame((s) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
      matRef.current.uniforms.uCameraPos.value.copy(s.camera.position);
    }
  });

  return (
    <mesh geometry={geom} receiveShadow castShadow>
      <shaderMaterial
        ref={matRef}
        vertexShader={TERRAIN_VERTEX}
        fragmentShader={TERRAIN_FRAGMENT}
        uniforms={{
          uTime:      { value: 0 },
          uMaxHeight: { value: maxHeight },
          uCameraPos: { value: new THREE.Vector3() },
        }}
        side={THREE.DoubleSide}
        transparent={false}
      />
    </mesh>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PEAK MARKERS — clickable holographic anchors at hot peaks only
   ────────────────────────────────────────────────────────────────────────── */
function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0,    "rgba(255,255,255,1)");
  g.addColorStop(0.3,  "rgba(255,255,255,0.55)");
  g.addColorStop(0.6,  "rgba(180,200,255,0.15)");
  g.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function PeakMarker({
  peak, hovered, onHover, onClick, glowTex,
}: {
  peak: Peak;
  hovered: boolean;
  onHover: (s: string | null) => void;
  onClick: () => void;
  glowTex: THREE.Texture;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const typeColor = TYPE_GLOW[peak.page.type] ?? "#94a3b8";
  // Color matches peak heat: hotter → magenta/orange, cooler → cyan
  const heatColor = peak.score > 0.75
    ? "#ff8fbe"
    : peak.score > 0.55
      ? "#c4b5fd"
      : peak.score > 0.30
        ? "#67e8f9"
        : "#7dd3fc";

  useFrame((s) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(s.clock.elapsedTime * 1.6 + peak.x * 0.4) * 0.08;
    const target = hovered ? 1.55 : pulse;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.18);
  });

  const size = 0.22 + peak.score * 0.38;
  const top = peak.height + 0.5;

  return (
    <group position={[peak.x, top, peak.z]}>
      {/* Halo billboard */}
      <sprite scale={[size * 8, size * 8, size * 8]}>
        <spriteMaterial
          map={glowTex} color={heatColor}
          transparent opacity={hovered ? 0.95 : 0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      {/* Bright core */}
      <mesh
        ref={ref}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(peak.page.slug); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      >
        <sphereGeometry args={[size, 20, 20]} />
        <meshBasicMaterial
          color={heatColor}
          transparent opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Inner white core */}
      <mesh>
        <sphereGeometry args={[size * 0.55, 14, 14]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Type-color ring base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
        <ringGeometry args={[size * 1.6, size * 1.95, 32]} />
        <meshBasicMaterial
          color={typeColor}
          transparent opacity={hovered ? 0.85 : 0.4}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   FLOATING DUST — adds atmospheric depth above terrain
   ────────────────────────────────────────────────────────────────────────── */
function Dust({ count = 280 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    const phases    = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3]     = (Math.random() - 0.5) * 78;
      positions[i*3 + 1] = 2 + Math.random() * 14;
      positions[i*3 + 2] = (Math.random() - 0.5) * 78;
      const t = Math.random();
      if      (t < 0.5)  { colors[i*3] = 0.45; colors[i*3+1] = 0.85; colors[i*3+2] = 1.00; } // cyan
      else if (t < 0.85) { colors[i*3] = 0.75; colors[i*3+1] = 0.55; colors[i*3+2] = 1.00; } // violet
      else               { colors[i*3] = 1.00; colors[i*3+1] = 0.6;  colors[i*3+2] = 0.85; } // magenta
      sizes[i]  = 0.4 + Math.random() * 1.0;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, colors, sizes, phases };
  }, [count]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((s) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.012;
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
        ref={matRef}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute float size; attribute float phase; attribute vec3 color;
          varying vec3 vColor; varying float vTw;
          uniform float uTime;
          void main() {
            vColor = color;
            vTw = 0.4 + 0.6 * sin(uTime * 1.4 + phase);
            vec3 p = position;
            p.y += sin(uTime * 0.4 + phase) * 0.6;
            p.x += sin(uTime * 0.25 + phase * 1.3) * 0.4;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = size * (220.0 / -mvPosition.z) * vTw;
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          varying vec3 vColor; varying float vTw;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d);
            a = pow(a, 2.2) * vTw * 0.7;
            gl_FragColor = vec4(vColor, a);
          }
        `}
      />
    </points>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ENERGY LINKS — soft additive arcs between top-degree neighbors (optional flair)
   ────────────────────────────────────────────────────────────────────────── */
function EnergyLinks({ peaks }: { peaks: Peak[] }) {
  // Connect each hot peak (score > 0.5) to nearest hotter peak via arc
  const geom = useMemo(() => {
    const sorted = [...peaks].filter((p) => p.score > 0.45).sort((a, b) => b.score - a.score);
    const segs: number[] = [], colors: number[] = [];
    const SAMPLES = 18;
    for (let i = 1; i < sorted.length; i++) {
      const target = sorted[0]; // link all hot peaks to the apex
      const a = sorted[i], b = target;
      const aTop = new THREE.Vector3(a.x, a.height + 0.6, a.z);
      const bTop = new THREE.Vector3(b.x, b.height + 0.6, b.z);
      const mid  = aTop.clone().lerp(bTop, 0.5);
      mid.y += aTop.distanceTo(bTop) * 0.18;
      // Sample bezier arc
      let prev = aTop.clone();
      for (let k = 1; k <= SAMPLES; k++) {
        const t = k / SAMPLES;
        const p0 = aTop.clone().lerp(mid, t);
        const p1 = mid.clone().lerp(bTop, t);
        const p  = p0.lerp(p1, t);
        segs.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        // Color: cyan at base, violet at midpoint
        const lerpC = Math.abs(t - 0.5) * 2;
        const c1 = [0.45, 0.85, 1.00], c2 = [0.68, 0.50, 1.00];
        const r = c1[0] + (c2[0] - c1[0]) * (1 - lerpC);
        const g = c1[1] + (c2[1] - c1[1]) * (1 - lerpC);
        const bch = c1[2] + (c2[2] - c1[2]) * (1 - lerpC);
        colors.push(r, g, bch, r, g, bch);
        prev = p;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    g.setAttribute("color",    new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [peaks]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((s) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime;
  });

  return (
    <lineSegments geometry={geom}>
      <shaderMaterial
        ref={matRef}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute vec3 color;
          varying vec3 vColor; varying float vDepth;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying vec3 vColor; varying float vDepth;
          uniform float uTime;
          void main() {
            float pulse = 0.55 + 0.45 * sin(uTime * 1.6 + vDepth * 0.3);
            float a = pulse * 0.55;
            // Distance fade
            a *= clamp(1.0 - (vDepth - 30.0) / 60.0, 0.15, 1.0);
            gl_FragColor = vec4(vColor, a);
          }
        `}
      />
    </lineSegments>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   CAMERA FRAMING — fly-to peak on click (eased cubic)
   ────────────────────────────────────────────────────────────────────────── */
function easeInOutCubic(t: number) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

function CameraFlyer({ target, tick }: { target: THREE.Vector3 | null; tick: number }) {
  const { camera } = useThree();
  const tweenRef = useRef<{ start: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!target) return;
    const offset = new THREE.Vector3(8, 10, 14);
    const camTo = target.clone().add(offset);
    tweenRef.current = {
      start: performance.now(),
      duration: 1500,
      from: camera.position.clone(),
      to: camTo,
      lookFrom: new THREE.Vector3(0, 1, 0),
      lookTo: target.clone(),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  useFrame(() => {
    if (!tweenRef.current) return;
    const tw = tweenRef.current;
    const t = Math.min(1, (performance.now() - tw.start) / tw.duration);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(tw.from, tw.to, e);
    if (t >= 1) tweenRef.current = null;
  });

  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
   SCENE
   ────────────────────────────────────────────────────────────────────────── */
function Scene({
  peaks, hoveredSlug, setHoveredSlug, onPeakClick, maxHeight, flyTarget, flyTick,
}: {
  peaks: Peak[];
  hoveredSlug: string | null;
  setHoveredSlug: (s: string | null) => void;
  onPeakClick: (peak: Peak) => void;
  maxHeight: number;
  flyTarget: THREE.Vector3 | null;
  flyTick: number;
}) {
  const glowTex = useMemo(() => makeGlowTexture(), []);

  // Only place markers for visually significant peaks (score > 0.18)
  const visiblePeaks = useMemo(() => peaks.filter((p) => p.score > 0.18), [peaks]);
  const hoveredPeak = visiblePeaks.find((p) => p.page.slug === hoveredSlug);

  return (
    <>
      <color attach="background" args={["#050816"]} />
      <fog attach="fog" args={["#070B1A", 30, 100]} />

      <ambientLight intensity={0.25} color="#7088c0" />
      <directionalLight position={[12, 26, 18]} intensity={0.9} color="#cce2ff" />
      <directionalLight position={[-8, 14, -10]} intensity={0.35} color="#a78bfa" />

      <Terrain peaks={peaks} maxHeight={maxHeight} />
      <EnergyLinks peaks={peaks} />
      <Dust count={280} />

      {visiblePeaks.map((pk) => (
        <PeakMarker
          key={pk.page.slug}
          peak={pk}
          hovered={hoveredSlug === pk.page.slug}
          onHover={setHoveredSlug}
          onClick={() => onPeakClick(pk)}
          glowTex={glowTex}
        />
      ))}

      {/* Hover tooltip via drei <Html> */}
      {hoveredPeak && (
        <Html
          position={[hoveredPeak.x, hoveredPeak.height + 2.3, hoveredPeak.z]}
          center
          distanceFactor={11}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            background: "rgba(7,11,26,0.78)",
            border: "1px solid rgba(140,180,255,0.20)",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#e0e7ff",
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            backdropFilter: "blur(10px)",
            boxShadow: "0 6px 22px rgba(0,0,0,0.55), 0 0 22px rgba(167,139,250,0.30)",
            fontFamily: "Inter, system-ui, sans-serif",
            minWidth: 160,
          }}>
            <div style={{ marginBottom: 5 }}>{hoveredPeak.page.title}</div>
            <div style={{
              fontSize: 9, color: "#a1a1aa",
              fontFamily: "ui-monospace, monospace", letterSpacing: "0.14em",
              display: "flex", gap: 10,
            }}>
              <span style={{ color: TYPE_GLOW[hoveredPeak.page.type] ?? "#94a3b8" }}>
                {hoveredPeak.page.type.toUpperCase()}
              </span>
              <span>·</span>
              <span>↔ {hoveredPeak.degree}</span>
              <span>·</span>
              <span style={{ color: "#f0abfc" }}>
                {Math.round(hoveredPeak.score * 100)}%
              </span>
            </div>
          </div>
        </Html>
      )}

      <CameraFlyer target={flyTarget} tick={flyTick} />

      <OrbitControls
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        panSpeed={0.5}
        minDistance={14}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1.5, 0]}
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TOP LEVEL
   ────────────────────────────────────────────────────────────────────────── */
const TS = "0 1px 4px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85), 0 0 28px rgba(0,0,0,0.55)";

export default function Heatmap({ pages, linkDegrees, activeDomains }: Props) {
  const router = useRouter();
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [flyTarget, setFlyTarget]     = useState<THREE.Vector3 | null>(null);
  const [flyTick, setFlyTick]         = useState(0);

  const { peaks, stats, maxHeight } = useMemo(() => {
    const filtered = activeDomains.size === 0
      ? pages
      : pages.filter((p) => p.domain.some((d) => activeDomains.has(d)));

    type Raw = { page: ParsedPage; raw: number; degree: number };
    const rawList: Raw[] = filtered.map((p) => {
      const degree = linkDegrees.get(p.slug) ?? 0;
      const sources = p.sources.length;
      const rec = recencyScore(p.lastUpdated);
      const raw = degree * 0.55 + sources * 0.25 + rec * 4 * 0.20;
      return { page: p, raw, degree };
    });
    rawList.sort((a, b) => b.raw - a.raw);

    const max = Math.max(1, ...rawList.map((r) => r.raw));
    const spiral = spiralCoords(rawList.length);

    const peaks: Peak[] = rawList.map((r, i) => {
      const score = r.raw / max;
      const [gx, gy] = spiral[i];
      // Sigma scales subtly with score so hot peaks have broader bases
      const sigma = PEAK_SIGMA_BASE * (0.85 + score * 0.55);
      return {
        page: r.page,
        score,
        degree: r.degree,
        x: gx * PEAK_SPACING,
        z: gy * PEAK_SPACING,
        height: 0.35 + score * MAX_HEIGHT,
        sigma,
      };
    });

    const totalDeg = rawList.reduce((s, r) => s + r.degree, 0);
    const avg = peaks.length ? peaks.reduce((s, p) => s + p.score, 0) / peaks.length : 0;
    const hot = peaks.filter((p) => p.score >= 0.66).length;
    const cold = peaks.filter((p) => p.score < 0.20).length;

    return {
      peaks,
      stats: { hot, cold, totalDeg, avg, total: peaks.length },
      maxHeight: MAX_HEIGHT + 0.4,
    };
  }, [pages, linkDegrees, activeDomains]);

  function handlePeakClick(pk: Peak) {
    setFlyTarget(new THREE.Vector3(pk.x, pk.height, pk.z));
    setFlyTick((t) => t + 1);
    // Delay navigation so user sees the fly-in
    window.setTimeout(() => router.push(`/wiki/${pk.page.slug}`), 850);
  }

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      animation: "fadeIn 0.45s ease-out",
    }}>
      {/* Header strip (transparent — text-only HUD) */}
      <header style={{
        flexShrink: 0,
        padding: "20px 30px 14px",
        zIndex: 2,
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, color: "#f0abfc",
            letterSpacing: "0.22em",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontWeight: 700,
            textShadow: `0 0 10px rgba(240,171,252,0.6), ${TS}`,
          }}>
            ◉ CARTA TÉRMICA · COGNITIVE TERRAIN
          </span>
          <span style={{
            fontSize: 9, color: "rgba(200,215,255,0.78)",
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            letterSpacing: "0.16em",
            textShadow: TS,
          }}>
            {stats.total} ANCHORS · DRAG · SCROLL · CLICK PEAK
          </span>
        </div>
        <p style={{
          color: "#e8eeff", fontSize: 12,
          maxWidth: 760, lineHeight: 1.55,
          textShadow: TS,
        }}>
          Cordillera de pensamiento generada por activity, density y recency.
          Picos rojos = nodos calientes · valles oscuros = orphans.
        </p>
      </header>

      {/* 3D canvas */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <Canvas
          shadows
          camera={{ position: [26, 22, 30], fov: 45, near: 0.1, far: 240 }}
          style={{ background: "radial-gradient(ellipse at 50% 45%, #0A1022 0%, #070B1A 50%, #050816 100%)" }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <Suspense fallback={null}>
            <Scene
              peaks={peaks}
              hoveredSlug={hoveredSlug}
              setHoveredSlug={setHoveredSlug}
              onPeakClick={handlePeakClick}
              maxHeight={maxHeight}
              flyTarget={flyTarget}
              flyTick={flyTick}
            />

            <EffectComposer multisampling={0} enableNormalPass={false}>
              <Bloom intensity={1.25} luminanceThreshold={0.18} luminanceSmoothing={0.55} mipmapBlur radius={0.78} />
              <ChromaticAberration
                offset={[0.0006, 0.0010] as unknown as THREE.Vector2}
                blendFunction={BlendFunction.NORMAL}
                radialModulation={false}
                modulationOffset={0}
              />
              <Vignette eskil={false} offset={0.22} darkness={0.78} blendFunction={BlendFunction.NORMAL} />
            </EffectComposer>
          </Suspense>
        </Canvas>

        {/* Stats — transparent text HUD bottom-left */}
        <div style={{
          position: "absolute", bottom: 22, left: 30,
          display: "flex", flexDirection: "column", gap: 4,
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          pointerEvents: "none",
        }}>
          <HudStat label="HOT"   value={stats.hot}                    accent="#ff8fbe" />
          <HudStat label="COLD"  value={stats.cold}                   accent="#7dd3fc" />
          <HudStat label="LINKS" value={stats.totalDeg}               accent="#a78bfa" />
          <HudStat label="AVG"   value={`${(stats.avg * 100).toFixed(0)}%`} accent="#67e8f9" />
        </div>

        {/* Heat legend — transparent text bottom-right */}
        <div style={{
          position: "absolute", bottom: 22, right: 30,
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 9, color: "#e8eeff",
          letterSpacing: "0.18em",
          pointerEvents: "none",
          textShadow: TS,
        }}>
          <span>COLD</span>
          <div style={{
            width: 200, height: 6, borderRadius: 3,
            background: "linear-gradient(90deg, rgb(7,12,33), rgb(14,46,107), rgb(41,117,217), rgb(102,217,255), rgb(173,128,255), rgb(245,115,217), rgb(255,158,77))",
            border: "1px solid rgba(200,215,255,0.30)",
            boxShadow: "0 0 14px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.95)",
          }} />
          <span>HOT</span>
        </div>
      </div>
    </div>
  );
}

function HudStat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{
        fontSize: 8, color: "rgba(200,215,255,0.78)",
        letterSpacing: "0.24em", fontWeight: 700,
        minWidth: 40,
        textShadow: TS,
      }}>{label}</span>
      <span style={{
        fontSize: 16, color: accent,
        fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1,
        textShadow: `0 0 14px ${accent}cc, 0 0 4px ${accent}88, ${TS}`,
      }}>{value}</span>
    </div>
  );
}
