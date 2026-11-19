import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";
import { getAllPages } from "@/lib/wiki";
import { ASK_MODEL, notesBlock, pickNotes, systemPrompt, userTurn } from "@/lib/ask";

/* Ask your brain. POST { question, key } and read back newline-delimited JSON:
 *   {"type":"read","ids":[...]}   the notes chosen for the question
 *   {"type":"text","text":"..."}  the answer, as it is written
 *   {"type":"reset"}              Claude stopped to read more notes: what it wrote so far is dropped
 *   {"type":"done","stop":"..."}  or {"type":"error","error":"..."}
 * The write key guards it: every question is billed to the site's API key. */

export const maxDuration = 120;

function sameKey(given: string, wanted: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}

const json = (status: number, body: object) => Response.json(body, { status });

// a little breathing room between questions on one server instance
let last = 0;

export async function POST(req: Request) {
  const wanted = process.env.WIKI_WRITE_KEY;
  if (!process.env.ANTHROPIC_API_KEY || !wanted) {
    return json(503, { code: "not-configured", error: "Asking is off. Set ANTHROPIC_API_KEY and WIKI_WRITE_KEY in the site's environment variables to turn it on." });
  }
  let body: { question?: unknown; key?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "invalid", error: "Send a question." });
  }
  if (typeof body.key !== "string" || !sameKey(body.key, wanted)) return json(401, { code: "bad-key", error: "That write key is not right." });
  const question = String(body.question ?? "").replace(/\s+/g, " ").trim();
  if (question.length < 3 || question.length > 1_000) return json(400, { code: "invalid", error: "Ask a question of up to 1,000 characters." });
  const now = Date.now();
  if (now - last < 2_000) return json(429, { code: "busy", error: "One question at a time; try again in a moment." });
  last = now;

  const pages = await getAllPages();
  const read = pickNotes(pages, question);
  const client = new Anthropic();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: object) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      send({ type: "read", ids: read.map((p) => p.slug) });
      try {
        const tools: Anthropic.Beta.BetaTool[] = [
          {
            name: "read_notes",
            description: "Read the full text of notes from the catalog that were not shown with the question. Give their ids exactly as the catalog writes them, such as personal/concept-grit.",
            input_schema: {
              type: "object",
              properties: { ids: { type: "array", items: { type: "string" }, description: "Up to eight note ids from the catalog." } },
              required: ["ids"],
              additionalProperties: false,
            },
            eager_input_streaming: true,
          },
        ];
        const bySlug = new Map(pages.map((p) => [p.slug, p]));
        const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userTurn(question, read) }];
        // at most two rounds of reading more, then it must answer
        for (let round = 0; round < 3; round++) {
          const answer = client.beta.messages.stream(
            {
              model: ASK_MODEL,
              max_tokens: 16_000,
              output_config: { effort: "medium" },
              // if the model declines on a safety classifier, the API answers with a fallback model instead
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
              tools,
              tool_choice: round < 2 ? { type: "auto" } : { type: "none" },
              system: [{ type: "text", text: systemPrompt(pages), cache_control: { type: "ephemeral" } }],
              messages,
            },
            { signal: req.signal },
          );
          answer.on("text", (t) => send({ type: "text", text: t }));
          const msg = await answer.finalMessage();
          if (msg.stop_reason === "refusal") {
            send({ type: "error", code: "refusal", error: "Claude declined to answer this question." });
            break;
          }
          const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (msg.stop_reason !== "tool_use" || !uses.length || round === 2) {
            send({ type: "done", stop: msg.stop_reason, model: msg.model });
            break;
          }
          // it wants to read more first: whatever it said before asking is not the answer
          send({ type: "reset" });
          messages.push({ role: "assistant", content: msg.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
            const ids = (u.input as { ids?: unknown })?.ids;
            if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
              return { type: "tool_result", tool_use_id: u.id, is_error: true, content: "ids must be a list of note ids from the catalog." };
            }
            const found = (ids as string[]).slice(0, 8).map((x) => bySlug.get(x.replace(/^\[\[|\]\]$/g, "").trim())).filter((p): p is NonNullable<typeof p> => !!p);
            send({ type: "read", ids: found.map((p) => p.slug), more: true });
            return { type: "tool_result", tool_use_id: u.id, content: notesBlock(found) };
          });
          messages.push({ role: "user", content: results });
        }
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) send({ type: "error", code: "auth", error: "The Anthropic API key was not accepted." });
        else if (e instanceof Anthropic.RateLimitError) send({ type: "error", code: "rate", error: "Too many questions for the API right now; try again in a minute." });
        else if (e instanceof Anthropic.APIUserAbortError) send({ type: "error", code: "aborted", error: "Stopped." });
        else if (e instanceof Anthropic.APIError) send({ type: "error", code: "api", error: `The API said ${e.status ?? "no"}: ${e.message}` });
        else {
          console.error("[2brain] ask failed", e);
          send({ type: "error", code: "failed", error: "The answer could not be fetched. Try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
