"use client";

interface Props {
  allDomains: string[];
  activeDomains: Set<string>;
  onToggle: (domain: string) => void;
  onReset: () => void;
}

const DOMAIN_COLORS: Record<string, string> = {
  personal: "data-[active=true]:bg-rose-500/30 data-[active=true]:text-rose-300 data-[active=true]:border-rose-500/50",
  research: "data-[active=true]:bg-blue-500/30 data-[active=true]:text-blue-300 data-[active=true]:border-blue-500/50",
  reading: "data-[active=true]:bg-amber-500/30 data-[active=true]:text-amber-300 data-[active=true]:border-amber-500/50",
  business: "data-[active=true]:bg-emerald-500/30 data-[active=true]:text-emerald-300 data-[active=true]:border-emerald-500/50",
};

export default function GraphControls({ allDomains, activeDomains, onToggle, onReset }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--text-muted)] mr-1">Filter:</span>
      {allDomains.map((domain) => {
        const isActive = activeDomains.has(domain);
        const colorClass = DOMAIN_COLORS[domain] ?? "data-[active=true]:bg-slate-500/30 data-[active=true]:text-slate-300";
        return (
          <button
            key={domain}
            data-active={isActive}
            onClick={() => onToggle(domain)}
            className={`rounded-full border border-white/10 px-3 py-1 text-xs transition-all ${colorClass} ${
              isActive ? "" : "text-[var(--text-muted)] hover:border-white/20"
            }`}
          >
            {domain}
          </button>
        );
      })}
      {activeDomains.size > 0 && (
        <button
          onClick={onReset}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          clear
        </button>
      )}
    </div>
  );
}
