import type { ParsedPage } from "@/lib/types";
import Link from "next/link";

const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  concept:          { bg: "#4f9cf912", color: "#4f9cf9", border: "#4f9cf930" },
  person:           { bg: "#4ade8012", color: "#4ade80", border: "#4ade8030" },
  "source-summary": { bg: "#facc1512", color: "#facc15", border: "#facc1530" },
  synthesis:        { bg: "#c084fc12", color: "#c084fc", border: "#c084fc30" },
};

const DOMAIN_COLORS: Record<string, string> = {
  personal: "#fb7185",
  research: "#60a5fa",
  reading:  "#fbbf24",
  business: "#34d399",
};

interface Props {
  page: ParsedPage;
  slugMap: Record<string, string>;
}

export default function MetadataBar({ page, slugMap }: Props) {
  const tc = TYPE_COLORS[page.type] ?? { bg: "#1a1a1a", color: "#71717a", border: "#27272a" };

  return (
    <div
      style={{
        marginBottom: 32,
        borderRadius: 10,
        border: "1px solid #141414",
        background: "#080808",
        padding: "14px 18px",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", alignItems: "center" }}>
        {/* Type */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#3f3f46" }}>Type</span>
          <span
            style={{
              background: tc.bg,
              color: tc.color,
              border: `1px solid ${tc.border}`,
              borderRadius: 5,
              padding: "2px 9px",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {page.type}
          </span>
        </div>

        {/* Domain */}
        {page.domain.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#3f3f46" }}>Domain</span>
            <div style={{ display: "flex", gap: 4 }}>
              {page.domain.map((d) => {
                const c = DOMAIN_COLORS[d] ?? "#71717a";
                return (
                  <span
                    key={d}
                    style={{
                      background: c + "12",
                      color: c,
                      border: `1px solid ${c}25`,
                      borderRadius: 5,
                      padding: "2px 9px",
                      fontSize: 11,
                    }}
                  >
                    {d}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Sources */}
        {page.sources.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "#3f3f46" }}>Sources</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {page.sources.map((src) => {
                const resolved = slugMap[src];
                return resolved ? (
                  <Link
                    key={src}
                    href={`/wiki/${resolved}`}
                    style={{
                      background: "#4f9cf910",
                      color: "#4f9cf9",
                      border: "1px solid #4f9cf925",
                      borderRadius: 5,
                      padding: "2px 9px",
                      fontSize: 11,
                      textDecoration: "none",
                    }}
                  >
                    {src}
                  </Link>
                ) : (
                  <span
                    key={src}
                    style={{
                      background: "#111",
                      color: "#52525b",
                      border: "1px solid #1a1a1a",
                      borderRadius: 5,
                      padding: "2px 9px",
                      fontSize: 11,
                    }}
                  >
                    {src}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Last updated */}
        {page.lastUpdated && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ color: "#3f3f46" }}>Updated</span>
            <span style={{ color: "#71717a", fontSize: 11 }}>{page.lastUpdated}</span>
          </div>
        )}
      </div>
    </div>
  );
}
