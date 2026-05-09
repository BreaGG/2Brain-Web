"use client";

interface Props {
  allDomains: string[];
  activeDomains: Set<string>;
  onToggle: (domain: string) => void;
  onReset: () => void;
}

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
};

export default function GraphControls({ allDomains, activeDomains, onToggle, onReset }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.16em",
        color: "#2a2a2a", textTransform: "uppercase" as const,
        fontFamily: "monospace", flexShrink: 0,
      }}>
        FILTER
      </span>

      {/* divider */}
      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" as const }}>
        {allDomains.map((domain) => {
          const isActive = activeDomains.has(domain);
          const color = DOMAIN_COLORS[domain] ?? "#71717a";
          return (
            <button
              key={domain}
              onClick={() => onToggle(domain)}
              style={{
                border: `1px solid ${isActive ? color + "55" : "rgba(255,255,255,0.06)"}`,
                color: isActive ? color : "#3f3f46",
                background: isActive ? color + "0e" : "transparent",
                borderRadius: 3, padding: "3px 10px",
                fontSize: 10, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
                display: "inline-flex", alignItems: "center", gap: 6,
                letterSpacing: "0.07em", textTransform: "uppercase" as const,
                boxShadow: isActive ? `0 0 10px ${color}15` : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = color + "35";
                  e.currentTarget.style.color = "#71717a";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#3f3f46";
                }
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: isActive ? color : "#2a2a2a", flexShrink: 0,
                boxShadow: isActive ? `0 0 6px ${color}90` : "none",
                transition: "all 0.15s",
              }} />
              {domain}
            </button>
          );
        })}

        {activeDomains.size > 0 && (
          <button
            onClick={onReset}
            style={{
              border: "1px solid rgba(255,255,255,0.05)",
              color: "#2a2a2a", background: "transparent",
              borderRadius: 3, padding: "3px 10px",
              fontSize: 10, cursor: "pointer",
              transition: "all 0.15s", letterSpacing: "0.07em",
              textTransform: "uppercase" as const, fontFamily: "inherit",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#71717a";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#2a2a2a";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
            }}
          >
            ✕ CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
