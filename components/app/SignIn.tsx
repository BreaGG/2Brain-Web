"use client";

import { useState } from "react";
import { useApp } from "./context";
import { createPasskey, signIn } from "@/lib/passkey-client";

/** Sign in with a passkey, or set the first one up, where something needs the owner. */
export default function SignIn({ why }: { why: string }) {
  const { auth, refreshAuth } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  if (!auth) return <p className="write-dest">Checking who is here…</p>;
  if (auth.owner) return null;
  if (!auth.available) return <p className="write-dest">Signing in needs the wiki on GitHub.</p>;

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
      await refreshAuth();
    } catch (e) {
      setError((e as Error).message || "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (auth.registered)
    return (
      <div className="signin">
        <span className="write-dest">Sign in with your passkey to {why}.</span>
        <button type="button" className="btn solid" disabled={busy} onClick={() => run(() => signIn())}>
          <PasskeyGlyph /> {busy ? "Waiting for your device…" : "Sign in with passkey"}
        </button>
        {error && <small className="write-warn">{error}</small>}
      </div>
    );

  if (auth.setup)
    return (
      <div className="signin setup">
        <span className="write-dest">
          Set up a passkey to {why}: your device&rsquo;s Face ID, Touch ID, fingerprint or PIN signs you in from then on. Enter the setup code once (PASSKEY_SETUP_CODE, or your old write key).
        </span>
        <div className="signin-row">
          <input className="field-input" type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Setup code" aria-label="Setup code" autoComplete="one-time-code" />
          <button type="button" className="btn solid" disabled={busy || !code} onClick={() => run(() => createPasskey(code))}>
            <PasskeyGlyph /> {busy ? "Waiting for your device…" : "Create passkey"}
          </button>
        </div>
        {error && <small className="write-warn">{error}</small>}
      </div>
    );

  return <p className="write-dest">To {why}, set a PASSKEY_SETUP_CODE in the site&rsquo;s environment variables and set up your passkey here.</p>;
}

export function PasskeyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden style={{ verticalAlign: "-2px" }}>
      <circle cx="6" cy="5" r="2.6" />
      <path d="M1.5 14c0-2.7 2-4.5 4.5-4.5 1 0 1.9.3 2.6.8" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M12 11.1V15M12 13h1.5" />
    </svg>
  );
}
