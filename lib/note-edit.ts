/* ───────────────────────────────────────────────────────────────────────────
 * Editing a note that already exists: put the new title, fields and body into
 * its markdown while keeping everything else in its preamble as it was
 * (other **Field:** lines, the way a type or a domain was written when it did
 * not change). Pure functions, shared by the server and the tests.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface NoteEdit {
  title: string;
  type: string;
  domains: string[];
  /** Note file names (the last part of the slug). */
  sources: string[];
  body: string;
}

const FIELD = /^\*\*([^*]+):\*\*\s*(.*)$/;
const SCAN = 30;

const linksIn = (s: string) => [...s.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim().split("/").pop()!);

/** Where the preamble ends, read the same way the site's parser reads it. */
function preamble(lines: string[]) {
  let title = -1;
  let end = -1;
  const fields = new Map<string, number>();
  for (let i = 0; i < Math.min(lines.length, SCAN); i++) {
    const l = lines[i];
    if (/^#{2,}\s/.test(l) && i > 0) break;
    if (title < 0 && /^#\s+\S/.test(l)) {
      title = i;
      continue;
    }
    const f = l.match(FIELD);
    if (f) {
      const name = f[1].trim().toLowerCase();
      if (!fields.has(name)) fields.set(name, i);
      if (["type", "domain", "sources", "last updated", "date ingested"].includes(name)) end = i;
    }
  }
  return { title, end, fields };
}

/** The note's markdown with the edit applied and "Last updated" set to `today`. */
export function editedMarkdown(raw: string, edit: NoteEdit, today: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const { title, end, fields } = preamble(lines);
  const head = lines.slice(0, Math.max(end, title) + 1);

  const at = (name: string) => fields.get(name) ?? -1;
  const value = (name: string) => (at(name) >= 0 ? lines[at(name)].match(FIELD)![2].trim() : "");
  const missing: string[] = [];

  // title
  if (title >= 0) head[title] = `# ${edit.title}`;
  else head.unshift(`# ${edit.title}`);
  const shift = title >= 0 ? 0 : 1;
  const put = (name: string, line: string | null) => {
    const i = at(name);
    if (i >= 0) head[i + shift] = line ?? "\u0000";
    else if (line) missing.push(line);
  };

  // a field is rewritten only when its meaning changed, so hand-written forms survive
  if (value("type").split(/[\s/|]+/)[0]?.toLowerCase() !== edit.type) put("type", `**Type:** ${edit.type}`);
  const domains = value("domain").split(/\s*\/\s*/).map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.join("/") !== edit.domains.join("/")) put("domain", edit.domains.length ? `**Domain:** ${edit.domains.join(" / ")}` : null);
  const sources = linksIn(value("sources"));
  if (sources.join("|") !== edit.sources.join("|")) put("sources", edit.sources.length ? `**Sources:** ${edit.sources.map((s) => `[[${s}]]`).join(", ")}` : null);
  if (at("last updated") >= 0) put("last updated", `**Last updated:** ${today}`);
  else missing.push(`**Last updated:** ${today}`);

  // new fields go after the last one there is, or under the title
  const after = end >= 0 ? end + shift : 0;
  head.splice(after + 1, 0, ...missing);
  // a field the edit emptied is dropped
  const kept = head.filter((l) => l !== "\u0000");
  // keep a blank line between the title and the first field, as the wiki does
  if (kept.length > 1 && kept[1].trim() !== "" && /^#\s/.test(kept[0])) kept.splice(1, 0, "");

  return `${kept.join("\n").replace(/\s+$/, "")}\n\n${edit.body.replace(/\r\n?/g, "\n").trim()}\n`;
}

/** The folder index with the note's entry carrying its new title, or null when there is nothing to change. */
export function retitledIndex(index: string, slug: string, oldTitle: string, newTitle: string): string | null {
  if (oldTitle === newTitle) return null;
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s*[-*]\\s+\\[\\[(?:[^\\]|]*/)?${esc}(?:\\|[^\\]]*)?\\]\\]\\s+[—–-]\\s+)(.*)$`);
  let changed = false;
  const out = index.split("\n").map((l) => {
    const m = l.match(re);
    if (!m || m[2].trim() !== oldTitle) return l;
    changed = true;
    return `${m[1]}${newTitle}`;
  });
  return changed ? out.join("\n") : null;
}

/** Two copies of a note are the same file, whatever their line endings. */
export const sameText = (a: string, b: string) => a.replace(/\r\n?/g, "\n").trimEnd() === b.replace(/\r\n?/g, "\n").trimEnd();
