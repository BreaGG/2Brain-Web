import "server-only";
import { editedMarkdown, retitledIndex, sameText, type NoteEdit } from "./note-edit";

/* ───────────────────────────────────────────────────────────────────────────
 * Writing to the wiki repository (GITHUB_OWNER / GITHUB_REPO).
 * A new note and the update to its folder's index go in as ONE commit, made
 * with the Git Data API so the two never land apart.
 * ─────────────────────────────────────────────────────────────────────────── */

const API = process.env.GITHUB_API_URL || "https://api.github.com";

function cfg() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new WriteError("not-configured", "GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN must be set to write to the wiki.");
  return { owner, repo, token };
}

export class WriteError extends Error {
  constructor(
    public code: "not-configured" | "exists" | "github" | "invalid" | "conflict" | "missing",
    message: string,
  ) {
    super(message);
  }
}

async function gh<T>(path: string, init?: RequestInit & { allow404?: boolean }): Promise<T | null> {
  const { owner, repo, token } = cfg();
  const res = await fetch(`${API}/repos/${owner}/${repo}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 404 && init?.allow404) return null;
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      /* no body */
    }
    const hint =
      res.status === 401 || res.status === 403
        ? " The token needs write access to the repository's contents."
        : res.status === 422
          ? " The branch moved while saving; try again."
          : "";
    throw new WriteError("github", `GitHub said ${res.status}${detail ? ` (${detail})` : ""}.${hint}`);
  }
  return (await res.json()) as T;
}

async function readFile(path: string, ref: string): Promise<string | null> {
  const data = await gh<{ content?: string; encoding?: string }>(`/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`, {
    allow404: true,
  });
  if (!data || data.content == null) return null;
  return Buffer.from(data.content, (data.encoding as BufferEncoding) ?? "base64").toString("utf-8");
}

export interface NewNote {
  title: string;
  type: string;
  folder: string; // e.g. "research" or "research/neuro"
  slug: string; // file name without .md
  domains: string[];
  sources: string[];
  body: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function noteMarkdown(n: NewNote) {
  const lines = [`# ${n.title}`, "", `**Type:** ${n.type}`, `**Domain:** ${n.domains.join(" / ")}`];
  if (n.sources.length) lines.push(`**Sources:** ${n.sources.map((s) => `[[${s}]]`).join(", ")}`);
  lines.push(`**Last updated:** ${today()}`, "", n.body.trim(), "");
  return lines.join("\n");
}

/** Add `- [[slug]] — Title` to a folder index: under its "Pages" heading when it has one, else at the end. */
export function indexWith(index: string | null, folder: string, slug: string, title: string) {
  const entry = `- [[${slug}]] — ${title}`;
  const name = folder.split("/").pop()!;
  const label = name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  if (index == null) {
    return [`# ${label}`, "", "**Type:** meta", `**Domain:** ${folder.split("/")[0]}`, `**Last updated:** ${today()}`, "", `## Pages in ${name}`, "", entry, ""].join("\n");
  }
  if (index.includes(`[[${slug}]]`)) return index;
  const lines = index.replace(/\s+$/, "").split("\n");
  // bump "Last updated" in the preamble
  const lu = lines.findIndex((l, i) => i < 30 && /^\*\*Last updated:\*\*/.test(l));
  if (lu >= 0) lines[lu] = `**Last updated:** ${today()}`;
  const head = lines.findIndex((l) => /^#{2,}\s+pages\b/i.test(l));
  if (head < 0) return [...lines, "", entry, ""].join("\n");
  // end of that section: the next heading, or the end of the file
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) {
    end = i;
    break;
  }
  let at = end;
  while (at > head + 1 && lines[at - 1].trim() === "") at--;
  lines.splice(at, 0, entry);
  return [...lines, ""].join("\n");
}

/** Add a link to a new folder's index on the root index, under its first list or at the end. */
function rootWith(root: string | null, folder: string) {
  const link = `[[${folder}/index]]`;
  if (root == null || root.includes(link)) return null;
  return `${root.replace(/\s+$/, "")}\n\n- ${link}\n`;
}

export async function commitNote(n: NewNote): Promise<{ path: string; commitUrl: string; indexed: string[] }> {
  const { owner, repo } = cfg();
  const meta = await gh<{ default_branch: string }>("");
  const branch = meta!.default_branch;
  const path = `wiki/${n.folder}/${n.slug}.md`;
  const indexPath = `wiki/${n.folder}/index.md`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = ref!.object.sha;
    if ((await readFile(path, head)) != null) throw new WriteError("exists", `${path} already exists. Choose another file name.`);

    const commit = await gh<{ tree: { sha: string } }>(`/git/commits/${head}`);
    const index = await readFile(indexPath, head);
    const files: { path: string; content: string }[] = [
      { path, content: noteMarkdown(n) },
      { path: indexPath, content: indexWith(index, n.folder, n.slug, n.title) },
    ];
    const indexed = [indexPath];
    if (index == null) {
      const root = rootWith(await readFile("wiki/index.md", head), n.folder);
      if (root != null) {
        files.push({ path: "wiki/index.md", content: root });
        indexed.push("wiki/index.md");
      }
    }

    const tree = await gh<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit!.tree.sha,
        tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
      }),
    });
    const made = await gh<{ sha: string; html_url: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: `Add ${n.title}\n\nWritten from the 2Brain web app.`, tree: tree!.sha, parents: [head] }),
    });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: made!.sha, force: false }) });
      return { path, commitUrl: made!.html_url || `https://github.com/${owner}/${repo}/commit/${made!.sha}`, indexed };
    } catch (e) {
      // someone pushed in between: rebuild on the new head once
      if (attempt === 0 && e instanceof WriteError && /422/.test(e.message)) continue;
      throw e;
    }
  }
  throw new WriteError("github", "The branch kept moving while saving; try again.");
}

