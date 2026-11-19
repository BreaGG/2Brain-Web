import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** The write key, compared in constant time. */
export function rightKey(given: unknown) {
  const wanted = process.env.WIKI_WRITE_KEY;
  if (!wanted || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}

/** A file name safe to keep under sources/: no folders, no control characters. */
export function sourceName(name: string) {
  return name
    .replace(/[\\/]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
}

export const DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}$/;
