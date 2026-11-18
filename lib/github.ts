const OWNER = process.env.GITHUB_OWNER!;
const REPO = process.env.GITHUB_REPO!;
const TOKEN = process.env.GITHUB_TOKEN!;
const API = process.env.GITHUB_API_URL || "https://api.github.com";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github.v3+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export async function fetchWikiTree(): Promise<TreeEntry[]> {
  // The tree is what changes: check it every minute (and at once on a webhook or Sync).
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/git/trees/HEAD?recursive=1`,
    { headers, next: { revalidate: 60, tags: ["wiki"] } }
  );
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.truncated) console.warn("[2brain] the repository tree is truncated by GitHub; some notes may be missing");
  return (data.tree as TreeEntry[]).filter(
    (e) => e.type === "blob" && e.path.startsWith("wiki/") && e.path.endsWith(".md")
  );
}

export async function fetchBlobContent(sha: string): Promise<string> {
  // A blob is addressed by its content hash, so it never changes: cache it for good.
  // Only new or edited notes are downloaded after a change.
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/git/blobs/${sha}`,
    { headers, cache: "force-cache", next: { tags: ["wiki-blob"] } }
  );
  if (!res.ok) throw new Error(`GitHub blob fetch failed: ${sha} ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

/** Run `fn` over `items` with at most `limit` at a time (GitHub throttles bursts). */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function fetchAllWikiFiles(): Promise<{ path: string; content: string }[]> {
  const entries = await fetchWikiTree();
  return pool(entries, 8, async (entry) => ({ path: entry.path, content: await fetchBlobContent(entry.sha) }));
}
