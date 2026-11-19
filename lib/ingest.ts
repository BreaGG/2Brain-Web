import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import TurndownService from "turndown";
import type { ParsedPage } from "./types";
import type { StagedFile } from "./wiki-write";

/* ───────────────────────────────────────────────────────────────────────────
 * Importing a source (a PDF, a web page saved as HTML, or Markdown/text):
 * Claude runs the wiki's own "Ingest" workflow from its CLAUDE.md, reading
 * the pages it needs and drafting every page it would write. Nothing is
 * written here: the drafts go back to the person, who saves them in one
 * commit (see commitImport).
 * ─────────────────────────────────────────────────────────────────────────── */

export const INGEST_MODEL = "claude-sonnet-5-5";
export const MAX_BYTES = 4 * 1024 * 1024; // the hosting platform caps request bodies at about 4.5 MB
const MAX_TURNS = 40;
const MAX_MS = 270_000;

export type SourceKind = "pdf" | "html" | "text";

export function kindOf(name: string, type: string): SourceKind | null {
  const n = name.toLowerCase();
  if (type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (type === "text/html" || /\.html?$/.test(n)) return "html";
  if (/\.(md|markdown|txt)$/.test(n) || type === "text/plain" || type === "text/markdown") return "text";
  return null;
}

/** A web page as Markdown: scripts, styles and page furniture dropped. */
export function htmlToMarkdown(html: string) {
  const clean = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(nav|footer|aside|form)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  return td.turndown(clean).replace(/\n{3,}/g, "\n\n").trim();
}

export type IngestEvent =
  | { type: "read"; path: string }
  | { type: "write"; path: string; chars: number; isNew: boolean }
  | { type: "note"; text: string }
  | { type: "staged"; files: StagedFile[]; summary: string; warnings: string[] }
  | { type: "error"; error: string };

const FALLBACK_SCHEMA = `Pages live in wiki/<domain>/. Every ingest writes a source summary page wiki/<domain>/<source-slug>-summary.md, creates or updates the entity and concept pages the source touches (each with a "Source notes" entry), adds the new pages to wiki/<domain>/index.md and appends a Log entry to wiki/index.md. Use [[slug]] links.`;

function systemPrompt(schema: string | null, pages: ParsedPage[]) {
  const catalog = [...pages]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p) => `- ${p.path} — ${p.title} (${p.type})`)
    .join("\n");
  return `You maintain a personal wiki kept in a GitHub repository, following the repository's own instructions below. You are running its Ingest workflow from a web app, without a person to talk to during the run: where the workflow says to discuss with the human or ask what to emphasise, use your judgment and say what you chose in your final summary.

How this run works:
- The source is attached to the first message. The app saves it at the path given there; never write under sources/.
- read_page returns a wiki page as it is now. Read a page before you change it, and when you change it write the whole page back with everything else in it kept as it was.
- write_page drafts a page (the whole file). Nothing is saved until the person reviews the drafts; write each page once, in its final form.
- Do every step the workflow asks for: the source summary page, the entity and concept pages (update the ones that exist, create the ones that should), the domain index (new pages, page count, Last updated, overview if it shifted) and the Log entry plus Last updated in wiki/index.md.
- Links use the wiki's [[slug]] form; match the slugs of pages that exist exactly.
- Write the pages in the language the wiki's pages on this subject are written in.
- When everything is drafted, call finish with a short summary for the person: what the source is, which pages you wrote and why, and any choice you made for them.

The repository's instructions (its CLAUDE.md):
<instructions>
${schema ?? FALLBACK_SCHEMA}
</instructions>

Every page in the wiki now:
${catalog}`;
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "read_page",
    description: "Read a wiki page as it is now. Give its path exactly as the catalog writes it, such as wiki/personal/index.md.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "write_page",
    description: "Draft the whole content of a wiki page, new or changed. Read an existing page first. Paths are wiki/<domain>/<slug>.md, lower-case with dashes.",
    input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "finish",
    description: "Call once every page is drafted, with a short summary for the person of what was written and why.",
    input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
    eager_input_streaming: true,
  },
];

const PAGE_PATH = /^wiki\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*){0,4}\.md$/;

