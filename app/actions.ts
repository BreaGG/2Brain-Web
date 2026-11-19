"use server";

import { revalidatePath, updateTag } from "next/cache";
import { commitEdit, commitNote, WriteError } from "@/lib/wiki-write";
import { isOwner } from "@/lib/auth";

export interface WriteInput {
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
  | { ok: false; code: "locked" | "signed-out" | "invalid" | "exists" | "not-configured" | "github" | "conflict" | "missing"; error: string };

const FOLDER = /^[a-z0-9][a-z0-9-]{0,60}(\/[a-z0-9][a-z0-9-]{0,60}){0,3}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const LINK = /^[a-z0-9][a-z0-9/-]{0,160}$/;
const TYPE = /^[a-z][a-z-]{1,30}$/;


/** Write a new note to the wiki repository and add it to its folder's index, in one commit. */
export async function writeNote(input: WriteInput): Promise<WriteResult> {
  if (!(await isOwner())) return { ok: false, code: "signed-out", error: "Sign in with your passkey to save." };

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

export interface EditInput {
  /** The note's id: its path under wiki/ without .md, e.g. research/concept-x. */
  id: string;
  /** The note's markdown as the editor opened it. */
  base: string;
  title: string;
  type: string;
  domains: string[];
  sources: string[];
  body: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,100}(\/[A-Za-z0-9][A-Za-z0-9._ -]{0,100}){0,5}$/;

/** Save an edit to a note that is already in the wiki. */
export async function editNote(input: EditInput): Promise<WriteResult> {
  if (!(await isOwner())) return { ok: false, code: "signed-out", error: "Sign in with your passkey to save." };

  const id = String(input.id ?? "").trim();
  const base = String(input.base ?? "");
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const type = String(input.type ?? "").trim().toLowerCase();
  const body = String(input.body ?? "");
  const domains = (Array.isArray(input.domains) ? input.domains : []).map((d) => String(d).trim().toLowerCase()).filter(Boolean).slice(0, 4);
  const sources = (Array.isArray(input.sources) ? input.sources : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 12);

  const bad = (error: string): WriteResult => ({ ok: false, code: "invalid", error });
  if (!ID.test(id) || id.includes("..")) return bad("That note cannot be edited from here.");
  if (!title || title.length > 200) return bad("Give the note a title of up to 200 characters.");
  if (/[\r\n]/.test(title) || title.startsWith("#")) return bad("The title must be a single line.");
  if (!TYPE.test(type)) return bad("Choose a type.");
  if (body.length > 200_000 || base.length > 400_000) return bad("The note is too long to save from here.");
  if (!domains.every((d) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(d))) return bad("Domains use letters, digits, spaces and dashes.");
  if (!sources.every((s) => LINK.test(s))) return bad("Sources are note file names, such as source-the-mom-test.");

  try {
    const res = await commitEdit(id, base, { title, type, domains, sources, body });
    updateTag("wiki");
    revalidatePath("/");
    revalidatePath("/wiki/[...slug]", "page");
    return { ok: true, slug: id, path: res.path, commitUrl: res.commitUrl, indexed: res.indexed };
  } catch (e) {
    if (e instanceof WriteError) return { ok: false, code: e.code, error: e.message };
    console.error("[2brain] edit failed", e);
    return { ok: false, code: "github", error: "The edit could not be saved. Try again in a moment." };
  }
}

let lastSync = 0;

/** Fetch the wiki afresh now (the Sync button). Throttled so it cannot hammer GitHub. */
export async function syncWiki(): Promise<{ ok: boolean; wait?: number }> {
  const now = Date.now();
  if (now - lastSync < 10_000) return { ok: false, wait: Math.ceil((10_000 - (now - lastSync)) / 1000) };
  lastSync = now;
  updateTag("wiki");
  revalidatePath("/");
  revalidatePath("/wiki/[...slug]", "page");
  return { ok: true };
}
