import { fetchAllWikiFiles } from "./github";
import { parsePage, buildSlugMap } from "./parser";
import { sampleWikiFiles } from "./sample";
import type { ParsedPage } from "./types";

/** True when the GitHub credentials needed to read the real wiki are present. */
export function hasWikiSource(): boolean {
  return Boolean(process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN);
}

let warned = false;

export async function getAllPages(): Promise<ParsedPage[]> {
  let files: { path: string; content: string }[];
  if (hasWikiSource()) {
    files = await fetchAllWikiFiles();
  } else {
    if (!warned) {
      console.warn("[2brain] GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN not set — using the sample wiki.");
      warned = true;
    }
    files = sampleWikiFiles();
  }
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

/** Public repo coordinates (not secret) so the UI can link to "add a note" on GitHub. */
export function getRepoInfo(): { owner: string; repo: string } | null {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  return owner && repo ? { owner, repo } : null;
}
