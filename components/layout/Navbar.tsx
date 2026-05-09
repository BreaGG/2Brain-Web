"use client";

import Link from "next/link";
import { useTheme } from "@/components/Providers";

interface Props {
  view: "graph" | "list";
  onViewChange: (v: "graph" | "list") => void;
  onSearchOpen: () => void;
}

export default function Navbar({ view, onViewChange, onSearchOpen }: Props) {
  const { theme, toggle } = useTheme();

  return (
    <header className="h-12 flex items-center gap-4 px-4 border-b border-white/8 bg-[var(--bg-secondary)]/80 backdrop-blur-sm shrink-0">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 font-semibold text-[var(--text-primary)] shrink-0">
        <span className="text-[var(--node-concept)]">⬡</span>
        <span>2Brain</span>
      </Link>

      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={onSearchOpen}
        className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/8 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Search
        <kbd className="rounded border border-white/10 px-1 text-[10px]">⌘K</kbd>
      </button>

      {/* View toggle */}
      <div className="flex rounded-md border border-white/10 overflow-hidden">
        <button
          onClick={() => onViewChange("graph")}
          className={`px-3 py-1.5 text-xs transition-colors ${
            view === "graph"
              ? "bg-[var(--node-concept)] text-white"
              : "bg-white/5 text-[var(--text-muted)] hover:bg-white/8"
          }`}
        >
          Graph
        </button>
        <button
          onClick={() => onViewChange("list")}
          className={`px-3 py-1.5 text-xs transition-colors ${
            view === "list"
              ? "bg-[var(--node-concept)] text-white"
              : "bg-white/5 text-[var(--text-muted)] hover:bg-white/8"
          }`}
        >
          List
        </button>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="rounded-md border border-white/10 bg-white/5 p-1.5 text-[var(--text-muted)] hover:bg-white/8 transition-colors"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </header>
  );
}
