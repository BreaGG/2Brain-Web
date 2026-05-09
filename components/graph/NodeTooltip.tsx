"use client";

import { createPortal } from "react-dom";
import type { GraphNode } from "@/lib/types";

const TYPE_BADGE_COLORS: Record<string, string> = {
  concept: "bg-blue-500/20 text-blue-300",
  person: "bg-emerald-500/20 text-emerald-300",
  "source-summary": "bg-amber-500/20 text-amber-300",
  synthesis: "bg-violet-500/20 text-violet-300",
  ghost: "bg-slate-500/20 text-slate-400",
};

interface Props {
  node: GraphNode;
  x: number;
  y: number;
}

export default function NodeTooltip({ node, x, y }: Props) {
  const badgeClass = TYPE_BADGE_COLORS[node.type] ?? "bg-slate-500/20 text-slate-400";
  const OFFSET = 14;

  return createPortal(
    <div
      style={{ left: x + OFFSET, top: y + OFFSET, pointerEvents: "none" }}
      className="fixed z-50 max-w-xs rounded-lg border border-white/10 bg-[var(--bg-secondary)] p-3 shadow-xl text-sm"
    >
      <p className="font-semibold text-[var(--text-primary)] mb-1">{node.label}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badgeClass}`}>
          {node.type}
        </span>
        {node.domain.map((d) => (
          <span key={d} className="rounded px-1.5 py-0.5 text-xs bg-white/5 text-[var(--text-muted)]">
            {d}
          </span>
        ))}
        {node.broken && (
          <span className="rounded px-1.5 py-0.5 text-xs bg-red-500/10 text-red-400">
            not created yet
          </span>
        )}
      </div>
      <p className="text-[var(--text-muted)] text-xs">{node.degree} connection{node.degree !== 1 ? "s" : ""}</p>
    </div>,
    document.body
  );
}
