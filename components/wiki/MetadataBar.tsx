import type { ParsedPage } from "@/lib/types";
import Link from "next/link";

const TYPE_COLORS: Record<string, string> = {
  concept: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  person: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "source-summary": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  synthesis: "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "bg-rose-500/10 text-rose-400",
  research: "bg-blue-500/10 text-blue-400",
  reading: "bg-amber-500/10 text-amber-400",
  business: "bg-emerald-500/10 text-emerald-400",
};

interface Props {
  page: ParsedPage;
  slugMap: Record<string, string>;
}

export default function MetadataBar({ page, slugMap }: Props) {
  const typeColor = TYPE_COLORS[page.type] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";

  return (
    <div className="mb-8 rounded-lg border border-white/8 bg-[var(--bg-secondary)] p-4 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {/* Type */}
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">Type</span>
          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${typeColor}`}>
            {page.type}
          </span>
        </div>

        {/* Domain */}
        {page.domain.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Domain</span>
            <div className="flex gap-1">
              {page.domain.map((d) => (
                <span key={d} className={`rounded px-2 py-0.5 text-xs ${DOMAIN_COLORS[d] ?? "bg-slate-500/10 text-slate-400"}`}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {page.sources.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Sources</span>
            <div className="flex flex-wrap gap-1">
              {page.sources.map((src) => {
                const resolved = slugMap[src];
                return resolved ? (
                  <Link
                    key={src}
                    href={`/wiki/${resolved}`}
                    className="rounded px-2 py-0.5 text-xs bg-white/5 text-[var(--node-concept)] hover:bg-white/10 transition-colors"
                  >
                    {src}
                  </Link>
                ) : (
                  <span key={src} className="rounded px-2 py-0.5 text-xs bg-white/5 text-[var(--text-muted)]">
                    {src}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Last updated */}
        {page.lastUpdated && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[var(--text-muted)]">Updated</span>
            <span className="text-[var(--text-primary)]">{page.lastUpdated}</span>
          </div>
        )}
      </div>
    </div>
  );
}
