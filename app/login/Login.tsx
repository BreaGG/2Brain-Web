"use client";

import { useState } from "react";
import { Wordmark } from "@/components/ui";
import { PasskeyGlyph } from "@/components/app/SignIn";
import { createPasskey, signIn } from "@/lib/passkey-client";

/** The door to the brain: a passkey made on this device, or the user name and key from the site's settings. */
export default function Login({ next, registered, password }: { next: string; registered: boolean; password: boolean }) {
  const [busy, setBusy] = useState<"passkey" | "password" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [key, setKey] = useState("");
  const [offer, setOffer] = useState(false);

  const go = () => window.location.replace(next);
  const run = async (what: "passkey" | "password" | "create", f: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError((e as Error).message || "That did not work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const withPassword = () =>
    run("password", async () => {
      const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, key }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}.`);
      // on a device that can hold a passkey, offer one, so next time no key is needed
      if (typeof window !== "undefined" && "PublicKeyCredential" in window) setOffer(true);
      else go();
    });

  if (offer)
    return (
      <main className="login">
        <div className="login-card">
          <Wordmark big />
          <h1>You&rsquo;re in.</h1>
          <p className="login-lede">Make a passkey on this device and next time Face ID, Touch ID, a fingerprint or your PIN opens your brain, with no key to type.</p>
          <button type="button" className="btn solid" disabled={!!busy} onClick={() => run("create", async () => (await createPasskey(), go()))}>
            <PasskeyGlyph /> {busy === "create" ? "Waiting for your device…" : "Create a passkey here"}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={go}>
            Not now
          </button>
          {error && <small className="write-warn">{error}</small>}
        </div>
      </main>
    );

  return (
    <main className="login">
      <div className="login-card">
        <Wordmark big />
        <h1>Your brain is private.</h1>
        <p className="login-lede">Sign in to open it. You stay signed in on this device for 15 days.</p>

        {registered && (
          <button type="button" className="btn solid" disabled={!!busy} onClick={() => run("passkey", async () => (await signIn(), go()))}>
            <PasskeyGlyph /> {busy === "passkey" ? "Waiting for your device…" : "Sign in with passkey"}
          </button>
        )}

        {registered && password && <div className="login-or label">or</div>}

        {password && (
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (user && key) withPassword();
            }}
          >
            <label className="write-field">
              <span className="label">User</span>
              <input className="field-input" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
            </label>
            <label className="write-field">
              <span className="label">Key</span>
              <input className="field-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" className={`btn${registered ? "" : " solid"}`} disabled={!!busy || !user || !key}>
              {busy === "password" ? "Checking…" : "Sign in with user and key"}
            </button>
          </form>
        )}

        {!registered && !password && (
          <p className="login-lede">
            Nothing to sign in with yet. Add <b>ACCESS_USER</b> and <b>PASSKEY_SETUP_CODE</b> to the site&rsquo;s environment variables, then sign in here and make a passkey.
          </p>
        )}

        {error && <small className="write-warn">{error}</small>}
      </div>
    </main>
  );
}
