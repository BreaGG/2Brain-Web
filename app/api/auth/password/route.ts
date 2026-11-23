import { passwordConfigured, passwordOk, relyingParty, startSession } from "@/lib/auth";

/* Sign in with the user name and key from the site's environment variables (ACCESS_USER and
 * PASSKEY_SETUP_CODE): for a device that has no passkey yet. Failed tries are slowed down and,
 * after a handful, refused for a while. */

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const WINDOW = 15 * 60_000;
const MAX = 6;
const fails = new Map<string, { n: number; first: number }>();

export async function POST(req: Request) {
  if (!passwordConfigured()) return json(503, { error: "Signing in with a user name needs ACCESS_USER and PASSKEY_SETUP_CODE in the site's environment variables." });
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "?").split(",")[0].trim();
  const now = Date.now();
  const f = fails.get(ip);
  if (f && now - f.first > WINDOW) fails.delete(ip);
  const cur = fails.get(ip);
  if (cur && cur.n >= MAX) return json(429, { error: "Too many tries. Wait a few minutes, or use your passkey." });

  const body = (await req.json().catch(() => ({}))) as { user?: string; key?: string };
  if (!passwordOk(body.user, body.key)) {
    fails.set(ip, { n: (cur?.n ?? 0) + 1, first: cur?.first ?? now });
    await new Promise((r) => setTimeout(r, 700));
    return json(401, { error: "That user name and key do not match." });
  }
  fails.delete(ip);
  await startSession("password", relyingParty(req).secure);
  return json(200, { ok: true });
}
