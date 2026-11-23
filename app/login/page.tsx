import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isOwner, loadPasskeys, passwordConfigured } from "@/lib/auth";
import { gateOn } from "@/lib/session";
import Login from "./Login";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in — 2Brain", robots: { index: false, follow: false } };

/** Only a path on this site: never somewhere else. */
function safeNext(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (!gateOn() || (await isOwner())) redirect(next);
  // fresh: the cache lives per bundle, and a passkey may have just been made elsewhere
  const registered = (await loadPasskeys(true).catch(() => [])).length > 0;
  return <Login next={next} registered={registered} password={passwordConfigured()} />;
}
