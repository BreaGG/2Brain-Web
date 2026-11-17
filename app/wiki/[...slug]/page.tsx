import { notFound } from "next/navigation";
import { getAllPages, getRepoInfo, hasWikiSource } from "@/lib/wiki";
import BrainApp from "@/components/app/BrainApp";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const pages = await getAllPages();
  const page = pages.find((p) => p.slug === slug.map(decodeURIComponent).join("/"));
  return {
    title: page ? `${page.title} — 2Brain` : "Not found — 2Brain",
    description: page?.excerpt || undefined,
  };
}

/** A note opens inside the app: the reader pane is shown with the brain lit around it. */
export default async function WikiPage({ params }: Props) {
  const { slug } = await params;
  const slugStr = slug.map(decodeURIComponent).join("/");
  const pages = await getAllPages();
  if (!pages.some((p) => p.slug === slugStr)) notFound();
  return <BrainApp pages={pages} initialSlug={slugStr} repo={getRepoInfo()} usingSample={!hasWikiSource()} />;
}
