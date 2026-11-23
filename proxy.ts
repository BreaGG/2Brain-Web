import { NextResponse, type NextRequest } from "next/server";
import { SESSION, gateOn, ownerToken } from "@/lib/session";

/* ───────────────────────────────────────────────────────────────────────────
 * The brain is private. Every request needs the owner's session cookie (a
 * passkey, or the user name and key from the site's environment variables)
 * except the sign-in page and what it needs: the auth API, the GitHub webhook
 * (which checks its own signature), the app's static files and the anatomy.
 * Pages go to /login; API calls get a 401. The sample wiki stays open.
 * ─────────────────────────────────────────────────────────────────────────── */

const OPEN = [/^\/login\/?$/, /^\/api\/auth\//, /^\/api\/revalidate\/?$/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!gateOn() || OPEN.some((r) => r.test(pathname))) return NextResponse.next();
  if (ownerToken(req.cookies.get(SESSION)?.value)) return NextResponse.next();

  const api = pathname.startsWith("/api/") || req.headers.has("next-action") || req.method !== "GET";
  if (api) return NextResponse.json({ code: "signed-out", error: "Sign in to your brain first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const to = new URL("/login", req.url);
  if (pathname !== "/") to.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(to);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // everything but the framework's own static files and the public assets the sign-in page draws with
  matcher: ["/((?!_next/static|_next/image|anatomy/|favicon\\.ico|icon-|apple-touch-icon|manifest\\.webmanifest|sw\\.js).*)"],
};
