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
    <div className="min-h-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Nav bar */}
      <header
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 20px",
          borderBottom: "1px solid #111",
          background: "#000",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(8px)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            textDecoration: "none",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#4f9cf9" }}>⬡</span>
          2Brain
        </Link>
        <span style={{ color: "#27272a", fontSize: 14 }}>/</span>
        <span style={{ color: "#52525b", fontSize: 13 }}>{page.domain[0]}</span>
        <span style={{ color: "#27272a", fontSize: 14 }}>/</span>
        <span
          style={{
            color: "#a1a1aa",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {page.title}
        </span>
      </header>

      <PageView page={page} allPages={allPages} />
    </div>
  );
}
