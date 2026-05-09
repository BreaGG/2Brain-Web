"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ParsedPage, GraphData } from "@/lib/types";
import GraphControls from "@/components/graph/GraphControls";
import PageTable from "@/components/list/PageTable";
import SearchModal from "@/components/search/SearchModal";
import Navbar from "@/components/layout/Navbar";

const KnowledgeGraph = dynamic(() => import("@/components/graph/KnowledgeGraph"), { ssr: false });

interface Props {
  pages: ParsedPage[];
  graphData: GraphData;
  allDomains: string[];
}

export default function HomeClient({ pages, graphData, allDomains }: Props) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);

  function toggleDomain(d: string) {
    setActiveDomains((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  const linkDegrees = new Map<string, number>();
  for (const node of graphData.nodes) {
    linkDegrees.set(node.id, node.degree);
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Navbar view={view} onViewChange={setView} onSearchOpen={() => setSearchOpen(true)} />

      <div className="flex items-center gap-4 px-4 py-2 border-b border-white/8 shrink-0" style={{ backgroundColor: "var(--bg-secondary)" }}>
        <GraphControls
          allDomains={allDomains}
          activeDomains={activeDomains}
          onToggle={toggleDomain}
          onReset={() => setActiveDomains(new Set())}
        />
        <div className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          {pages.filter(p => activeDomains.size === 0 || p.domain.some(d => activeDomains.has(d))).length} pages · {graphData.edges.length} links
        </div>
      </div>

      <main className="flex-1 overflow-hidden">
        {view === "graph" ? (
          <KnowledgeGraph data={graphData} activeDomains={activeDomains} />
        ) : (
          <div className="h-full overflow-y-auto">
            <PageTable pages={pages} linkDegrees={linkDegrees} activeDomains={activeDomains} />
          </div>
        )}
      </main>

      {view === "graph" && (
        <footer className="flex items-center gap-4 px-4 py-2 border-t border-white/8 text-xs shrink-0" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-muted)" }}>
          {[
            { label: "concept", color: "var(--node-concept)" },
            { label: "person", color: "var(--node-person)" },
            { label: "source", color: "var(--node-source)" },
            { label: "synthesis", color: "var(--node-synthesis)" },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 ml-2">
            <span className="w-3 border-t border-dashed inline-block shrink-0" style={{ borderColor: "var(--node-ghost)" }} />
            not yet created
          </span>
        </footer>
      )}

      <SearchModal pages={pages} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
