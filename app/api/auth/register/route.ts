import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { hasWikiSource } from "@/lib/wiki";
import { addPasskey, holdChallenge, isOwner, loadPasskeys, relyingParty, setupCodeOk, startSession, takeChallenge } from "@/lib/auth";

/* Set up a passkey. The first one needs the one-time setup code (PASSKEY_SETUP_CODE, or the
 * old WIKI_WRITE_KEY); after that only a signed-in owner can add another, for a new device. */

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!hasWikiSource()) return json(503, { error: "Passkeys need the wiki on GitHub (GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN)." });
  const body = (await req.json().catch(() => ({}))) as { step?: string; code?: string; response?: RegistrationResponseJSON; name?: string };
  const { rpID, origin, secure } = relyingParty(req);
  const keys = await loadPasskeys(true);
  const allowed = keys.length ? await isOwner() : setupCodeOk(body.code);
  if (!allowed) return json(401, { error: keys.length ? "Sign in on a device that has your passkey to add another." : "That setup code is not right." });

  if (body.step === "options") {
    const options = await generateRegistrationOptions({
      rpName: "2brain",
      rpID,
      userName: "owner",
      userDisplayName: "2brain owner",
      userID: new TextEncoder().encode("2brain-owner"),
      attestationType: "none",
      excludeCredentials: keys.map((k) => ({ id: k.id, transports: k.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    await holdChallenge(options.challenge, "reg", secure);
    return json(200, { options });
  }

  if (body.step === "verify" && body.response) {
    const expectedChallenge = await takeChallenge("reg");
    if (!expectedChallenge) return json(400, { error: "That took too long; try again." });
    try {
      const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
      if (!v.verified || !v.registrationInfo) return json(400, { error: "The passkey could not be checked." });
      const c = v.registrationInfo.credential;
      const name = String(body.name ?? "").replace(/[^\p{L}\p{N} .,·'()-]/gu, "").trim().slice(0, 60) || "Passkey";
      await addPasskey({ id: c.id, publicKey: Buffer.from(c.publicKey).toString("base64url"), transports: c.transports, name, createdAt: new Date().toISOString() });
      await startSession(c.id, secure);
      return json(200, { ok: true });
    } catch (e) {
      console.error("[2brain] passkey setup failed", e);
      return json(400, { error: "The passkey could not be saved. Try again." });
    }
  }
  return json(400, { error: "Unknown step." });
}
