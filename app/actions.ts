"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { commitNote, WriteError } from "@/lib/wiki-write";

export interface WriteInput {
  key: string;
  title: string;
  type: string;
  folder: string;
  slug: string;
  domains: string[];
  sources: string[];
  body: string;
}

export type WriteResult =
  | { ok: true; slug: string; path: string; commitUrl: string; indexed: string[] }
  | { ok: false; code: "locked" | "bad-key" | "invalid" | "exists" | "not-configured" | "github"; error: string };

const FOLDER = /^[a-z0-9][a-z0-9-]{0,60}(\/[a-z0-9][a-z0-9-]{0,60}){0,3}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const LINK = /^[a-z0-9][a-z0-9/-]{0,160}$/;
const TYPE = /^[a-z][a-z-]{1,30}$/;

function sameKey(given: string, wanted: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}

/** Write a new note to the wiki repository and add it to its folder's index, in one commit. */
export async function writeNote(input: WriteInput): Promise<WriteResult> {
  const wanted = process.env.WIKI_WRITE_KEY;
  if (!wanted) return { ok: false, code: "locked", error: "Writing is off. Set WIKI_WRITE_KEY in the site's environment variables to turn it on." };
  if (typeof input?.key !== "string" || !sameKey(input.key, wanted)) return { ok: false, code: "bad-key", error: "That write key is not right." };

  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const type = String(input.type ?? "").trim().toLowerCase();
  const folder = String(input.folder ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const body = String(input.body ?? "");
  const domains = (Array.isArray(input.domains) ? input.domains : []).map((d) => String(d).trim().toLowerCase()).filter(Boolean).slice(0, 4);
  const sources = (Array.isArray(input.sources) ? input.sources : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 12);

  const bad = (error: string): WriteResult => ({ ok: false, code: "invalid", error });
  if (!title || title.length > 200) return bad("Give the note a title of up to 200 characters.");
  if (/[\r\n]/.test(title) || title.startsWith("#")) return bad("The title must be a single line.");
  if (!TYPE.test(type)) return bad("Choose a type.");
  if (!FOLDER.test(folder)) return bad("Folder names use lower-case letters, digits and dashes.");
  if (!SLUG.test(slug) || slug === "index") return bad("File names use lower-case letters, digits and dashes, and cannot be “index”.");
  if (body.length > 200_000) return bad("The note is too long to save from here.");
  if (!domains.every((d) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(d))) return bad("Domains use letters, digits, spaces and dashes.");
  if (!sources.every((s) => LINK.test(s))) return bad("Sources are note file names, such as source-the-mom-test.");

  try {
    const res = await commitNote({ title, type, folder, slug, domains: domains.length ? domains : [folder.split("/")[0]], sources, body });
    // read-your-own-writes: the next render fetches the wiki afresh
    updateTag("wiki");
    revalidatePath("/");
    return { ok: true, slug: `${folder}/${slug}`, path: res.path, commitUrl: res.commitUrl, indexed: res.indexed };
  } catch (e) {
    if (e instanceof WriteError) return { ok: false, code: e.code, error: e.message };
    console.error("[2brain] write failed", e);
    return { ok: false, code: "github", error: "The note could not be saved. Try again in a moment." };
  }
}
