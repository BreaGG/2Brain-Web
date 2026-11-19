import { hasWikiSource } from "@/lib/wiki";
import { isOwner, loadPasskeys, setupConfigured } from "@/lib/auth";

/** Who is here: { owner, registered, setup }. Never cached. */
export async function GET() {
  if (!hasWikiSource()) return Response.json({ owner: false, registered: false, setup: false, available: false });
  const [owner, keys] = await Promise.all([isOwner(), loadPasskeys().catch(() => [])]);
  return Response.json(
    { owner, registered: keys.length > 0, setup: keys.length === 0 && setupConfigured(), available: true, passkeys: owner ? keys.map((k) => ({ name: k.name, createdAt: k.createdAt })) : undefined },
    { headers: { "Cache-Control": "no-store" } },
  );
}
