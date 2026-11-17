const OWNER = process.env.GITHUB_OWNER!;
const REPO = process.env.GITHUB_REPO!;
const TOKEN = process.env.GITHUB_TOKEN!;
const API = "https://api.github.com";

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
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/git/trees/HEAD?recursive=1`,
    { headers, next: { revalidate: 300, tags: ["wiki"] } }
  );
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.tree as TreeEntry[]).filter(
    (e) => e.type === "blob" && e.path.startsWith("wiki/") && e.path.endsWith(".md")
  );
}

export async function fetchFileContent(path: string): Promise<string> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`,
    { headers, next: { revalidate: 300, tags: ["wiki"] } }
  );
  if (!res.ok) throw new Error(`GitHub file fetch failed: ${path} ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function fetchBlobContent(sha: string): Promise<string> {
  const res = await fetch(
    `${API}/repos/${OWNER}/${REPO}/git/blobs/${sha}`,
    { headers, next: { revalidate: 300, tags: ["wiki"] } }
  );
  if (!res.ok) throw new Error(`GitHub blob fetch failed: ${sha} ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function fetchAllWikiFiles(): Promise<{ path: string; content: string }[]> {
  const entries = await fetchWikiTree();
  const results = await Promise.all(
    entries.map(async (entry) => ({
      path: entry.path,
      content: await fetchBlobContent(entry.sha),
    }))
  );
  return results;
}
