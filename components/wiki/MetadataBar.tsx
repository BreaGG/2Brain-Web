"use client";

import type { ParsedPage } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  concept:          "#7dd3fc",
  person:           "#67e8f9",
  "source-summary": "#c4b5fd",
  synthesis:        "#a78bfa",
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#f0abfc",
  research: "#7dd3fc",
  reading:  "#c4b5fd",
  business: "#67e8f9",
};

interface Props {
  page: ParsedPage;
  slugMap: Record<string, string>;
}

export default function MetadataBar({ page, slugMap }: Props) {
  return (
    <div
      style={{
        marginBottom: 36,
        padding: "14px 18px",
        borderRadius: 6,
        border: "1px solid rgba(140,180,255,0.10)",
        background: "rgba(140,180,255,0.025)",
        display: "flex", flexWrap: "wrap",
        gap: "10px 24px", alignItems: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Type */}
      <Field label="Type">
        <TypeChip type={page.type} />
      </Field>

      {/* Domain */}
      {page.domain.length > 0 && (
        <Field label="Domain">
          <div style={{ display: "flex", gap: 4 }}>
            {page.domain.map((d) => {
              const c = DOMAIN_COLORS[d] ?? "rgba(200,215,255,0.78)";
              return (
                <span
                  key={d}
                  style={{
                    color: c,
                    border: `1px solid ${c}33`,
                    borderRadius: 3,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "capitalize" as const,
                    letterSpacing: "0.02em",
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                >
                  {d}
                </span>
              );
            })}
          </div>
        </Field>
      )}

      {/* Sources */}
      {page.sources.length > 0 && (
        <Field label="Sources">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {page.sources.map((src) => {
              const resolved = slugMap[src];
              return resolved ? (
                <SourceLink key={src} src={src} resolved={resolved} />
              ) : (
                <span
                  key={src}
                  style={{
                    color: "rgba(140,160,200,0.55)",
                    border: "1px dashed rgba(140,160,200,0.30)",
                    borderRadius: 3,
                    padding: "2px 8px",
                    fontSize: 11,
                  }}
                >
                  {src}
                </span>
              );
            })}
          </div>
        </Field>
      )}

      {/* Last updated */}
      {page.lastUpdated && (
        <Field label="Updated" style={{ marginLeft: "auto" }}>
          <span style={{
            color: "rgba(220,228,245,0.85)",
            fontSize: 11.5,
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            letterSpacing: "0.04em",
          }}>
            {page.lastUpdated}
          </span>
        </Field>
      )}
    </div>
  );
}

function TypeChip({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? "rgba(200,215,255,0.78)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: c,
        border: `1px solid ${c}33`,
        borderRadius: 3,
        padding: "2px 9px",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.02em",
        fontFamily: "Inter, system-ui, sans-serif",
        textTransform: "capitalize" as const,
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: c,
        boxShadow: `0 0 6px ${c}66`,
      }} />
      {type}
    </span>
  );
}

function SourceLink({ src, resolved }: { src: string; resolved: string }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={`/wiki/${resolved}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: hover ? "#a78bfa" : "#7dd3fc",
        border: `1px solid ${hover ? "rgba(167,139,250,0.50)" : "rgba(125,211,252,0.28)"}`,
        borderRadius: 3,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        textDecoration: "none",
        letterSpacing: "0.01em",
        transition: "color 0.18s, border-color 0.18s",
        display: "inline-block",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {src}
    </Link>
  );
}

function Field({
  label,
  children,
  style,
}: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
      <span
        style={{
          fontSize: 10,
          color: "rgba(180,200,240,0.55)",
          letterSpacing: "0.10em",
          fontWeight: 600,
          textTransform: "uppercase" as const,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
