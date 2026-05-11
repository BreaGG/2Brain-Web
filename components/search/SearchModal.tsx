"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import type { ParsedPage } from "@/lib/types";
import { HUD, CornerTicks, ScanLine, DOMAIN_COLORS, TYPE_COLORS } from "@/components/hud/primitives";

interface Props {
  pages: ParsedPage[];
  open: boolean;
  onClose: () => void;
}

const FUSE_OPTIONS = {
  keys: [
    { name: "title",       weight: 0.4 },
    { name: "excerpt",     weight: 0.3 },
    { name: "type",        weight: 0.1 },
    { name: "domain",      weight: 0.1 },
    { name: "bodyContent", weight: 0.1 },
  ],
  threshold: 0.35,
  includeMatches: true,
  minMatchCharLength: 2,
};

const TYPE_LABEL: Record<string, string> = {
  concept:          "CONCEPT",
  person:           "PERSON",
  "source-summary": "SOURCE",
  synthesis:        "SYNTHESIS",
};

export default function SearchModal({ pages, open, onClose }: Props) {
  const [query, setQuery]   = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  const fuse    = useRef(new Fuse(pages, FUSE_OPTIONS));
  const results = query.length >= 2 ? fuse.current.search(query).slice(0, 8) : [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else inputRef.current?.focus();
      }
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery("");
  }, [open]);

  useEffect(() => { setCursor(0); }, [query]);

  const go = useCallback((idx: number) => {
    const r = results[idx];
    if (r) { router.push(`/wiki/${r.item.slug}`); onClose(); setQuery(""); }
  }, [results, router, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh",
        background: "rgba(2,4,12,0.62)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        animation: `searchFade 0.18s ${HUD.easeOut}`,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          width: "100%", maxWidth: 620,
          borderRadius: 10, overflow: "hidden",
          border: HUD.border,
          background: HUD.bgPanelStrong,
          backdropFilter: HUD.blurStrong,
          WebkitBackdropFilter: HUD.blurStrong,
          boxShadow: "0 30px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(120,160,255,0.06), 0 0 50px rgba(167,139,250,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
          animation: `searchPop 0.26s ${HUD.easeOut}`,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <ScanLine />
        <ScanLine position="bottom" />
        <CornerTicks size={8} inset={6} />

        {/* Title strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 18px 8px",
          fontFamily: HUD.font,
        }}>
          <span style={{
            width: 4, height: 4, borderRadius: 1,
            background: HUD.violet,
            boxShadow: `0 0 8px ${HUD.violet}aa`,
          }} />
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.24em",
            color: HUD.textPrimary, textTransform: "uppercase" as const,
          }}>
            GALAXY · SEARCH PROBE
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(140,180,255,0.08)" }} />
          <span style={{
            fontSize: 8, color: HUD.textMuted,
            letterSpacing: "0.18em",
          }}>
            {pages.length} NODES INDEXED
          </span>
        </div>

        {/* Input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 18px 14px",
          borderBottom: "1px solid rgba(140,180,255,0.08)",
        }}>
          <svg width="14" height="14" fill="none" stroke={HUD.cyan} viewBox="0 0 24 24" style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${HUD.cyan}88)` }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan the knowledge galaxy…"
            style={{
              flex: 1, background: "transparent",
              border: "none", outline: "none",
              color: HUD.textPrimary, fontSize: 15,
              letterSpacing: "0.01em",
              fontFamily: HUD.fontUi,
              caretColor: HUD.cyan,
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter")     go(cursor);
            }}
          />
          <kbd style={{
            border: "1px solid rgba(140,180,255,0.18)", borderRadius: 4,
            padding: "2px 7px", fontSize: 9.5, color: HUD.textMuted,
            fontFamily: HUD.font, background: "rgba(7,11,26,0.55)",
            letterSpacing: "0.1em",
          }}>ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul style={{ padding: "6px 0", maxHeight: 420, overflowY: "auto" }}>
            {results.map((r, i) => {
              const dot   = TYPE_COLORS[r.item.type] ?? "#94a3b8";
              const label = TYPE_LABEL[r.item.type] ?? r.item.type.toUpperCase();
              const active = i === cursor;
              return (
                <li key={r.item.slug}>
                  <button
                    style={{
                      position: "relative",
                      width: "100%", textAlign: "left",
                      padding: "11px 18px",
                      display: "flex", alignItems: "center", gap: 14,
                      background: active ? `${dot}0c` : "transparent",
                      border: "none", cursor: "pointer",
                      transition: `all 0.15s ${HUD.easeOut}`,
                      fontFamily: HUD.fontUi,
                    }}
                    onClick={() => go(i)}
                    onMouseEnter={() => setCursor(i)}
                  >
                    {/* Left accent bar */}
                    <span style={{
                      position: "absolute", left: 0, top: "20%", bottom: "20%",
                      width: 2,
                      background: active ? dot : "transparent",
                      boxShadow: active ? `0 0 8px ${dot}` : "none",
                      transition: `all 0.15s ${HUD.easeOut}`,
                    }} />
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: dot, flexShrink: 0,
                      boxShadow: active ? `0 0 10px ${dot}, 0 0 3px ${dot}` : `0 0 5px ${dot}88`,
                      transition: "box-shadow 0.15s",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        color: active ? HUD.textPrimary : HUD.textSecondary,
                        fontSize: 13.5, fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        letterSpacing: "0.005em",
                        transition: "color 0.15s",
                      }}>
                        {r.item.title}
                      </p>
                      {r.item.excerpt && (
                        <p style={{
                          color: HUD.textMuted, fontSize: 11.5, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          fontFamily: HUD.fontUi,
                        }}>
                          {r.item.excerpt}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 8.5, color: dot,
                        fontFamily: HUD.font, letterSpacing: "0.18em",
                        padding: "1.5px 6px",
                        border: `1px solid ${dot}33`,
                        borderRadius: 3,
                      }}>{label}</span>
                      {r.item.domain[0] && (
                        <span style={{
                          fontSize: 8, color: DOMAIN_COLORS[r.item.domain[0]] ?? HUD.textMuted,
                          fontFamily: HUD.font, letterSpacing: "0.18em",
                          textTransform: "uppercase" as const,
                        }}>
                          {r.item.domain[0]}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query.length >= 2 ? (
          <div style={{
            padding: "44px 0 38px", textAlign: "center",
            color: HUD.textMuted, fontSize: 11.5,
            fontFamily: HUD.font, letterSpacing: "0.14em",
          }}>
            ◌ NO SIGNAL · &ldquo;{query}&rdquo;
          </div>
        ) : (
          <div style={{
            padding: "44px 0 38px", textAlign: "center",
            color: HUD.textDim, fontSize: 10.5,
            fontFamily: HUD.font, letterSpacing: "0.2em",
          }}>
            ◇ TYPE TO SCAN · MIN 2 CHARS
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "10px 18px",
          borderTop: "1px solid rgba(140,180,255,0.08)",
          background: "rgba(2,4,12,0.4)",
        }}>
          {[["↑↓", "navigate"], ["↵", "open"], ["esc", "close"]].map(([key, hint]) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <kbd style={{
                border: "1px solid rgba(140,180,255,0.16)", borderRadius: 3,
                padding: "1px 6px", fontSize: 9, color: HUD.textSecondary,
                fontFamily: HUD.font, background: "rgba(7,11,26,0.55)",
                letterSpacing: "0.06em",
              }}>{key}</kbd>
              <span style={{
                fontSize: 9, color: HUD.textMuted, letterSpacing: "0.1em",
                fontFamily: HUD.font,
              }}>{hint}</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes searchFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes searchPop {
          from { opacity: 0; transform: translateY(-8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}
