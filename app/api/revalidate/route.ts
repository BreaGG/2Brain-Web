import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * GitHub webhook: point a "push" webhook of the wiki repository at
 * /api/revalidate with the secret in WIKI_WEBHOOK_SECRET, and every push shows
 * up in the brain at once.
 */
export async function POST(req: Request) {
  const secret = process.env.WIKI_WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, error: "WIKI_WEBHOOK_SECRET is not set" }, { status: 503 });
  const body = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const want = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  const event = req.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true, pong: true });
  revalidateTag("wiki", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/wiki/[...slug]", "page");
  return Response.json({ ok: true, revalidated: true, event });
}
