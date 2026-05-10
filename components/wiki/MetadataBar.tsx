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
        position: "relative",
        marginBottom: 32,
        borderRadius: 6,
        border: `1px solid ${tc.color}1a`,
        background: "rgba(8,8,15,0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "16px 20px",
        boxShadow: `0 0 0 1px ${tc.color}06, 0 12px 36px rgba(0,0,0,0.40)`,
      }}
    >
      {/* Corner brackets */}
      <div style={{ position: "absolute", top: -1, left: -1, width: 10, height: 10, borderTop: `1px solid ${tc.color}80`, borderLeft: `1px solid ${tc.color}80` }} />
      <div style={{ position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderBottom: `1px solid ${tc.color}80`, borderRight: `1px solid ${tc.color}80` }} />

      {/* Top accent gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 12,
          right: 12,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${tc.color}99, transparent)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", alignItems: "center" }}>
        {/* Type */}
        <Field label="TYPE">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: tc.bg,
              color: tc.color,
              border: `1px solid ${tc.border}`,
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: tc.color, boxShadow: `0 0 6px ${tc.color}aa` }} />
            {page.type}
          </span>
        </Field>

        {/* Domain */}
        {page.domain.length > 0 && (
          <Field label="DOMAIN">
            <div style={{ display: "flex", gap: 4 }}>
              {page.domain.map((d) => {
                const c = DOMAIN_COLORS[d] ?? "#71717a";
                return (
                  <span
                    key={d}
                    style={{
                      background: c + "10",
                      color: c,
                      border: `1px solid ${c}26`,
                      borderRadius: 4,
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {d}
                  </span>
                );
              })}
            </div>
          </Field>
        )}

        {/* Sources */}
        {page.sources.length > 0 && (
          <Field label="SOURCES">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {page.sources.map((src) => {
                const resolved = slugMap[src];
                return resolved ? (
                  <Link
                    key={src}
                    href={`/wiki/${resolved}`}
                    style={{
                      background: "#4f9cf90d",
                      color: "#4f9cf9",
                      border: "1px solid #4f9cf922",
                      borderRadius: 4,
                      padding: "3px 10px",
                      fontSize: 11,
                      textDecoration: "none",
                      transition: "all 0.15s",
                      display: "inline-block",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#4f9cf91a";
                      e.currentTarget.style.borderColor = "#4f9cf955";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#4f9cf90d";
                      e.currentTarget.style.borderColor = "#4f9cf922";
                    }}
                  >
                    {src}
                  </Link>
                ) : (
                  <span
                    key={src}
                    style={{
                      background: "#0c0c0f",
                      color: "#52525b",
                      border: "1px solid #1a1a1f",
                      borderRadius: 4,
                      padding: "3px 10px",
                      fontSize: 11,
                      borderStyle: "dashed",
                    }}
                  >
                    {src}
                  </span>
                );
              })}
            </div>
          </Field>
        )}

        {/* Last updated */}
        {page.lastUpdated && (
          <Field label="UPDATED" style={{ marginLeft: "auto" }}>
            <span style={{ color: "#a1a1aa", fontSize: 11, fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {page.lastUpdated}
            </span>
          </Field>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, ...style }}>
      <span
        style={{
          fontSize: 8,
          color: "#3f3f46",
          fontFamily: "monospace",
          letterSpacing: "0.16em",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
