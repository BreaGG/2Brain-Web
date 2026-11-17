import { fetchAllWikiFiles } from "./github";
import { parsePage, buildSlugMap } from "./parser";
import type { ParsedPage } from "./types";

export async function getAllPages(): Promise<ParsedPage[]> {
  const files = await fetchAllWikiFiles();
  return files.map((f) => parsePage(f.path, f.content));
}

export async function getPage(slug: string): Promise<ParsedPage | null> {
  const pages = await getAllPages();
  return pages.find((p) => p.slug === slug) ?? null;
}

export async function getSlugMap(): Promise<Map<string, string>> {
  const pages = await getAllPages();
  return buildSlugMap(pages);
}
