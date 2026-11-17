/* Data colours and colour themes (the VIEW panel's Appearance + Data colours). */

export type PaletteId = "default" | "lava" | "ocean" | "forest" | "aurora" | "mono" | "sunset";
export type ThemeId = "original" | "midnight" | "graphite" | "pine" | "plum" | "ember";

export const SPECTRUM = ["#FF5A5F", "#FF9F1C", "#FFE14D", "#7CFF6B", "#2EE6D6", "#4DA3FF", "#9B7BFF", "#FF6BD6"];

export const PALETTES: { id: PaletteId; label: string; stops: string[]; discrete?: boolean }[] = [
  { id: "default", label: "Default", stops: SPECTRUM, discrete: true },
  { id: "lava", label: "Lava", stops: ["#7d0a14", "#c81d25", "#f0472c", "#ff7b2e", "#ffb15e", "#ffe2a8", "#fff6e3"] },
  { id: "ocean", label: "Ocean", stops: ["#0a2f7a", "#1655c4", "#2f86e0", "#3fb7e6", "#7fdcef", "#c9f4f7"] },
  { id: "forest", label: "Forest", stops: ["#123d2a", "#22663f", "#3a9356", "#6cc070", "#b2df8a", "#f0f5a0"] },
  { id: "aurora", label: "Aurora", stops: ["#6b2ff2", "#b14cf0", "#f052b0", "#3fb8f5", "#21f0c8", "#a6f56a"] },
  { id: "mono", label: "Mono", stops: ["#4a4a4a", "#7a7a7a", "#a8a8a8", "#d2d2d2", "#ffffff"] },
  { id: "sunset", label: "Sunset", stops: ["#5b0a6e", "#a4195f", "#e0384a", "#f6762c", "#fbb346", "#ffe49c"] },
];

export const THEMES: { id: ThemeId; label: string; bg: string }[] = [
  { id: "original", label: "Original", bg: "#000000" },
  { id: "midnight", label: "Midnight", bg: "#050a19" },
  { id: "graphite", label: "Graphite", bg: "#121315" },
  { id: "pine", label: "Pine", bg: "#03120c" },
  { id: "plum", label: "Plum", bg: "#11061b" },
  { id: "ember", label: "Ember", bg: "#150604" },
];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function sample(stops: string[], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Colour of group `i` out of `n` for a palette, as linear-ish 0..1 RGB. */
export function groupRgb(palette: PaletteId, i: number, n: number): [number, number, number] {
  const p = PALETTES.find((x) => x.id === palette) ?? PALETTES[0];
  if (p.discrete) {
    const base = hexToRgb(p.stops[i % p.stops.length]);
    const round = Math.floor(i / p.stops.length);
    if (!round) return base;
    // Later rounds: blend towards white / grey so repeated hues stay distinguishable.
    const k = round % 2 ? 0.45 : 0.3;
    const to = round % 2 ? 1 : 0.55;
    return [base[0] + (to - base[0]) * k, base[1] + (to - base[1]) * k, base[2] + (to - base[2]) * k];
  }
  const m = Math.min(n, 10);
  if (m <= 1) return sample(p.stops, 0.55);
  const t = (i % m) / (m - 1);
  return sample(p.stops, 0.08 + t * 0.92);
}

export function rgbCss([r, g, b]: [number, number, number]) {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

export function groupCss(palette: PaletteId, i: number, n: number) {
  return rgbCss(groupRgb(palette, i, n));
}

export function paletteGradient(id: PaletteId) {
  const p = PALETTES.find((x) => x.id === id) ?? PALETTES[0];
  return `linear-gradient(90deg, ${p.stops.join(", ")})`;
}
