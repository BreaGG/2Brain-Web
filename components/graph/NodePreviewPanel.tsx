"use client";

import { useEffect, useState } from "react";
import type { GraphNode, ParsedPage } from "@/lib/types";

const MOBILE_BP = 768;

const TYPE_META: Record<string, { dot: string; label: string }> = {
  concept:          { dot: "#4f9cf9", label: "CONCEPT"   },
  person:           { dot: "#4ade80", label: "PERSON"    },
  "source-summary": { dot: "#facc15", label: "SOURCE"    },
  synthesis:        { dot: "#c084fc", label: "SYNTHESIS" },
  ghost:            { dot: "#52525b", label: "GHOST"     },
  meta:             { dot: "#71717a", label: "META"      },
  page:             { dot: "#71717a", label: "PAGE"      },
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
};

interface Props {
  node: GraphNode | null;
  page: ParsedPage | null;
}

export default function NodePreviewPanel({ node, page }: Props) {
  /* Keep last node during fade-out for smooth transition */
  const [shownNode, setShownNode] = useState<GraphNode | null>(null);
  const [shownPage, setShownPage] = useState<ParsedPage | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BP);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    if (node) {
      setShownNode(node);
      setShownPage(page);
    }
  }, [node, page]);

  const visible = !!node;
  const display = shownNode;
  const displayPage = shownPage;
  const meta = display ? (TYPE_META[display.type] ?? { dot: "#71717a", label: display.type.toUpperCase() }) : TYPE_META.page;
  const c = meta.dot;

  /* Mobile: bottom sheet anchored, Desktop: top-left panel */
  const mobileStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    top: "auto",
    width: "auto",
    maxWidth: "none",
    zIndex: 20,
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(14px)",
    transition: "opacity 0.18s ease, transform 0.18s ease",
  };
  const desktopStyle: React.CSSProperties = {
    position: "absolute",
    top: 100,
    left: 24,
    width: 360,
    maxWidth: "calc(50vw - 48px)",
    zIndex: 20,
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateX(0)" : "translateX(-12px)",
    transition: "opacity 0.18s ease, transform 0.18s ease",
  };

  return (
    <div style={isMobile ? mobileStyle : desktopStyle}>
      <div
        style={{
          position: "relative",
          background: "rgba(2,4,10,0.92)",
          border: `1px solid ${c}26`,
          borderRadius: 6,
          padding: "16px 18px 14px",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: `0 0 0 1px ${c}10, 0 28px 64px rgba(0,0,0,0.92), 0 0 40px ${c}10`,
        }}
      >
        {/* Corner brackets */}
        <div style={{ position: "absolute", top: -1, left: -1, width: 11, height: 11, borderTop: `1px solid ${c}80`, borderLeft: `1px solid ${c}80` }} />
        <div style={{ position: "absolute", top: -1, right: -1, width: 11, height: 11, borderTop: `1px solid ${c}40`, borderRight: `1px solid ${c}40` }} />
        <div style={{ position: "absolute", bottom: -1, left: -1, width: 11, height: 11, borderBottom: `1px solid ${c}40`, borderLeft: `1px solid ${c}40` }} />
        <div style={{ position: "absolute", bottom: -1, right: -1, width: 11, height: 11, borderBottom: `1px solid ${c}80`, borderRight: `1px solid ${c}80` }} />

        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 12,
            right: 12,
            height: 1,
            background: `linear-gradient(90deg, transparent, ${c}80, transparent)`,
            pointerEvents: "none",
          }}
        />

        {display && (
          <>
            {/* Type + domains */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: c, flexShrink: 0,
                  boxShadow: `0 0 8px ${c}cc, 0 0 14px ${c}66`,
                }}
              />
              <span
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
                  color: c, fontFamily: "monospace",
                }}
              >
                {meta.label}
              </span>
              <span style={{ flex: 1 }} />
              {display.domain.slice(0, 2).map((d) => (
                <span
                  key={d}
                  style={{
                    fontSize: 9,
                    color: DOMAIN_COLORS[d] ?? "#52525b",
                    letterSpacing: "0.10em",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    border: `1px solid ${DOMAIN_COLORS[d] ?? "#52525b"}33`,
                    borderRadius: 3,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Title */}
            <h2
              style={{
                color: "#f4f4f5",
                fontWeight: 600,
                fontSize: 18,
                lineHeight: 1.30,
                marginBottom: 12,
                letterSpacing: "-0.005em",
              }}
            >
              {display.label}
            </h2>

            {/* Excerpt */}
            {displayPage?.excerpt && (
              <p
                style={{
                  color: "#a1a1aa",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginBottom: 14,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {displayPage.excerpt}
              </p>
            )}

            {/* Separator */}
            <div
              style={{
                height: 1,
                background: `linear-gradient(90deg, ${c}1a, transparent 80%)`,
                marginBottom: 12,
              }}
            />

            {/* Stat row */}
            <div style={{ display: "flex", gap: 16, marginBottom: displayPage?.sources && displayPage.sources.length > 0 ? 12 : 4 }}>
              <Stat label="LINKS"   value={String(display.degree)} />
              {displayPage?.lastUpdated && <Stat label="UPDATED" value={displayPage.lastUpdated} />}
              {displayPage?.sources && displayPage.sources.length > 0 && (
                <Stat label="SOURCES" value={String(displayPage.sources.length)} />
              )}
            </div>

            {/* Sources preview */}
            {displayPage?.sources && displayPage.sources.length > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: "#52525b",
                  fontFamily: "monospace",
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                }}
              >
                {displayPage.sources.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "2px 6px",
                      border: "1px solid #1f1f23",
                      borderRadius: 3,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s}
                  </span>
                ))}
                {displayPage.sources.length > 3 && (
                  <span style={{ padding: "2px 6px", color: "#3f3f46" }}>
                    +{displayPage.sources.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* CTA + ID */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "#3f3f46",
                  fontFamily: "monospace",
                  letterSpacing: "0.05em",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {display.broken ? "○ GHOST NODE" : display.id}
              </span>
              {!display.broken && (
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "monospace",
                    letterSpacing: "0.10em",
                    color: c,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  CLICK · OPEN <span style={{ fontSize: 11 }}>→</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          fontSize: 8,
          fontFamily: "monospace",
          letterSpacing: "0.14em",
          color: "#3f3f46",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "#d4d4d8",
          fontFamily: "monospace",
        }}
      >
        {value}
      </span>
    </div>
  );
}
