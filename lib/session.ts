import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/* ───────────────────────────────────────────────────────────────────────────
 * The session cookie, on its own: signing and checking it needs nothing but
 * the environment, so the proxy that guards every request can use it too.
 * ─────────────────────────────────────────────────────────────────────────── */

export const SESSION = "2b_session";
/** How long a sign-in lasts on a device: after this it asks again (the cookie is never extended). */
export const SESSION_DAYS = 15;

/** The key cookies are signed with: AUTH_SECRET if set, otherwise derived from the GitHub token the server already holds. */
function secret() {
  const base = process.env.AUTH_SECRET || process.env.GITHUB_TOKEN;
  if (!base) throw new Error("No secret to sign sessions with");
  return createHash("sha256").update(`2brain-auth:${base}`).digest();
}

export function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function unsign<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  try {
    const want = createHmac("sha256", secret()).update(body).digest();
    const got = Buffer.from(mac, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/** Is this session cookie the owner's, signed by us and not expired? */
export function ownerToken(token: string | undefined) {
  return unsign<{ sub: string; exp: number }>(token)?.sub === "owner";
}

/** The brain is private whenever it is the owner's own wiki; the sample wiki stays open. */
export function gateOn() {
  return Boolean(process.env.GITHUB_OWNER && process.env.GITHUB_REPO && process.env.GITHUB_TOKEN);
}

/** The key from Vercel: PASSKEY_SETUP_CODE, or the old WIKI_WRITE_KEY. */
export function accessKey() {
  return process.env.PASSKEY_SETUP_CODE || process.env.WIKI_WRITE_KEY || "";
}

/** The user name from Vercel: ACCESS_USER. */
export function accessUser() {
  return process.env.ACCESS_USER || "";
}

/** Compare two strings in constant time (as hashes, so their lengths do not leak either). */
export function same(given: unknown, wanted: string) {
  if (!wanted || typeof given !== "string" || !given) return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}
