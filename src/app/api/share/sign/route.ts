/**
 * `POST /api/share/sign` — signs `(payload digest, expiry)` for a share link.
 *
 * Stateless: nothing is written, nothing is remembered. The only server-side
 * state in the whole feature is a keypair in env, and the request body carries a
 * 32-byte digest, never a model. That is what lets an expiring link exist at all
 * without a database — see `features/viewer/share/signature.ts` for the design.
 *
 * KNOWN LIMITATION, deliberately accepted: this endpoint is unauthenticated,
 * like the rest of the app, so anyone holding a link can decode its payload,
 * digest it, and ask here for a signature with a later expiry. Expiry therefore
 * resists EDITING a link — the thing people actually do — and does not resist a
 * determined re-mint. It is presented to users as "expires", never as access
 * control or revocation. Closing that gap needs authentication or server-side
 * link records, both of which would change what this product is.
 *
 * Returns 503 when unconfigured, so a deployment without keys keeps working
 * exactly as before: expiry is opt-in and its absence means "never expires".
 */

import {
  canSignExpiry,
  DIGEST_PATTERN,
  MAX_TTL_SECONDS,
  signExpiry,
} from "@/features/viewer/share/sign-server";

export const runtime = "nodejs";

function bad(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!canSignExpiry()) {
    return bad(
      503,
      "Expiring links are not configured on this deployment (ARCHLAB_SHARE_PRIVATE_KEY is unset). Links without an expiry still work.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad(400, "Expected a JSON body.");
  }
  if (typeof body !== "object" || body === null) {
    return bad(400, "Expected a JSON object with `digest` and `expiresAt`.");
  }

  const { digest, expiresAt } = body as {
    digest?: unknown;
    expiresAt?: unknown;
  };
  if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
    return bad(
      400,
      "`digest` must be a base64url SHA-256 (43 characters of A-Z a-z 0-9 - _).",
    );
  }
  if (
    typeof expiresAt !== "number" ||
    !Number.isInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    return bad(400, "`expiresAt` must be whole seconds since the epoch.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now) {
    return bad(400, "`expiresAt` is already in the past.");
  }
  if (expiresAt - now > MAX_TTL_SECONDS) {
    return bad(
      400,
      `\`expiresAt\` is more than ${Math.round(MAX_TTL_SECONDS / 86_400)} days away.`,
    );
  }

  const signed = await signExpiry(digest, expiresAt);
  if (signed.status !== "ok") {
    // A key problem is a deployment fault, not the caller's; 500 rather than
    // 400, and the message never describes the key itself.
    return bad(500, `Could not sign: ${signed.message}.`);
  }
  return Response.json({ signature: signed.signature, expiresAt });
}
