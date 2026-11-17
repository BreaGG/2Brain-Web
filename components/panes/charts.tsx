"use client";

import { useMemo, useState } from "react";
import { monthLabel } from "@/lib/brain";

export function Sparkline({ values, width = 96, height = 26, color = "var(--ink)" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 1 - (v / max) * (height - 3)).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1" />
      <path d={`M0,${height - 0.5}H${width}`} stroke="var(--hair)" />
    </svg>
  );
}

export interface Series {
  key: string;
  label: string;
  color: string;
  hollow?: boolean;
}

/**
 * Stacked monthly bars. `data[m][s]` = value of series s in month m.
 * Hovering shows the month; clicking calls onPick(monthIndex).
 */
export function StackedBars({
  months,
  series,
  data,
  height = 120,
  onPick,
  picked,
}: {
  months: number[];
  series: Series[];
  data: number[][];
  height?: number;
  onPick?: (m: number) => void;
  picked?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 470;
  const H = height;
  const totals = data.map((row) => row.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const bw = W / Math.max(1, months.length);
  const ticks = useMemo(() => {
    const every = Math.max(1, Math.ceil(months.length / 6));
    return months.map((m, i) => (i % every === 0 ? i : -1)).filter((i) => i >= 0);
  }, [months]);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Stacked bars by month">
      {data.map((row, m) => {
        let y = H;
        return (
          <g
            key={m}
            onMouseEnter={() => setHover(m)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick?.(m)}
            style={{ cursor: onPick ? "pointer" : undefined }}
            opacity={picked != null && picked !== m ? 0.35 : 1}
          >
            <rect x={m * bw} y={0} width={bw} height={H} fill="transparent" />
            {row.map((v, s) => {
              if (!v) return null;
              const h = (v / max) * (H - 6);
              y -= h;
              const ser = series[s];
              return ser.hollow ? (
                <rect key={s} x={m * bw + 1.5} y={y + 0.5} width={Math.max(1, bw - 3)} height={Math.max(0.5, h - 1)} fill="none" stroke="var(--ink)" strokeWidth="1" />
              ) : (
                <rect key={s} x={m * bw + 1} y={y} width={Math.max(1, bw - 2)} height={h} fill={ser.color} />
              );
            })}
            {(hover === m || picked === m) && <rect x={m * bw + 0.5} y={H - (totals[m] / max) * (H - 6) - 3} width={bw - 1} height={1} fill="var(--ink)" />}
          </g>
        );
      })}
      <path className="axis" d={`M0,${H + 0.5}H${W}`} />
      {ticks.map((i) => (
        <text key={i} x={i * bw} y={H + 13}>
          {monthLabel(months[i]).replace(/(\w+) (\d+)/, "$1 $2")}
        </text>
      ))}
      {hover != null && (
        <text x={W} y={10} textAnchor="end">
          {monthLabel(months[hover])} · {totals[hover]}
        </text>
      )}
    </svg>
  );
}

export { squarify } from "@/lib/squarify";
