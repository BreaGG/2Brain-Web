"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import type { ParsedPage } from "@/lib/types";

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

const TYPE_DOT: Record<string, string> = {
  concept:          "#4f9cf9",
  person:           "#4ade80",
  "source-summary": "#facc15",
  synthesis:        "#c084fc",
};

const TYPE_LABEL: Record<string, string> = {
  concept:          "CONCEPT",
  person:           "PERSON",
  "source-summary": "SOURCE",
  synthesis:        "SYNTHESIS",
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
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
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%", maxWidth: 580,
          borderRadius: 6, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(3,5,12,0.97)",
          boxShadow: "0 0 0 1px rgba(79,156,249,0.08), 0 40px 80px rgba(0,0,0,0.97)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top accent bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent 0%, rgba(79,156,249,0.6) 50%, transparent 100%)",
        }} />

        {/* Corner brackets */}
        <div style={{ position: "absolute", top: -1, left: -1, width: 12, height: 12, borderTop: "1px solid rgba(79,156,249,0.5)", borderLeft: "1px solid rgba(79,156,249,0.5)" }} />
        <div style={{ position: "absolute", top: -1, right: -1, width: 12, height: 12, borderTop: "1px solid rgba(79,156,249,0.5)", borderRight: "1px solid rgba(79,156,249,0.5)" }} />

        {/* Input row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <svg width="13" height="13" fill="none" stroke="#3f3f46" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge base…"
            style={{
              flex: 1, background: "transparent",
              border: "none", outline: "none",
              color: "#e8e8e8", fontSize: 14,
              letterSpacing: "0.01em",
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter")     go(cursor);
            }}
          />
          <kbd style={{
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3,
            padding: "2px 6px", fontSize: 10, color: "#3f3f46",
            fontFamily: "monospace", background: "rgba(255,255,255,0.02)",
          }}>ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul style={{ padding: "5px 0", maxHeight: 380, overflowY: "auto" }}>
            {results.map((r, i) => {
              const dot   = TYPE_DOT[r.item.type]   ?? "#71717a";
              const label = TYPE_LABEL[r.item.type] ?? r.item.type.toUpperCase();
              const active = i === cursor;
              return (
                <li key={r.item.slug}>
                  <button
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "10px 16px",
                      display: "flex", alignItems: "center", gap: 12,
                      background: active ? "rgba(79,156,249,0.05)" : "transparent",
                      border: "none", cursor: "pointer",
                      borderLeft: `2px solid ${active ? dot : "transparent"}`,
                      transition: "all 0.1s",
                    }}
                    onClick={() => go(i)}
                    onMouseEnter={() => setCursor(i)}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: dot, flexShrink: 0,
                      boxShadow: active ? `0 0 8px ${dot}cc` : "none",
                      transition: "box-shadow 0.15s",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        color: active ? "#fff" : "#a1a1aa",
                        fontSize: 13, fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {r.item.title}
                      </p>
                      {r.item.excerpt && (
                        <p style={{
                          color: "#2d2d2d", fontSize: 11, marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.item.excerpt}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: dot, fontFamily: "monospace", letterSpacing: "0.1em" }}>{label}</span>
                      {r.item.domain[0] && (
                        <span style={{ fontSize: 9, color: DOMAIN_COLORS[r.item.domain[0]] ?? "#52525b", fontFamily: "monospace", letterSpacing: "0.08em" }}>
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
          <p style={{ padding: "32px 0", textAlign: "center", color: "#3f3f46", fontSize: 12, fontFamily: "monospace", letterSpacing: "0.04em" }}>
            NO RESULTS — &ldquo;{query}&rdquo;
          </p>
        ) : (
          <p style={{ padding: "32px 0", textAlign: "center", color: "#1f1f1f", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.06em" }}>
            {pages.length} NODES INDEXED
          </p>
        )}

        {/* Footer hint */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "8px 16px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.4)",
        }}>
          {[["↑↓", "navigate"], ["↵", "open"], ["esc", "close"]].map(([key, hint]) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <kbd style={{
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3,
                padding: "1px 5px", fontSize: 9, color: "#52525b",
                fontFamily: "monospace", background: "rgba(255,255,255,0.02)",
              }}>{key}</kbd>
              <span style={{ fontSize: 9, color: "#2a2a2a", letterSpacing: "0.05em" }}>{hint}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