/**
 * Save an edit to a note that exists, in one commit; when the title changed, its
 * entry in the folder index follows. `base` is the note as the editor opened it:
 * if the file on GitHub has changed since, nothing is written.
 */
export async function commitEdit(id: string, base: string, edit: NoteEdit): Promise<{ path: string; commitUrl: string; indexed: string[] }> {
  const { owner, repo } = cfg();
  const meta = await gh<{ default_branch: string }>("");
  const branch = meta!.default_branch;
  const path = `wiki/${id}.md`;
  const parts = id.split("/");
  const slug = parts.pop()!;
  const indexPath = parts.length ? `wiki/${parts.join("/")}/index.md` : null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = ref!.object.sha;
    const current = await readFile(path, head);
    if (current == null) throw new WriteError("missing", `${path} is no longer in the wiki.`);
    if (!sameText(current, base)) throw new WriteError("conflict", "This note changed on GitHub after you opened it. Sync, open it again and redo your edit, so nothing is lost.");

    const oldTitle = current.match(/^#\s+(.+)$/m)?.[1].trim() ?? slug;
    const files: { path: string; content: string }[] = [{ path, content: editedMarkdown(current, edit, today()) }];
    const indexed: string[] = [];
    if (indexPath && slug !== "index") {
      const index = await readFile(indexPath, head);
      const next = index == null ? null : retitledIndex(index, slug, oldTitle, edit.title);
      if (next != null) {
        files.push({ path: indexPath, content: next });
        indexed.push(indexPath);
      }
    }

    const commit = await gh<{ tree: { sha: string } }>(`/git/commits/${head}`);
    const tree = await gh<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit!.tree.sha,
        tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
      }),
    });
    const made = await gh<{ sha: string; html_url: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: `Edit ${edit.title}\n\nEdited from the 2Brain web app.`, tree: tree!.sha, parents: [head] }),
    });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: made!.sha, force: false }) });
      return { path, commitUrl: made!.html_url || `https://github.com/${owner}/${repo}/commit/${made!.sha}`, indexed };
    } catch (e) {
      if (attempt === 0 && e instanceof WriteError && /422/.test(e.message)) continue;
      throw e;
    }
  }
  throw new WriteError("github", "The branch kept moving while saving; try again.");
}

/** A text file from the wiki repository's default branch (for example its CLAUDE.md), or null. */
export async function readRepoText(path: string): Promise<string | null> {
  const meta = await gh<{ default_branch: string }>("");
  return readFile(path, meta!.default_branch);
}

export interface StagedFile {
  path: string;
  content: string;
  /** What the file held when it was read, or null for a new file. */
  before: string | null;
}

/**
 * Commit an import in one go: the source file as it was uploaded (binary allowed) and the
 * pages written from it. A page that changed on GitHub since it was read stops the commit.
 */
export async function commitImport(source: { path: string; bytes: Buffer }, files: StagedFile[], message: string): Promise<{ commitUrl: string }> {
  const { owner, repo } = cfg();
  const meta = await gh<{ default_branch: string }>("");
  const branch = meta!.default_branch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const head = ref!.object.sha;
    for (const f of files) {
      const now = await readFile(f.path, head);
      if (f.before == null ? now != null : now == null || !sameText(now, f.before))
        throw new WriteError("conflict", `${f.path} changed on GitHub after the notes were drafted. Import the file again so nothing is lost.`);
    }
    if ((await readFile(source.path, head)) != null) throw new WriteError("exists", `${source.path} is already in the wiki. Rename the file to import it again.`);
    const blob = await gh<{ sha: string }>("/git/blobs", { method: "POST", body: JSON.stringify({ content: source.bytes.toString("base64"), encoding: "base64" }) });
    const commit = await gh<{ tree: { sha: string } }>(`/git/commits/${head}`);
    const tree = await gh<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit!.tree.sha,
        tree: [
          { path: source.path, mode: "100644", type: "blob", sha: blob!.sha },
          ...files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
        ],
      }),
    });
    const made = await gh<{ sha: string; html_url: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: tree!.sha, parents: [head] }),
    });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: made!.sha, force: false }) });
      return { commitUrl: made!.html_url || `https://github.com/${owner}/${repo}/commit/${made!.sha}` };
    } catch (e) {
      if (attempt === 0 && e instanceof WriteError && /422/.test(e.message)) continue;
      throw e;
    }
  }
  throw new WriteError("github", "The branch kept moving while saving; try again.");
}

/** Write one text file to the repository's default branch (the passkey list), creating or replacing it. */
export async function putRepoText(path: string, content: string, message: string) {
  const meta = await gh<{ default_branch: string }>("");
  const branch = meta!.default_branch;
  const enc = path.split("/").map(encodeURIComponent).join("/");
  const now = await gh<{ sha?: string }>(`/contents/${enc}?ref=${encodeURIComponent(branch)}`, { allow404: true });
  await gh(`/contents/${enc}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: Buffer.from(content, "utf-8").toString("base64"), branch, ...(now?.sha ? { sha: now.sha } : {}) }),
  });
}
