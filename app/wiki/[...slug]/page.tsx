import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllPages, getPage } from "@/lib/wiki";
import PageView from "@/components/wiki/PageView";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug.join("/"));
  return { title: page ? `${page.title} — 2Brain` : "Not Found — 2Brain" };
}

export default async function WikiPage({ params }: Props) {
  const { slug } = await params;
  const slugStr = slug.join("/");
  const [page, allPages] = await Promise.all([getPage(slugStr), getAllPages()]);

  if (!page) notFound();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070B1A",
        color: "#dfe6f3",
      }}
    >
      {/* Calmer top nav — solid, subtle border, breadcrumb */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: 50,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 28px",
          background: "rgba(7,11,26,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(140,180,255,0.08)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
            flexShrink: 0,
            opacity: 0.92,
            transition: "opacity 0.18s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke="#67e8f9" strokeWidth="1.1" fill="none" strokeOpacity="0.85" />
            <circle cx="12" cy="12" r="1.6" fill="#e0e7ff" />
          </svg>
          <span style={{
            color: "#dfe6f3", fontWeight: 600, fontSize: 13,
            letterSpacing: "0.04em",
            fontFamily: "Inter, system-ui, sans-serif",
          }}>
            2Brain
          </span>
        </Link>

        <span style={{ color: "rgba(140,160,200,0.40)", fontSize: 13 }}>/</span>

        <span style={{
          color: "rgba(180,200,240,0.65)", fontSize: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          textTransform: "capitalize" as const,
        }}>
          {page.domain[0] ?? "uncategorized"}
        </span>

        <span style={{ color: "rgba(140,160,200,0.40)", fontSize: 13 }}>/</span>

        <span
          style={{
            color: "#dfe6f3",
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {page.title}
        </span>
      </header>

      <PageView page={page} allPages={allPages} />
    </div>
  );
}
