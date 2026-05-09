import Link from "next/link";

/* Deterministic pseudo-random stars — same trick as KnowledgeGraph */
const STARS = Array.from({ length: 80 }, (_, i) => {
  const h1 = Math.abs(Math.sin(i * 127.1 + 1.3) * 43758.5453);
  const h2 = Math.abs(Math.sin(i * 311.7 + 5.7) * 43758.5453);
  const h3 = Math.abs(Math.sin(i * 73.1  + 2.1) * 43758.5453);
  const h4 = Math.abs(Math.sin(i * 47.3  + 9.9) * 43758.5453);
  return {
    x:   (h1 - Math.floor(h1)) * 100,
    y:   (h2 - Math.floor(h2)) * 100,
    r:   (h3 - Math.floor(h3)) * 1.1 + 0.25,
    o:   (h4 - Math.floor(h4)) * 0.18 + 0.04,
    dur: 2 + (h1 - Math.floor(h1)) * 5,
  };
});

export default function NotFound() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#00000f",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      fontFamily: "inherit",
    }}>

      {/* Starfield */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          {/* Nebula around center */}
          <radialGradient id="nf-nebula-1" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#0d1850" stopOpacity="0.55" />
            <stop offset="50%"  stopColor="#06091e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nf-nebula-2" cx="60%" cy="40%" r="35%">
            <stop offset="0%"   stopColor="#220850" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#00000f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#nf-nebula-1)" />
        <rect width="100%" height="100%" fill="url(#nf-nebula-2)" />
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r}
            fill="#ccd8ff" opacity={s.o}>
            <animate attributeName="opacity"
              values={`${s.o};${s.o * 0.25};${s.o}`}
              dur={`${s.dur}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* Ghost node — orbiting ring */}
      <svg
        style={{ position: "absolute", width: 340, height: 340, pointerEvents: "none", opacity: 0.18 }}
        viewBox="0 0 340 340"
      >
        <circle cx="170" cy="170" r="130" fill="none" stroke="#5ba3ff" strokeWidth="0.6" strokeDasharray="5 18" />
        <circle cx="170" cy="170" r="90"  fill="none" stroke="#5ba3ff" strokeWidth="0.4" strokeDasharray="3 12" />
        <circle cx="170" cy="170" r="50"  fill="none" stroke="#b87fff" strokeWidth="0.4" strokeDasharray="2 8" />
      </svg>

      {/* Center ghost node */}
      <div style={{ position: "absolute", width: 48, height: 48 }}>
        <svg viewBox="0 0 48 48" width="48" height="48">
          <defs>
            <radialGradient id="ghost-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#5ba3ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#5ba3ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="24" cy="24" r="22" fill="url(#ghost-glow)" />
          <circle cx="24" cy="24" r="10" fill="none" stroke="#5ba3ff" strokeWidth="1"
            strokeDasharray="3 2" opacity="0.5">
            <animate attributeName="r" values="10;13;10" dur="4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.2;0.5" dur="4s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 10,
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 0,
        textAlign: "center",
      }}>
        {/* Error code */}
        <p style={{
          fontFamily: "monospace", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.2em", color: "#2a2a40",
          marginBottom: 20, textTransform: "uppercase",
        }}>
          SYSTEM · NODE NOT FOUND
        </p>

        {/* 404 */}
        <div style={{ position: "relative", marginBottom: 28 }}>
          <h1 style={{
            fontSize: "clamp(80px, 16vw, 140px)",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "transparent",
            backgroundImage: "linear-gradient(180deg, #3a5080 0%, #1a2040 60%, #0a0a20 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            margin: 0,
            userSelect: "none",
          }}>
            404
          </h1>
          {/* Glow under number */}
          <div style={{
            position: "absolute", bottom: -8, left: "50%",
            transform: "translateX(-50%)",
            width: "60%", height: 1,
            background: "linear-gradient(90deg, transparent, rgba(91,163,255,0.3), transparent)",
          }} />
        </div>

        {/* Message */}
        <p style={{
          fontSize: 15, color: "#4a5070",
          letterSpacing: "0.02em", marginBottom: 10,
          lineHeight: 1.5,
        }}>
          This node doesn&apos;t exist in the knowledge graph.
        </p>
        <p style={{
          fontFamily: "monospace", fontSize: 10,
          color: "#1e1e30", letterSpacing: "0.08em",
          marginBottom: 44,
        }}>
          GHOST LINK DETECTED — NO PAGE FOUND AT THIS PATH
        </p>

        {/* CTA */}
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            border: "1px solid rgba(91,163,255,0.25)",
            background: "rgba(91,163,255,0.05)",
            borderRadius: 4, padding: "10px 24px",
            color: "#5ba3ff", fontSize: 12, fontWeight: 600,
            textDecoration: "none", letterSpacing: "0.08em",
            textTransform: "uppercase",
            boxShadow: "0 0 20px rgba(91,163,255,0.06)",
            transition: "all 0.2s",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,163,255,0.55)";
            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(91,163,255,0.10)";
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 28px rgba(91,163,255,0.15)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,163,255,0.25)";
            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(91,163,255,0.05)";
            (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 20px rgba(91,163,255,0.06)";
          }}
        >
          {/* Corner brackets */}
          <span style={{ position: "absolute", top: -1, left: -1, width: 8, height: 8, borderTop: "1px solid rgba(91,163,255,0.6)", borderLeft: "1px solid rgba(91,163,255,0.6)" }} />
          <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderBottom: "1px solid rgba(91,163,255,0.6)", borderRight: "1px solid rgba(91,163,255,0.6)" }} />
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 6H4M4 6L6 4M4 6L6 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Return to Graph
        </Link>

        {/* Status line */}
        <p style={{
          marginTop: 32, fontFamily: "monospace",
          fontSize: 9, color: "#151525",
          letterSpacing: "0.12em",
        }}>
          2BRAIN KNOWLEDGE OS · NAVIGATION ERROR 0x404
        </p>
      </div>
    </div>
  );
}
