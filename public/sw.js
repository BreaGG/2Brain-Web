/* 2brain offline: keep the last copy of the brain on this device.
 *
 * - Pages (the brain and /wiki/… links): from the network when it answers within a few
 *   seconds, otherwise the last copy saved here. The page carries every note, so the
 *   whole wiki can be read from it offline.
 * - The app's code, fonts, icons and the anatomy atlas: from here first; they are
 *   versioned or rarely change.
 * - Everything that writes or asks (POST, /api/…) and the sign-in page: always the network.
 * - Signing out deletes the kept pages; a page that answers with a redirect (signed out)
 *   is never kept.
 */

const VERSION = "v2";
const PAGES = `2brain-pages-${VERSION}`;
const ASSETS = `2brain-assets-${VERSION}`;
const SHELL = ["/", "/anatomy/atlas.bin", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

// on install, save the brain and every script and style it needs, so the first offline visit works
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const assets = await caches.open(ASSETS);
      try {
        const res = await fetch("/", { cache: "no-store" });
        // signed out, the brain answers with the sign-in page: never keep that as the brain
        if (res.ok && !res.redirected) {
          const html = await res.clone().text();
          await pages.put("/", res);
          const urls = [...new Set([...html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)["')]/g)].map((m) => m[1]))];
          await Promise.all(urls.map((u) => assets.add(u).catch(() => {})));
        }
      } catch {
        /* offline at install: the next online visit fills the cache */
      }
      await Promise.all(SHELL.slice(1).map((u) => assets.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("2brain-") && k !== PAGES && k !== ASSETS) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// only the brain and its notes are kept for offline reading
const isPage = (req, url) => (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) && (url.pathname === "/" || url.pathname.startsWith("/wiki/"));
const isAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/anatomy/") || /\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname);

async function pageFirstFromNetwork(req) {
  const cache = await caches.open(PAGES);
  const key = new URL(req.url).pathname;
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
    if (res.ok && res.type === "basic" && !res.redirected) {
      await cache.put(key, res.clone());
      // the brain itself holds every note: keep it fresh whichever page was opened
      if (key !== "/" && !(await cache.match("/"))) fetch("/").then((r) => r.ok && !r.redirected && cache.put("/", r)).catch(() => {});
    }
    return res;
  } catch {
    // the page itself if it was saved, or the brain, which opens any note from the address
    return (await cache.match(key)) || (await cache.match("/")) || new Response("<h1>Offline</h1><p>Open 2brain once with a connection to read it offline.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function assetFromCache(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Google Fonts and other files from elsewhere: saved here as they are used
    if (url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com")) event.respondWith(assetFromCache(req));
    return;
  }
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || req.headers.get("RSC")) return;
  // the sign-in page is always the network's: it must reflect the passkeys there are now
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return;
  if (isPage(req, url)) event.respondWith(pageFirstFromNetwork(req));
  else if (isAsset(url)) event.respondWith(assetFromCache(req));
});
