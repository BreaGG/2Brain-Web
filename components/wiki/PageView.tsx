import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ParsedPage } from "@/lib/types";
import MetadataBar from "./MetadataBar";
import { buildSlugMap } from "@/lib/parser";
import Link from "next/link";

interface Props {
  page: ParsedPage;
  allPages: ParsedPage[];
}

// Subtle type accent — used sparingly for the small label only
const TYPE_COLORS: Record<string, string> = {
  concept:          "#7dd3fc",
  person:           "#67e8f9",
  "source-summary": "#c4b5fd",
  synthesis:        "#a78bfa",
};

function resolveWikiLinksInText(text: string, slugMap: Map<string, string>): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const inner = m[1].trim();
    const linkSlug = inner.split("/").pop()!;
    const resolved = slugMap.get(linkSlug) ?? slugMap.get(inner);
    if (resolved) {
      parts.push(
        <Link
          key={m.index}
          href={`/wiki/${resolved}`}
          className="wiki-link"
        >
          {linkSlug}
        </Link>
      );
    } else {
      parts.push(
        <span
          key={m.index}
          title="Page not yet created"
          style={{
            color: "rgba(140,160,200,0.55)",
            borderBottom: "1px dashed rgba(140,160,200,0.40)",
            padding: "0 1px",
          }}
        >
          {linkSlug}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function processChildren(
  children: React.ReactNode,
  slugMap: Map<string, string>
): React.ReactNode {
  if (typeof children === "string") {
    return resolveWikiLinksInText(children, slugMap);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        const resolved = resolveWikiLinksInText(child, slugMap);
        return resolved.length === 1 && typeof resolved[0] === "string"
          ? resolved[0]
          : <span key={i}>{resolved}</span>;
      }
      return child;
    });
  }
  return children;
}

export default function PageView({ page, allPages }: Props) {
  const slugMap = buildSlugMap(allPages);
  const slugObj = Object.fromEntries(slugMap.entries());
  const accent = TYPE_COLORS[page.type] ?? "#7dd3fc";

  return (
    <article
      style={{
        maxWidth: 740,
        margin: "0 auto",
        padding: "48px 28px 96px",
        color: "#dfe6f3",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Hero title block — calm, editorial */}
      <header style={{ marginBottom: 28 }}>
        {/* Small type label */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 18,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 6px ${accent}66`,
          }} />
          <span style={{
            fontSize: 10, fontWeight: 600,
            letterSpacing: "0.16em",
            color: accent,
            textTransform: "uppercase" as const,
            fontFamily: "Inter, system-ui, sans-serif",
          }}>
            {page.type === "page" ? "Document" : page.type}
          </span>
        </div>

        <h1
          style={{
            color: "#f4f7ff",
            fontWeight: 700,
            fontSize: 38,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            marginBottom: 14,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {page.title}
        </h1>
        {page.excerpt && (
          <p
            style={{
              color: "rgba(200,215,235,0.75)",
              fontSize: 16,
              lineHeight: 1.6,
              fontWeight: 400,
              maxWidth: 640,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {page.excerpt}
          </p>
        )}
      </header>

      {/* Metadata bar (hidden for plain index/untyped pages) */}
      {!(page.type === "page" && page.domain[0] === "uncategorized" && !page.lastUpdated) && (
        <MetadataBar page={page} slugMap={slugObj} />
      )}

      {/* Markdown body — sober, readable */}
      <div className="wiki-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p({ children }) {
              return <p>{processChildren(children, slugMap)}</p>;
            },
            li({ children }) {
              return <li>{processChildren(children, slugMap)}</li>;
            },
            td({ children }) {
              return <td>{processChildren(children, slugMap)}</td>;
            },
            th({ children }) {
              return <th>{processChildren(children, slugMap)}</th>;
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ext-link"
                >
                  {children}
                </a>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote style={{
                  borderLeft: `2px solid ${accent}66`,
                  paddingLeft: 18,
                  color: "rgba(200,215,235,0.78)",
                  fontStyle: "italic",
                  margin: "22px 0",
                }}>
                  {children}
                </blockquote>
              );
            },
            code({ children }) {
              return (
                <code style={{
                  background: "rgba(140,180,255,0.07)",
                  border: "1px solid rgba(140,180,255,0.12)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontSize: "0.88em",
                  color: "#c4b5fd",
                  fontFamily: "ui-monospace, 'SF Mono', monospace",
                }}>
                  {children}
                </code>
              );
            },
          }}
        >
          {page.bodyContent}
        </ReactMarkdown>
      </div>

      <style>{`
        .wiki-link {
          color: #7dd3fc;
          text-decoration: none;
          border-bottom: 1px solid rgba(125,211,252,0.35);
          padding: 0 1px;
          transition: color 0.18s, border-color 0.18s;
        }
        .wiki-link:hover {
          color: #a78bfa;
          border-bottom-color: rgba(167,139,250,0.70);
        }
        .ext-link {
          color: #a78bfa;
          text-decoration: none;
          border-bottom: 1px solid rgba(167,139,250,0.35);
          transition: color 0.18s, border-color 0.18s;
        }
        .ext-link:hover {
          color: #c4b5fd;
          border-bottom-color: rgba(196,181,253,0.70);
        }
        .wiki-prose {
          color: rgba(220,228,245,0.92);
          font-size: 16px;
          line-height: 1.78;
          font-family: Inter, system-ui, sans-serif;
        }
        .wiki-prose h1, .wiki-prose h2, .wiki-prose h3, .wiki-prose h4 {
          color: #f4f7ff;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1.3;
          margin-top: 1.8em;
          margin-bottom: 0.55em;
        }
        .wiki-prose h2 {
          font-size: 22px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(140,180,255,0.10);
        }
        .wiki-prose h3 {
          font-size: 17px;
          color: #e6ecf8;
        }
        .wiki-prose h4 {
          font-size: 14px;
          color: rgba(220,228,245,0.85);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .wiki-prose p {
          margin: 0 0 1.05em;
        }
        .wiki-prose strong {
          color: #f4f7ff;
          font-weight: 700;
        }
        .wiki-prose em {
          color: rgba(220,228,245,0.92);
        }
        .wiki-prose ul, .wiki-prose ol {
          margin: 0 0 1em;
          padding-left: 22px;
        }
        .wiki-prose li {
          margin: 0.35em 0;
        }
        .wiki-prose li::marker {
          color: rgba(125,211,252,0.55);
        }
        .wiki-prose ol > li::marker {
          color: rgba(167,139,250,0.70);
          font-weight: 600;
        }
        .wiki-prose hr {
          border: none;
          height: 1px;
          background: rgba(140,180,255,0.12);
          margin: 36px 0;
        }
        .wiki-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.2em 0;
          font-size: 14px;
        }
        .wiki-prose th, .wiki-prose td {
          padding: 9px 14px;
          text-align: left;
          border-bottom: 1px solid rgba(140,180,255,0.08);
        }
        .wiki-prose th {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(180,200,240,0.78);
        }
        .wiki-prose td {
          color: rgba(220,228,245,0.88);
        }
        .wiki-prose img {
          max-width: 100%;
          border-radius: 6px;
          margin: 1em 0;
          border: 1px solid rgba(140,180,255,0.10);
        }
      `}</style>
    </article>
  );
}