export async function runIngest(opts: {
  source: { kind: SourceKind; name: string; text?: string; base64?: string };
  sourcePath: string;
  domain: string;
  pages: ParsedPage[];
  schema: string | null;
  signal: AbortSignal;
  emit: (e: IngestEvent) => void;
}) {
  const { source, sourcePath, domain, pages, schema, signal, emit } = opts;
  const client = new Anthropic();
  const byPath = new Map(pages.map((p) => [p.path, p.rawContent]));
  const read = new Map<string, string>();
  const staged = new Map<string, StagedFile>();
  const started = Date.now();

  const doc: Anthropic.Beta.BetaContentBlockParam =
    source.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: source.base64! }, title: source.name, cache_control: { type: "ephemeral" } }
      : { type: "document", source: { type: "text", media_type: "text/plain", data: source.text! }, title: source.name, cache_control: { type: "ephemeral" } };
  const today = new Date().toISOString().slice(0, 10);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        doc,
        {
          type: "text",
          text: `Ingest this source into the wiki. It is saved at ${sourcePath} (domain: ${domain}). Today is ${today}.`,
        },
      ],
    },
  ];

  let summary = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (Date.now() - started > MAX_MS) {
      emit({ type: "error", error: "This source took too long to work through in one go. Try a shorter file, or split it." });
      return;
    }
    const stream = client.beta.messages.stream(
      {
        model: INGEST_MODEL,
        max_tokens: 64_000,
        output_config: { effort: "medium" },
        // if the model declines on a safety classifier, the API carries on with a fallback model
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: systemPrompt(schema, pages), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    let said = "";
    stream.on("text", (t) => (said += t));
    const msg = await stream.finalMessage();
    if (said.trim()) emit({ type: "note", text: said.trim() });
    if (msg.stop_reason === "refusal") {
      emit({ type: "error", error: "Claude declined to work on this source." });
      return;
    }
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "max_tokens" && uses.length) {
      emit({ type: "error", error: "A page came out too long to finish. Try a shorter source." });
      return;
    }
    if (!uses.length) break;
    messages.push({ role: "assistant", content: msg.content });

    let done = false;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
      const input = (u.input ?? {}) as Record<string, unknown>;
      const fail = (content: string): Anthropic.Beta.BetaToolResultBlockParam => ({ type: "tool_result", tool_use_id: u.id, is_error: true, content });
      if (u.name === "read_page") {
        const path = typeof input.path === "string" ? input.path.trim() : "";
        const now = staged.get(path)?.content ?? byPath.get(path);
        if (now == null) return fail(`There is no page at ${path}. Pages are listed in the catalog.`);
        if (!read.has(path) && byPath.has(path)) read.set(path, byPath.get(path)!);
        emit({ type: "read", path });
        return { type: "tool_result", tool_use_id: u.id, content: now };
      }
      if (u.name === "write_page") {
        const path = typeof input.path === "string" ? input.path.trim() : "";
        const content = typeof input.content === "string" ? input.content : null;
        if (!PAGE_PATH.test(path)) return fail("Pages are written under wiki/, as lower-case .md files with dashes, e.g. wiki/personal/concept-grit.md.");
        if (content == null || !content.trim()) return fail("Give the page's whole content.");
        if (content.length > 200_000) return fail("That page is too long.");
        const exists = byPath.has(path);
        if (exists && !read.has(path)) return fail(`Read ${path} with read_page first, so nothing already in it is lost.`);
        staged.set(path, { path, content: content.endsWith("\n") ? content : `${content}\n`, before: exists ? read.get(path)! : null });
        emit({ type: "write", path, chars: content.length, isNew: !exists });
        return { type: "tool_result", tool_use_id: u.id, content: `Drafted ${path}.` };
      }
      if (u.name === "finish") {
        summary = typeof input.summary === "string" ? input.summary : "";
        done = true;
        return { type: "tool_result", tool_use_id: u.id, content: "Thank you." };
      }
      return fail(`There is no tool called ${u.name}.`);
    });
    messages.push({ role: "user", content: results });
    if (done) break;
  }

  const files = [...staged.values()];
  if (!files.length) {
    emit({ type: "error", error: "No page was drafted from this source." });
    return;
  }
  // the workflow's must-dos, checked so the person sees what is missing before saving
  const warnings: string[] = [];
  if (!files.some((f) => /-summary\.md$/.test(f.path))) warnings.push("No source summary page (…-summary.md) was drafted.");
  if (!staged.has(`wiki/${domain}/index.md`)) warnings.push(`The ${domain} index (wiki/${domain}/index.md) was not updated.`);
  if (!staged.has("wiki/index.md")) warnings.push("No Log entry was added to wiki/index.md.");
  emit({ type: "staged", files, summary, warnings });
}
