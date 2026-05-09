import type { ParsedPage, GraphData, GraphNode, GraphEdge } from "./types";
import { buildSlugMap } from "./parser";

export function buildGraph(pages: ParsedPage[]): GraphData {
  const slugMap = buildSlugMap(pages);
  const nodeMap = new Map<string, GraphNode>();

  // Create real nodes
  for (const page of pages) {
    nodeMap.set(page.slug, {
      id: page.slug,
      label: page.title,
      type: page.type,
      domain: page.domain,
      degree: 0,
    });
  }

  // Collect edges and ghost nodes
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const link of page.links) {
      const targetSlug = slugMap.get(link.slug) ?? slugMap.get(`${link.folder}/${link.slug}`) ?? link.slug;
      const edgeKey = `${page.slug}→${targetSlug}`;
      if (seen.has(edgeKey) || targetSlug === page.slug) continue;
      seen.add(edgeKey);

      const broken = !nodeMap.has(targetSlug);

      // Add ghost node if page doesn't exist
      if (broken && !nodeMap.has(targetSlug)) {
        nodeMap.set(targetSlug, {
          id: targetSlug,
          label: link.slug,
          type: "ghost",
          domain: [],
          degree: 0,
          broken: true,
        });
      }

      edges.push({ source: page.slug, target: targetSlug, broken });

      // Increment degree
      const src = nodeMap.get(page.slug);
      if (src) src.degree++;
      const tgt = nodeMap.get(targetSlug);
      if (tgt) tgt.degree++;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}
