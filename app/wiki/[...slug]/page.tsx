import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllPages, getPage } from "@/lib/wiki";
import PageView from "@/components/wiki/PageView";

export const revalidate = 3600;

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
      {/* Minimal nav bar */}
      <header
        className="h-12 flex items-center gap-4 px-4 border-b sticky top-0 z-10"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)", backdropFilter: "blur(8px)" }}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
          <span style={{ color: "var(--node-concept)" }}>⬡</span>
          2Brain
        </Link>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <span className="text-sm truncate" style={{ color: "var(--text-muted)" }}>
          {page.domain[0]}
        </span>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {page.title}
        </span>
      </header>

      <PageView page={page} allPages={allPages} />
    </div>
  );
}
