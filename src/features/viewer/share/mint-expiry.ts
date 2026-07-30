/**
 * Asks the server to sign an expiry for a share link.
 *
 * The model never leaves the browser: we send a SHA-256 of the compressed
 * payload and the chosen expiry, and get back a signature. That is the whole
 * exchange — see `signature.ts` for why a signature replaces the database an
 * expiring link would otherwise need.
 *
 * Failure is a first-class outcome, not an exception. A deployment with no
 * signing key answers 503, and the caller's job is then to offer a link WITHOUT
 * an expiry rather than no link at all — expiry is opt-in, so its absence is a
 * normal state, and refusing to share because expiry is unavailable would be a
 * worse trade than sharing something permanent.
 */

export type MintedExpiry =
  | { status: "ok"; expiresAt: number; signature: string }
  | { status: "unavailable"; message: string };

/** Seconds per day, named so the arithmetic below reads as intent. */
const DAY_SECONDS = 24 * 60 * 60;

/**
 * `digest` comes from `shareDigestFor(alabText)` in the codec, so compression
 * details stay in one place and this module only speaks HTTP.
 */
export async function mintExpiry(
  digest: string,
  ttlDays: number,
): Promise<MintedExpiry> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * DAY_SECONDS;

  try {
    const response = await fetch("/api/share/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ digest, expiresAt }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        status: "unavailable",
        message:
          detail?.error ??
          `the signing service answered ${response.status.toString()}`,
      };
    }
    const body = (await response.json()) as {
      signature?: unknown;
      expiresAt?: unknown;
    };
    if (typeof body.signature !== "string" || body.signature === "") {
      return {
        status: "unavailable",
        message: "the signing service returned no signature",
      };
    }
    return { status: "ok", expiresAt, signature: body.signature };
  } catch {
    return {
      status: "unavailable",
      message: "the signing service could not be reached",
    };
  }
}
