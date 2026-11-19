import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { hasWikiSource } from "@/lib/wiki";
import { holdChallenge, loadPasskeys, relyingParty, startSession, takeChallenge } from "@/lib/auth";

/* Sign in with a passkey: { step: "options" }, then { step: "verify", response }. */

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!hasWikiSource()) return json(503, { error: "Passkeys need the wiki on GitHub." });
  const body = (await req.json().catch(() => ({}))) as { step?: string; response?: AuthenticationResponseJSON };
  const { rpID, origin, secure } = relyingParty(req);
  const keys = await loadPasskeys();
  if (!keys.length) return json(409, { error: "No passkey is set up yet." });

  if (body.step === "options") {
    const options = await generateAuthenticationOptions({ rpID, allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports })), userVerification: "preferred" });
    await holdChallenge(options.challenge, "auth", secure);
    return json(200, { options });
  }

  if (body.step === "verify" && body.response) {
    const expectedChallenge = await takeChallenge("auth");
    if (!expectedChallenge) return json(400, { error: "That took too long; try again." });
    const key = (await loadPasskeys(true)).find((k) => k.id === body.response!.id);
    if (!key) return json(401, { error: "That passkey is not one of yours." });
    try {
      const v = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        // synced passkeys keep their counter at 0, so it is not tracked
        credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.publicKey, "base64url")), counter: 0, transports: key.transports },
        requireUserVerification: false,
      });
      if (!v.verified) return json(401, { error: "The passkey could not be checked." });
      await startSession(key.id, secure);
      return json(200, { ok: true });
    } catch (e) {
      console.error("[2brain] passkey sign-in failed", e);
      return json(401, { error: "The passkey could not be checked." });
    }
  }
  return json(400, { error: "Unknown step." });
}
