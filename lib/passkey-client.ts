"use client";

import { startAuthentication, startRegistration, WebAuthnAbortService } from "@simplewebauthn/browser";

/* The browser half of passkeys: ask the server for a challenge, let the device sign it
 * (Face ID, Touch ID, a fingerprint, a PIN or a security key), and send the answer back. */

export interface AuthState {
  owner: boolean;
  registered: boolean;
  setup: boolean;
  available: boolean;
  passkeys?: { name: string; createdAt: string }[];
}

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}.`);
  return out;
}

const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/** A name for the passkey from the device it is made on, so the list in the repository reads well. */
export function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const what = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  return `${what} · ${new Date().toISOString().slice(0, 10)}`;
}

export async function signIn() {
  WebAuthnAbortService.cancelCeremony();
  const { options } = (await post("/api/auth/login", { step: "options" })) as unknown as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"] };
  try {
    const response = await startAuthentication({ optionsJSON: options });
    await post("/api/auth/login", { step: "verify", response });
  } catch (e) {
    if (cancelled(e)) throw new Error("Cancelled.");
    throw e;
  }
}

/** Make a passkey: the first one with the setup code, more when already signed in. */
export async function createPasskey(code?: string) {
  WebAuthnAbortService.cancelCeremony();
  const { options } = (await post("/api/auth/register", { step: "options", code })) as unknown as { options: Parameters<typeof startRegistration>[0]["optionsJSON"] };
  try {
    const response = await startRegistration({ optionsJSON: options });
    await post("/api/auth/register", { step: "verify", response, code, name: deviceName() });
  } catch (e) {
    if (cancelled(e)) throw new Error("Cancelled.");
    if (e instanceof Error && e.name === "InvalidStateError") throw new Error("This device already has a passkey for 2brain; sign in with it.");
    throw e;
  }
}

/** Sign out on this device: end the session, forget the copy of the brain kept for offline use, and go to the door. */
export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  try {
    for (const k of await caches.keys()) if (k.startsWith("2brain-pages")) await caches.delete(k);
  } catch {
    /* no Cache Storage here */
  }
  window.location.replace("/login");
}
