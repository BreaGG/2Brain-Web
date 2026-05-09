import { getAllPages } from "@/lib/wiki";
import { buildGraph } from "@/lib/graph";
import HomeClient from "@/components/HomeClient";

export const revalidate = 3600;

export default async function Home() {
  const pages = await getAllPages();
  const graphData = buildGraph(pages);

  const domainSet = new Set<string>();
  for (const p of pages) {
    for (const d of p.domain) {
      if (d !== "uncategorized") domainSet.add(d);
    }
  }
  const allDomains = Array.from(domainSet).sort();

  return (
    <HomeClient
      pages={pages}
      graphData={graphData}
      allDomains={allDomains}
    />
  );
}
