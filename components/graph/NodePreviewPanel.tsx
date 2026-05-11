"use client";

import { useEffect, useState } from "react";
import type { GraphNode, ParsedPage } from "@/lib/types";
import { HUD, CornerTicks, ScanLine, DOMAIN_COLORS, TYPE_COLORS } from "@/components/hud/primitives";

const MOBILE_BP = 768;

const TYPE_LABEL: Record<string, string> = {
  concept:          "CONCEPT",
  person:           "PERSON",
  "source-summary": "SOURCE",
  synthesis:        "SYNTHESIS",
  ghost:            "GHOST",
  meta:             "META",
  page:             "PAGE",
};

interface Props {
  node: GraphNode | null;
  page: ParsedPage | null;
}

export default function NodePreviewPanel({ node, page }: Props) {
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
    if (node) { setShownNode(node); setShownPage(page); }
  }, [node, page]);

  const visible = !!node;
  const display = shownNode;
  const displayPage = shownPage;
  const c = display ? (TYPE_COLORS[display.type] ?? HUD.textMuted) : HUD.textMuted;
  const label = display ? (TYPE_LABEL[display.type] ?? display.type.toUpperCase()) : "PAGE";

  const mobileStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 12, left: 12, right: 12,
    zIndex: 20, pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(14px)",
    transition: `opacity 0.22s ${HUD.easeOut}, transform 0.22s ${HUD.easeOut}`,
  };
  const desktopStyle: React.CSSProperties = {
    position: "absolute",
    top: 200, left: 28,
    width: 360,
    maxWidth: "calc(50vw - 48px)",
    zIndex: 20, pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateX(0)" : "translateX(-12px)",
    transition: `opacity 0.22s ${HUD.easeOut}, transform 0.22s ${HUD.easeOut}`,
  };

  return (
    <div style={isMobile ? mobileStyle : desktopStyle}>
      <div
        style={{
          position: "relative",
          background: HUD.bgPanel,
          border: `1px solid ${c}30`,
          borderRadius: 8,
          padding: "14px 16px 14px",
          backdropFilter: HUD.blur,
          WebkitBackdropFilter: HUD.blur,
          boxShadow: `${HUD.shadow}, 0 0 30px ${c}14`,
          overflow: "hidden",
        }}
      >
        <ScanLine />
        <ScanLine position="bottom" />
        <CornerTicks color={`${c}88`} />

        {display && (
          <>
            {/* Header strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: c,
                boxShadow: `0 0 10px ${c}, 0 0 4px ${c}`,
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.2em",
                color: c, fontFamily: HUD.font,
              }}>
                {label}
              </span>
              <span style={{ flex: 1 }} />
              {display.domain.slice(0, 2).map((d) => {
                const dc = DOMAIN_COLORS[d] ?? HUD.textMuted;
                return (
                  <span
                    key={d}
                    style={{
                      fontSize: 8, color: dc,
                      letterSpacing: "0.18em",
                      fontFamily: HUD.font,
                      textTransform: "uppercase" as const,
                      padding: "2px 7px",
                      border: `1px solid ${dc}33`,
                      borderRadius: 3,
                      boxShadow: `0 0 8px ${dc}22`,
                    }}
                  >
                    {d}
                  </span>
                );
              })}
            </div>

            {/* Title */}
            <h2 style={{
              color: HUD.textPrimary,
              fontWeight: 600, fontSize: 18,
              lineHeight: 1.30, marginBottom: 10,
              letterSpacing: "-0.005em",
              fontFamily: HUD.fontUi,
            }}>
              {display.label}
            </h2>

            {/* Excerpt */}
            {displayPage?.excerpt && (
              <p style={{
                color: HUD.textSecondary,
                fontSize: 12.5, lineHeight: 1.55,
                marginBottom: 14,
                fontFamily: HUD.fontUi,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {displayPage.excerpt}
              </p>
            )}

            {/* Separator */}
            <div style={{
              height: 1,
              background: `linear-gradient(90deg, ${c}26, transparent 80%)`,
              marginBottom: 12,
            }} />

            {/* Stats */}
            <div style={{ display: "flex", gap: 18, marginBottom: displayPage?.sources && displayPage.sources.length > 0 ? 12 : 4 }}>
              <Stat label="LINKS"   value={String(display.degree)} accent={c} />
              {displayPage?.lastUpdated && <Stat label="UPDATED" value={displayPage.lastUpdated} accent={c} />}
              {displayPage?.sources && displayPage.sources.length > 0 && (
                <Stat label="SOURCES" value={String(displayPage.sources.length)} accent={c} />
              )}
            </div>

            {/* Sources */}
            {displayPage?.sources && displayPage.sources.length > 0 && (
              <div style={{
                fontSize: 9.5, color: HUD.textMuted,
                fontFamily: HUD.font, letterSpacing: "0.05em",
                lineHeight: 1.5,
                display: "flex", flexWrap: "wrap", gap: 4,
              }}>
                {displayPage.sources.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "2px 7px",
                      border: "1px solid rgba(140,180,255,0.12)",
                      borderRadius: 3,
                      background: "rgba(140,180,255,0.03)",
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
                  <span style={{ padding: "2px 7px", color: HUD.textDim }}>
                    +{displayPage.sources.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div style={{
              marginTop: 14, paddingTop: 10,
              borderTop: "1px solid rgba(140,180,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{
                fontSize: 8.5, color: HUD.textDim,
                fontFamily: HUD.font, letterSpacing: "0.1em",
                maxWidth: 200,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {display.broken ? "◌ GHOST NODE" : `▸ ${display.id}`}
              </span>
              {!display.broken && (
                <span style={{
                  fontSize: 8.5, fontFamily: HUD.font,
                  letterSpacing: "0.18em", fontWeight: 700,
                  color: c,
                  display: "flex", alignItems: "center", gap: 4,
                  textShadow: `0 0 10px ${c}88`,
                }}>
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

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <p style={{
        fontSize: 7.5, color: HUD.textMuted,
        letterSpacing: "0.2em", fontFamily: HUD.font,
        fontWeight: 700, marginBottom: 3,
      }}>{label}</p>
      <p style={{
        fontSize: 13, color: accent,
        fontFamily: HUD.font, fontWeight: 600,
        textShadow: `0 0 10px ${accent}66`,
      }}>{value}</p>
    </div>
  );
}
