/**
 * Server-side half of share-link expiry: turns `(digest, expiry)` into a
 * signature with the private key.
 *
 * SERVER ONLY. Reads `ARCHLAB_SHARE_PRIVATE_KEY`, which has no `NEXT_PUBLIC_`
 * prefix and so is never bundled for the browser. Importing this from a client
 * component would give you a module whose key is always empty — the
 * `unavailable` result below, permanently.
 *
 * Two callers, one implementation: `POST /api/share/sign` (for the browser Share
 * button, which cannot hold a private key) and the `create_share_link` MCP tool
 * (already running on the server, so it signs directly rather than calling its
 * own HTTP route).
 */

import { signingMessage } from "./signature";

export type SignedExpiry =
  | { status: "ok"; signature: string }
  /** No key configured, or the key is unusable. `message` is caller-safe. */
  | { status: "unavailable"; message: string };

const PRIVATE_KEY_JWK = process.env.ARCHLAB_SHARE_PRIVATE_KEY ?? "";

/**
 * Refuse absurd expiries. Not a security control — a caller can always ask
 * again — but it stops a typo or a buggy client minting a link dated in 9999.
 */
export const MAX_TTL_SECONDS = 400 * 24 * 60 * 60;

/** SHA-256 as base64url is exactly 43 characters of that alphabet. */
export const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** True when this deployment can mint expiring links at all. */
export function canSignExpiry(): boolean {
  return PRIVATE_KEY_JWK.trim() !== "";
}

let cachedKey: Promise<CryptoKey> | null = null;

function privateKey(): Promise<CryptoKey> {
  cachedKey ??= crypto.subtle.importKey(
    "jwk",
    JSON.parse(PRIVATE_KEY_JWK) as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function signExpiry(
  digest: string,
  expiresAt: number,
): Promise<SignedExpiry> {
  if (!canSignExpiry()) {
    return {
      status: "unavailable",
      message:
        "expiring links are not configured on this deployment (ARCHLAB_SHARE_PRIVATE_KEY is unset)",
    };
  }
  try {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await privateKey(),
      signingMessage(digest, expiresAt) as unknown as ArrayBuffer,
    );
    return { status: "ok", signature: toBase64Url(new Uint8Array(signature)) };
  } catch {
    // A bad key is a deployment fault. The message must not describe the key.
    return {
      status: "unavailable",
      message:
        "the signing key could not be used — check ARCHLAB_SHARE_PRIVATE_KEY is a P-256 ECDSA private JWK",
    };
  }
}
