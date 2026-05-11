"use client";

import { useEffect, useRef, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   HUD DESIGN TOKENS
   Shared visual language for every interface element in the galaxy system.
   Keep panels translucent so the galaxy bleeds through.
   ────────────────────────────────────────────────────────────────────────── */

export const HUD = {
  // Material
  bgPanel:        "rgba(7,11,26,0.55)",      // primary glass
  bgPanelStrong:  "rgba(7,11,26,0.72)",      // for dialogs/modals
  bgPanelLight:   "rgba(7,11,26,0.38)",      // floating overlays close to scene
  bgInset:        "rgba(255,255,255,0.025)", // subtle tile bg inside panels
  blur:           "blur(22px) saturate(140%)",
  blurStrong:     "blur(28px) saturate(160%)",

  // Borders
  border:         "1px solid rgba(140,180,255,0.14)",
  borderHover:    "1px solid rgba(167,139,250,0.42)",
  borderActive:   "1px solid rgba(167,139,250,0.55)",
  borderInner:    "1px solid rgba(140,180,255,0.05)",

  // Accents
  cornerColor:    "rgba(140,180,255,0.45)",
  scanColor:      "rgba(140,180,255,0.55)",
  scanLineCss:    "linear-gradient(90deg, transparent, rgba(140,180,255,0.55), transparent)",
  scanLineHotCss: "linear-gradient(90deg, transparent, rgba(167,139,250,0.85), transparent)",

  // Shadow recipes
  shadow:         "0 8px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(120,160,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)",
  shadowFloat:    "0 14px 44px rgba(0,0,0,0.55), 0 0 0 1px rgba(120,160,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
  glowCyan:       "0 0 18px rgba(103,232,249,0.30), 0 0 4px rgba(103,232,249,0.85)",
  glowViolet:     "0 0 18px rgba(167,139,250,0.30), 0 0 4px rgba(167,139,250,0.85)",

  // Palette (galaxy aligned)
  cyan:    "#67e8f9",
  violet:  "#a78bfa",
  lilac:   "#c4b5fd",
  icy:     "#7dd3fc",
  pink:    "#f0abfc",
  white:   "#e0e7ff",

  // Text
  textPrimary:   "rgba(224,231,255,0.94)",
  textSecondary: "rgba(180,200,240,0.72)",
  textMuted:     "rgba(140,160,200,0.55)",
  textDim:       "rgba(110,130,170,0.42)",

  // Type
  font:     "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
  fontUi:   "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",

  // Motion
  easeOut:   "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/* ── Domain palette (unified with galaxy) ────────────────────────────── */
export const DOMAIN_COLORS: Record<string, string> = {
  personal: "#f0abfc",
  research: "#7dd3fc",
  reading:  "#c4b5fd",
  business: "#67e8f9",
};

export const TYPE_COLORS: Record<string, string> = {
  concept:          "#7dd3fc",
  person:           "#67e8f9",
  "source-summary": "#c4b5fd",
  synthesis:        "#a78bfa",
  ghost:            "rgba(140,160,200,0.45)",
  meta:             "rgba(150,170,210,0.55)",
  page:             "rgba(150,170,210,0.55)",
};

/* ──────────────────────────────────────────────────────────────────────────
   CornerTicks — angular sci-fi corners for any element
   ────────────────────────────────────────────────────────────────────────── */
export function CornerTicks({
  size = 6,
  inset = 4,
  color = HUD.cornerColor,
  thickness = 1,
}: {
  size?: number;
  inset?: number;
  color?: string;
  thickness?: number;
}) {
  const base: React.CSSProperties = { position: "absolute", width: size, height: size, pointerEvents: "none" };
  const t = `${thickness}px solid ${color}`;
  return (
    <>
      <span style={{ ...base, top: inset,    left: inset,    borderTop: t, borderLeft:  t }} />
      <span style={{ ...base, top: inset,    right: inset,   borderTop: t, borderRight: t }} />
      <span style={{ ...base, bottom: inset, left: inset,    borderBottom: t, borderLeft:  t }} />
      <span style={{ ...base, bottom: inset, right: inset,   borderBottom: t, borderRight: t }} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   ScanLine — top accent gradient line embedded in a panel
   ────────────────────────────────────────────────────────────────────────── */
export function ScanLine({
  position = "top", hot = false, inset = 12,
}: { position?: "top" | "bottom"; hot?: boolean; inset?: number }) {
  return (
    <div style={{
      position: "absolute",
      [position]: 0, left: inset, right: inset,
      height: 1,
      background: hot ? HUD.scanLineHotCss : HUD.scanLineCss,
      pointerEvents: "none",
    }} />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   GlassPanel — base translucent floating container
   ────────────────────────────────────────────────────────────────────────── */
export function GlassPanel({
  children,
  title,
  accent = HUD.icy,
  variant = "default",
  style,
}: {
  children: React.ReactNode;
  title?: string;
  accent?: string;
  variant?: "default" | "strong" | "light";
  style?: React.CSSProperties;
}) {
  const bg = variant === "strong" ? HUD.bgPanelStrong
           : variant === "light"  ? HUD.bgPanelLight
                                  : HUD.bgPanel;
  return (
    <div style={{
      position: "relative",
      background: bg,
      backdropFilter: HUD.blur,
      WebkitBackdropFilter: HUD.blur,
      border: HUD.border,
      borderRadius: 8,
      padding: title ? "13px 16px 16px" : "14px 16px",
      boxShadow: HUD.shadow,
      overflow: "hidden",
      ...style,
    }}>
      <ScanLine />
      <CornerTicks />

      {title && <PanelHeader title={title} accent={accent} />}
      {children}
    </div>
  );
}

export function PanelHeader({ title, accent = HUD.icy }: { title: string; accent?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{
        width: 4, height: 4, borderRadius: 1,
        background: accent,
        boxShadow: `0 0 8px ${accent}aa`,
      }} />
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
        color: HUD.textPrimary,
        fontFamily: HUD.font,
        textTransform: "uppercase" as const,
      }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(140,180,255,0.08)" }} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   HudButton — base pill/rect button with neon glow
   ────────────────────────────────────────────────────────────────────────── */
interface HudButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  accent?: string;
  shape?: "pill" | "rect";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}
export function HudButton({
  children, onClick, active = false,
  accent = HUD.icy, shape = "rect", size = "md", icon, title, style, disabled,
}: HudButtonProps) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  const padding = size === "sm" ? "5px 10px" : "7px 14px";
  const fontSize = size === "sm" ? 9 : 10;
  const borderRadius = shape === "pill" ? 999 : 5;

  const showHover = hover && !disabled;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title={title}
      disabled={disabled}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: icon ? 7 : 0,
        padding,
        background: active
          ? `${accent}15`
          : showHover ? "rgba(140,180,255,0.06)" : "rgba(7,11,26,0.4)",
        backdropFilter: HUD.blur,
        WebkitBackdropFilter: HUD.blur,
        border: active
          ? `1px solid ${accent}66`
          : showHover ? HUD.borderHover : HUD.border,
        borderRadius,
        color: active ? accent : showHover ? HUD.textPrimary : HUD.textSecondary,
        fontSize, fontWeight: 700,
        letterSpacing: "0.14em",
        fontFamily: HUD.font,
        textTransform: "uppercase" as const,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transform: pressed ? "scale(0.97)" : showHover ? "scale(1.02)" : "scale(1)",
        transition: `all 0.22s ${HUD.easeOut}`,
        boxShadow: active
          ? `0 0 0 1px ${accent}22, 0 6px 22px ${accent}30, 0 0 18px ${accent}40, inset 0 1px 0 rgba(255,255,255,0.06)`
          : showHover
            ? `0 0 0 1px rgba(167,139,250,0.10), 0 4px 18px rgba(0,0,0,0.45), 0 0 14px rgba(167,139,250,0.18), inset 0 1px 0 rgba(255,255,255,0.05)`
            : `0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)`,
        overflow: "hidden",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {/* Top scanning line */}
      <span style={{
        position: "absolute", top: 0, left: 8, right: 8, height: 1,
        background: active || showHover ? HUD.scanLineHotCss : HUD.scanLineCss,
        pointerEvents: "none",
        opacity: active || showHover ? 1 : 0.6,
        transition: "opacity 0.2s",
      }} />
      {icon}
      {children}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   HexButton — hexagonal HUD control (for gesture mode etc.)
   ────────────────────────────────────────────────────────────────────────── */
export function HexButton({
  active = false,
  onClick,
  title,
  accent = HUD.icy,
  size = 44,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  accent?: string;
  size?: number;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const c = active ? accent : hover ? HUD.violet : HUD.cornerColor;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        position: "relative",
        width: size, height: size,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: active ? accent : hover ? HUD.textPrimary : HUD.textSecondary,
        transition: `all 0.22s ${HUD.easeOut}`,
        transform: hover ? "scale(1.06)" : "scale(1)",
        padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        filter: active
          ? `drop-shadow(0 0 14px ${accent}cc) drop-shadow(0 0 4px ${accent})`
          : hover
            ? `drop-shadow(0 0 10px ${HUD.violet}80)`
            : "drop-shadow(0 4px 12px rgba(0,0,0,0.55))",
      }}
    >
      {/* Hexagon backdrop */}
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="hex-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={active ? `${accent}38` : "rgba(7,11,26,0.55)"} />
            <stop offset="100%" stopColor={active ? `${accent}18` : "rgba(7,11,26,0.4)"} />
          </linearGradient>
        </defs>
        <polygon
          points="50,3 92,26 92,74 50,97 8,74 8,26"
          fill="url(#hex-fill)"
          stroke={c}
          strokeWidth={active ? 1.6 : 1.2}
          style={{
            filter: `drop-shadow(0 0 ${active ? 8 : 4}px ${c}90)`,
            transition: `all 0.22s ${HUD.easeOut}`,
          }}
        />
        {/* Inner inset hex (decorative) */}
        <polygon
          points="50,18 78,33 78,67 50,82 22,67 22,33"
          fill="none"
          stroke={c}
          strokeWidth={0.6}
          opacity={active ? 0.55 : hover ? 0.35 : 0.18}
        />
        {/* Pulse ring for active */}
        {active && (
          <polygon
            points="50,3 92,26 92,74 50,97 8,74 8,26"
            fill="none"
            stroke={accent}
            strokeWidth={1}
            opacity={0.45}
            style={{ transformOrigin: "center", animation: "hexPulse 2.2s ease-in-out infinite" }}
          />
        )}
      </svg>
      <span style={{ position: "relative", zIndex: 1, display: "flex" }}>{children}</span>
      <style>{`
        @keyframes hexPulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%      { opacity: 0;    transform: scale(1.18); }
        }
      `}</style>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   useCountUp — animated number tween (eased)
   ────────────────────────────────────────────────────────────────────────── */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function useCountUp(value: number, durationMs = 900): number {
  const [v, setV] = useState(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const e = easeInOutCubic(t);
      setV(from + (to - from) * e);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return v;
}
