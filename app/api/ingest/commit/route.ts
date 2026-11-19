import { revalidatePath, revalidateTag } from "next/cache";
import { hasWikiSource } from "@/lib/wiki";
import { commitImport, WriteError, type StagedFile } from "@/lib/wiki-write";
import { DOMAIN, sourceName } from "@/lib/guard";
import { isOwner } from "@/lib/auth";
import { MAX_BYTES, kindOf } from "@/lib/ingest";

/* Save an import (signed-in owner only): POST multipart { file, domain, files (JSON StagedFile[]), title }.
 * The source goes to sources/<domain>/ and every drafted page to wiki/, in one commit. */

const json = (status: number, body: object) => Response.json(body, { status });
const PAGE_PATH = /^wiki\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*){0,4}\.md$/;

export async function POST(req: Request) {
  if (!hasWikiSource()) return json(503, { code: "not-configured", error: "Saving needs the wiki on GitHub." });
  if (!(await isOwner())) return json(401, { code: "signed-out", error: "Sign in with your passkey to save." });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { code: "invalid", error: "Nothing to save." });
  }
  const file = form.get("file");
  const domain = String(form.get("domain") ?? "");
  if (!(file instanceof File) || file.size > MAX_BYTES || !kindOf(file.name, file.type) || !DOMAIN.test(domain)) return json(400, { code: "invalid", error: "Import the file again." });
  let files: StagedFile[];
  try {
    files = JSON.parse(String(form.get("files") ?? "[]"));
  } catch {
    return json(400, { code: "invalid", error: "The drafts could not be read." });
  }
  if (
    !Array.isArray(files) ||
    !files.length ||
    files.length > 60 ||
    !files.every((f) => f && typeof f.path === "string" && PAGE_PATH.test(f.path) && typeof f.content === "string" && f.content.length <= 200_000 && (f.before === null || typeof f.before === "string"))
  )
    return json(400, { code: "invalid", error: "The drafts are not valid wiki pages." });
  const name = sourceName(file.name);
  const title = String(form.get("title") ?? name).slice(0, 120);
  try {
    const res = await commitImport(
      { path: `sources/${domain}/${name}`, bytes: Buffer.from(await file.arrayBuffer()) },
      files.map((f) => ({ path: f.path, content: f.content, before: f.before })),
      `Ingest ${title}\n\nSource saved to sources/${domain}/${name}; ${files.length} wiki page${files.length === 1 ? "" : "s"} written from it, from the 2Brain web app.`,
    );
    revalidateTag("wiki", { expire: 0 });
    revalidatePath("/");
    revalidatePath("/wiki/[...slug]", "page");
    return json(200, { ok: true, commitUrl: res.commitUrl });
  } catch (e) {
    if (e instanceof WriteError) return json(e.code === "conflict" || e.code === "exists" ? 409 : 502, { code: e.code, error: e.message });
    console.error("[2brain] import save failed", e);
    return json(500, { code: "github", error: "The import could not be saved. Try again in a moment." });
  }
}
