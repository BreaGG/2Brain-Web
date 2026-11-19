"use client";

import type { CSSProperties, ReactNode } from "react";

/* ── icons (1px strokes, square caps) ─────────────────────────────────────── */

type IconName =
  | "search"
  | "ask"
  | "close"
  | "sliders"
  | "pulse"
  | "chev"
  | "chevr"
  | "plus"
  | "tag"
  | "cycle"
  | "doc"
  | "sort"
  | "out"
  | "expand"
  | "menu"
  | "copy"
  | "galaxy"
  | "play"
  | "pause"
  | "camera";

export function Icon({ name, size = 14, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    style,
    "aria-hidden": true,
  } as const;
  switch (name) {
    case "search":
      return (
        <svg {...p}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.4 10.4 14 14" />
        </svg>
      );
    case "ask":
      return (
        <svg {...p}>
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      );
    case "close":
      return (
        <svg {...p}>
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...p}>
          <path d="M2 4.5h12M2 8h12M2 11.5h12" />
          <rect x="9" y="3" width="2.4" height="3" fill="currentColor" stroke="none" />
          <rect x="4.5" y="6.5" width="2.4" height="3" fill="currentColor" stroke="none" />
          <rect x="10" y="10" width="2.4" height="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...p}>
          <path d="M1.5 9h3l1.5-4 2.5 7 1.8-5 1.2 2h3" />
        </svg>
      );
    case "chev":
      return (
        <svg {...p}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      );
    case "chevr":
      return (
        <svg {...p}>
          <path d="M6 4l4 4-4 4" />
        </svg>
      );
    case "plus":
      return (
        <svg {...p}>
          <path d="M8 2.5v11M2.5 8h11" />
        </svg>
      );
    case "tag":
      return (
        <svg {...p}>
          <path d="M2.5 2.5h5.5l5.5 5.5-5.5 5.5-5.5-5.5z" />
          <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cycle":
      return (
        <svg {...p}>
          <path d="M12.8 6.5A5 5 0 0 0 3.6 5M3.2 9.5a5 5 0 0 0 9.2 1.5" />
          <path d="M3.2 2.5V5.2H6M12.8 13.5v-2.7H10" />
        </svg>
      );
    case "doc":
      return (
        <svg {...p}>
          <path d="M3.5 1.5h6l3 3v10h-9z" />
          <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5" />
        </svg>
      );
    case "sort":
      return (
        <svg {...p}>
          <path d="M4.5 2.5v11M2.5 11.5l2 2 2-2M9 4h5M9 7.5h3.5M9 11h2" />
        </svg>
      );
    case "out":
      return (
        <svg {...p}>
          <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v4h-9v-9h4" />
        </svg>
      );
    case "expand":
      return (
        <svg {...p}>
          <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
        </svg>
      );
    case "menu":
      return (
        <svg {...p}>
          <path d="M2 4.5h12M2 8h12M2 11.5h12" />
        </svg>
      );
    case "galaxy":
      return (
        <svg {...p}>
          <path d="M8 8c0-1.6 1.6-2.4 3-1.6 1.8 1 1.6 3.9-.5 5-2.7 1.4-6-.4-6.4-3.4C3.7 4.6 7 1.9 10.6 2.6" />
          <path d="M8 8c0 1.6-1.6 2.4-3 1.6-1.8-1-1.6-3.9.5-5 2.7-1.4 6 .4 6.4 3.4.4 3.4-2.9 6.1-6.5 5.4" />
          <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "play":
      return (
        <svg {...p}>
          <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "pause":
      return (
        <svg {...p}>
          <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "camera":
      return (
        <svg {...p}>
          <path d="M1.5 4.5h3l1.2-2h4.6l1.2 2h3v9h-13z" />
          <circle cx="8" cy="8.7" r="2.6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...p}>
          <rect x="5" y="5" width="8.5" height="8.5" />
          <path d="M11 5V2.5H2.5V11H5" />
        </svg>
      );
  }
}

/** The 2Brain mark: a brain of dots. */
export function BrainMark({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  const dots = [
    [5, 4], [8, 3], [11, 4], [3.5, 6.5], [6.5, 6], [9.5, 6], [12.5, 6.5],
    [3, 9], [5.5, 9], [8, 8.5], [10.5, 9], [13, 9], [4.5, 11.5], [7, 11], [9.5, 11.5], [12, 11], [9, 13.5],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.85} fill={color} />
      ))}
      <path d="M5 4 8 3 11 4M3.5 6.5 6.5 6 9.5 6 12.5 6.5M3 9 5.5 9 8 8.5 10.5 9 13 9M6.5 6 8 8.5 9.5 6M9.5 11.5 9 13.5" stroke={color} strokeWidth="0.4" opacity="0.6" fill="none" />
    </svg>
  );
}

export function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={`wordmark${big ? " big" : ""}`}>
      <BrainMark size={big ? 24 : 17} />
      <span>
        <b>2</b>brain
      </span>
    </span>
  );
}

/* ── controls ─────────────────────────────────────────────────────────────── */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function SwitchRow({ label, on, onChange, note }: { label: ReactNode; on: boolean; onChange: (v: boolean) => void; note?: ReactNode }) {
  return (
    <div className="switch-row">
      <span>
        {label}
        {note != null && <small>{note}</small>}
      </span>
      <Switch on={on} onChange={onChange} label={typeof label === "string" ? label : "Toggle"} />
    </div>
  );
}

export function Range({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  className = "range",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={className}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--p": `${p}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  style,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  style?: CSSProperties;
}) {
  return (
    <span className="select" style={style}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chev" size={11} />
    </span>
  );
}

export function PaneHead({
  title,
  accent,
  onClose,
  tools,
}: {
  title: ReactNode;
  accent: string;
  onClose: () => void;
  tools?: ReactNode;
}) {
  return (
    <div className="pane-head">
      <div style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        <i className={`dash${accent === "spectrum" ? " spectrum" : ""}`} style={{ "--accent": accent } as CSSProperties} />
      </div>
      <div className="pane-head-tools">
        {tools}
        <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}

export function Sect({ label, accent, children, aside }: { label: ReactNode; accent?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="sect" style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}>
      <div className="label" style={{ justifyContent: "space-between" }}>
        <span>{label}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Dot({ c, hollow = false }: { c: string; hollow?: boolean }) {
  return (
    <i
      className="dot"
      style={hollow ? { background: "transparent", border: "1px solid var(--ink)" } : ({ "--c": c } as CSSProperties)}
    />
  );
}
