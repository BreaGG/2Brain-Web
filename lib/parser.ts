import type { ParsedPage, WikiLink } from "./types";

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function extractWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  const matches = text.matchAll(WIKI_LINK_RE);
  for (const m of matches) {
    const inner = m[1].trim();
    const parts = inner.split("/");
    links.push({
      raw: m[0],
      slug: parts[parts.length - 1],
      folder: parts.length > 1 ? parts[0] : undefined,
    });
  }
  return links;
}

function extractSlugFromLinks(text: string): string[] {
  return extractWikiLinks(text).map((l) => l.slug);
}

function getExcerpt(body: string): string {
  // Find first non-empty, non-heading paragraph
  const lines = body.split("\n");
  let para = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("**") && !trimmed.startsWith("|") && !trimmed.startsWith("-")) {
      para = trimmed;
      break;
    }
  }
  return para.slice(0, 200);
}

export function parsePage(path: string, raw: string): ParsedPage {
  // path: "wiki/research/concept-double-threshold.md"
  const slug = path.replace(/^wiki\//, "").replace(/\.md$/, "");

  const lines = raw.split("\n");

  let title = "";
  let type = "page";
  let domain: string[] = [];
  let sources: string[] = [];
  let lastUpdated = "";
  let metaEndLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch && !title) {
      title = titleMatch[1].trim();
      continue;
    }

    const typeMatch = line.match(/^\*\*Type:\*\*\s*(.+)$/);
    if (typeMatch) {
      // Take first token before " / " or " | "
      type = typeMatch[1].trim().split(/[\s/|]+/)[0].toLowerCase();
      metaEndLine = i;
      continue;
    }

    const domainMatch = line.match(/^\*\*Domain:\*\*\s*(.+)$/);
    if (domainMatch) {
      domain = domainMatch[1].trim().split(/\s*\/\s*/).map((d) => d.trim().toLowerCase());
      metaEndLine = i;
      continue;
    }

    const sourcesMatch = line.match(/^\*\*Sources:\*\*\s*(.+)$/);
    if (sourcesMatch) {
      sources = extractSlugFromLinks(sourcesMatch[1]);
      metaEndLine = i;
      continue;
    }

    const updatedMatch = line.match(/^\*\*Last updated:\*\*\s*(.+)$/);
    if (updatedMatch) {
      lastUpdated = updatedMatch[1].trim();
      metaEndLine = i;
      continue;
    }

    // Also handle "Date ingested" for source-summary pages
    const ingestedMatch = line.match(/^\*\*Date ingested:\*\*\s*(.+)$/);
    if (ingestedMatch && !lastUpdated) {
      lastUpdated = ingestedMatch[1].trim();
      metaEndLine = i;
      continue;
    }
  }

  // Body is everything after the metadata block
  const bodyContent = lines.slice(metaEndLine + 1).join("\n").trim();
  const links = extractWikiLinks(raw);
  const excerpt = getExcerpt(bodyContent);

  return {
    title: title || slug.split("/").pop() || slug,
    type,
    domain: domain.length ? domain : ["uncategorized"],
    sources,
    lastUpdated,
    slug,
    path,
    rawContent: raw,
    bodyContent,
    links,
    excerpt,
  };
}

export function buildSlugMap(pages: ParsedPage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const page of pages) {
    map.set(page.slug, page.slug); // full slug
    const short = page.slug.split("/").pop()!;
    if (!map.has(short)) map.set(short, page.slug); // short slug (first one wins)
  }
  return map;
}
