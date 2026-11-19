import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { readRepoText, putRepoText } from "./wiki-write";

/* ───────────────────────────────────────────────────────────────────────────
 * Who may write: the owner, signed in with a passkey (Face ID, Touch ID, a
 * fingerprint or a security key). The passkeys' public keys live in the wiki
 * repository at .2brain/passkeys.json; a signed, HttpOnly cookie keeps the
 * owner signed in on a device for 30 days.
 * ─────────────────────────────────────────────────────────────────────────── */

export const SESSION = "2b_session";
export const CHALLENGE = "2b_challenge";
export const SESSION_DAYS = 30;
const STORE = ".2brain/passkeys.json";

export interface Passkey {
  id: string; // base64url credential id
  publicKey: string; // base64url COSE public key
  transports?: AuthenticatorTransportFuture[];
  name: string;
  createdAt: string;
}

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
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/** Is this request from the signed-in owner? */
export async function isOwner() {
  try {
    const jar = await cookies();
    const s = unsign<{ sub: string; exp: number }>(jar.get(SESSION)?.value);
    return s?.sub === "owner";
  } catch {
    return false;
  }
}

export async function startSession(credential: string, secure: boolean) {
  const jar = await cookies();
  jar.set(SESSION, sign({ sub: "owner", cred: credential, exp: Date.now() + SESSION_DAYS * 86400_000 }), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION);
}

/** Remember the challenge for one ceremony, for five minutes, in a signed cookie. */
export async function holdChallenge(challenge: string, kind: "reg" | "auth", secure: boolean) {
  (await cookies()).set(CHALLENGE, sign({ c: challenge, kind, exp: Date.now() + 300_000 }), { httpOnly: true, secure, sameSite: "strict", path: "/api/auth", maxAge: 300 });
}

export async function takeChallenge(kind: "reg" | "auth") {
  const jar = await cookies();
  const c = unsign<{ c: string; kind: string; exp: number }>(jar.get(CHALLENGE)?.value);
  jar.delete({ name: CHALLENGE, path: "/api/auth" });
  return c && c.kind === kind ? c.c : null;
}

/** The relying party is the site itself, as the browser sees it. */
export function relyingParty(req: Request) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost").split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return { rpID: host.replace(/:\d+$/, ""), origin: `${proto}://${host}`, secure: proto === "https" };
}

let cache: { at: number; list: Passkey[] } | null = null;

export async function loadPasskeys(fresh = false): Promise<Passkey[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.list;
  const raw = await readRepoText(STORE).catch(() => null);
  let list: Passkey[] = [];
  try {
    list = raw ? ((JSON.parse(raw) as { passkeys?: Passkey[] }).passkeys ?? []) : [];
  } catch {
    list = [];
  }
  cache = { at: Date.now(), list };
  return list;
}

export async function addPasskey(p: Passkey) {
  const list = (await loadPasskeys(true)).filter((x) => x.id !== p.id);
  list.push(p);
  const body = `${JSON.stringify({ about: "Passkeys that may write to this wiki from the 2brain web app. Public keys only; remove an entry to revoke it.", passkeys: list }, null, 2)}\n`;
  await putRepoText(STORE, body, `Add a passkey for the 2brain web app (${p.name})`);
  cache = { at: Date.now(), list };
}

/** The one-time code that lets the first passkey be set up. */
export function setupCodeOk(given: unknown) {
  const wanted = process.env.PASSKEY_SETUP_CODE || process.env.WIKI_WRITE_KEY;
  if (!wanted || typeof given !== "string" || !given) return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(wanted).digest();
  return timingSafeEqual(a, b);
}

export const setupConfigured = () => !!(process.env.PASSKEY_SETUP_CODE || process.env.WIKI_WRITE_KEY);
