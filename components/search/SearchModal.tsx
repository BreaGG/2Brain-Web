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
    { name: "title", weight: 0.4 },
    { name: "excerpt", weight: 0.3 },
    { name: "type", weight: 0.1 },
    { name: "domain", weight: 0.1 },
    { name: "bodyContent", weight: 0.1 },
  ],
  threshold: 0.35,
  includeMatches: true,
  minMatchCharLength: 2,
};

export default function SearchModal({ pages, open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const fuse = useRef(new Fuse(pages, FUSE_OPTIONS));
  const results = query.length >= 2 ? fuse.current.search(query).slice(0, 8) : [];

  // Cmd+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else inputRef.current?.focus(); // parent handles opening via onSearchOpen
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

  const go = useCallback(
    (idx: number) => {
      const r = results[idx];
      if (r) {
        router.push(`/wiki/${r.item.slug}`);
        onClose();
        setQuery("");
      }
    },
    [results, router, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl"
        style={{ border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "var(--bg-secondary)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <svg className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wiki…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === "Enter") go(cursor);
            }}
          />
          <kbd className="rounded px-1.5 py-0.5 text-xs" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}>Esc</kbd>
        </div>

        {results.length > 0 ? (
          <ul className="py-1 max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <li key={r.item.slug}>
                <button
                  className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors"
                  style={{ backgroundColor: i === cursor ? "rgba(255,255,255,0.08)" : "transparent" }}
                  onClick={() => go(i)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span
                    className="mt-0.5 rounded px-1.5 py-0.5 text-xs shrink-0"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
                  >
                    {r.item.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.item.title}</p>
                    {r.item.excerpt && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{r.item.excerpt}</p>
                    )}
                  </div>
                  <span className="ml-auto text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    {r.item.domain[0]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : query.length >= 2 ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No results for &ldquo;{query}&rdquo;</p>
        ) : (
          <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Type to search {pages.length} pages
          </p>
        )}
      </div>
    </div>
  );
}
