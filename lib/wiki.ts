import { fetchAllWikiFiles } from "./github";
import { parsePage, buildSlugMap } from "./parser";
import type { ParsedPage } from "./types";

let cachedPages: ParsedPage[] | null = null;

export async function getAllPages(): Promise<ParsedPage[]> {
  if (cachedPages) return cachedPages;
  const files = await fetchAllWikiFiles();
  cachedPages = files.map((f) => parsePage(f.path, f.content));
  return cachedPages;
}

export async function getPage(slug: string): Promise<ParsedPage | null> {
  const pages = await getAllPages();
  return pages.find((p) => p.slug === slug) ?? null;
}

export async function getSlugMap(): Promise<Map<string, string>> {
  const pages = await getAllPages();
  return buildSlugMap(pages);
}
