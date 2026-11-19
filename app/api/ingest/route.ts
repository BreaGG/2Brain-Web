import { getAllPages, hasWikiSource } from "@/lib/wiki";
import { readRepoText } from "@/lib/wiki-write";
import { DOMAIN, sourceName } from "@/lib/guard";
import { isOwner } from "@/lib/auth";
import { MAX_BYTES, htmlToMarkdown, kindOf, runIngest, type IngestEvent } from "@/lib/ingest";
import Anthropic from "@anthropic-ai/sdk";

/* Draft wiki pages from an uploaded source (signed-in owner only). POST multipart { file, domain }; the reply is
 * newline-delimited JSON IngestEvents, ending in "staged" (the drafts) or "error". Nothing is saved. */

export const maxDuration = 300;

const json = (status: number, body: object) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY || !hasWikiSource()) return json(503, { code: "not-configured", error: "Importing needs the wiki on GitHub and ANTHROPIC_API_KEY." });
  if (!(await isOwner())) return json(401, { code: "signed-out", error: "Sign in with your passkey to import." });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { code: "invalid", error: "Send a file." });
  }
  const file = form.get("file");
  const domain = String(form.get("domain") ?? "");
  if (!(file instanceof File)) return json(400, { code: "invalid", error: "Choose a file." });
  if (file.size > MAX_BYTES) return json(413, { code: "too-big", error: "The file is over 4 MB. Try a smaller one." });
  const kind = kindOf(file.name, file.type);
  if (!kind) return json(400, { code: "invalid", error: "Import a PDF, an HTML page, or a Markdown or text file." });
  if (!DOMAIN.test(domain)) return json(400, { code: "invalid", error: "Choose the section it belongs to." });
  const name = sourceName(file.name);
  if (!name) return json(400, { code: "invalid", error: "The file needs a name." });

  const bytes = Buffer.from(await file.arrayBuffer());
  const source =
    kind === "pdf"
      ? { kind, name, base64: bytes.toString("base64") }
      : { kind, name, text: kind === "html" ? htmlToMarkdown(bytes.toString("utf-8")) : bytes.toString("utf-8") };
  if (kind !== "pdf" && !source.text?.trim()) return json(400, { code: "invalid", error: "There is no text in that file." });

  const [pages, schema] = await Promise.all([getAllPages(), readRepoText("CLAUDE.md").catch(() => null)]);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: IngestEvent | { type: "start"; sourcePath: string }) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      const sourcePath = `sources/${domain}/${name}`;
      emit({ type: "start", sourcePath });
      try {
        await runIngest({ source, sourcePath, domain, pages, schema, signal: req.signal, emit });
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) emit({ type: "error", error: "The Anthropic API key was not accepted." });
        else if (e instanceof Anthropic.RateLimitError) emit({ type: "error", error: "Too many requests to the API right now; try again in a minute." });
        else if (e instanceof Anthropic.APIUserAbortError) emit({ type: "error", error: "Stopped." });
        else if (e instanceof Anthropic.APIError) emit({ type: "error", error: `The API said ${e.status ?? "no"}: ${e.message}` });
        else {
          console.error("[2brain] import failed", e);
          emit({ type: "error", error: "The import could not be finished. Try again." });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
