/**
 * Tamper-resistant expiry for share links, without storing anything.
 *
 * The problem: a share link carries the whole model in its fragment, so there is
 * no record on any server to expire. Putting a bare `exp=…` in the URL would
 * "work" and mean nothing — the recipient edits one number and the link lives
 * forever.
 *
 * The fix is a signature, not a record. A keypair lives in env; the server signs
 * `(digest of payload, expiry)` and the browser verifies with the PUBLIC half.
 * Changing `exp` breaks the signature. Swapping the model breaks it too, because
 * the payload's digest is inside the signed message. Forging a fresh pair needs
 * the private key. No per-link state exists anywhere, so the system stays
 * stateless — the only server-side secret is a key, not your diagram.
 *
 * What the server sees is a 32-byte digest, never the model. "Nothing about this
 * model is uploaded" becomes "a fingerprint is, and only when you ask for an
 * expiring link".
 *
 * Honest limits, stated here so nobody mistakes this for access control:
 *   - NOT confidentiality. Whoever holds the link can decode the payload with
 *     their own tools and read the model forever. The signature stops them
 *     EXTENDING a link, not reading one they were given.
 *   - The clock is the reader's. Verification happens in the browser, because
 *     the fragment never reaches a server by design, so a determined reader can
 *     set their clock back. This raises tampering from trivial to deliberate; it
 *     is not enforcement.
 *   - Unsigned links keep working. Expiry is opt-in, so the absence of `exp` is
 *     normal and means "never expires", not "unverified".
 *
 * ECDSA P-256 over SHA-256: available in every browser's WebCrypto and in Node,
 * with a compact 64-byte raw signature (~86 base64url chars). Ed25519 would be
 * marginally smaller but has patchier browser history.
 */

/** Fragment parameter carrying the expiry, as seconds since the epoch. */
export const SHARE_PARAM_EXPIRES = "exp";

/** Fragment parameter carrying the signature over (digest, expiry). */
export const SHARE_PARAM_SIGNATURE = "sig";

const ALGORITHM = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as const;

/** Public half, readable by the browser that must verify. */
const PUBLIC_KEY_JWK = process.env.NEXT_PUBLIC_ARCHLAB_SHARE_PUBLIC_KEY ?? "";

export function base64UrlFromBytes(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function bytesFromBase64Url(text: string): Uint8Array | null {
  if (text === "" || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** SHA-256 of the compressed payload bytes, base64url. */
export async function digestPayload(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return base64UrlFromBytes(new Uint8Array(hash));
}

/**
 * The exact bytes that get signed. Domain-separated by the share version, so a
 * signature minted for today's format cannot be replayed under a future one, and
 * pipe-delimited over two fields that cannot themselves contain a pipe
 * (base64url alphabet; decimal integer) — so the encoding is unambiguous.
 */
export function signingMessage(digest: string, expiresAt: number): Uint8Array {
  return new TextEncoder().encode(`archlab-share-v1|${digest}|${expiresAt}`);
}

/** True when the deployment can verify signatures at all. */
export function canVerifyExpiry(): boolean {
  return PUBLIC_KEY_JWK.trim() !== "";
}

let cachedPublicKey: Promise<CryptoKey> | null = null;

function publicKey(): Promise<CryptoKey> {
  cachedPublicKey ??= crypto.subtle.importKey(
    "jwk",
    JSON.parse(PUBLIC_KEY_JWK) as JsonWebKey,
    ALGORITHM,
    false,
    ["verify"],
  );
  return cachedPublicKey;
}

/**
 * Verifies `signature` over `(digest, expiresAt)`. Returns false — never throws
 * — for a malformed signature, an unparseable key, or a genuine mismatch: a
 * caller only ever needs to know "trust this or not".
 */
export async function verifyExpirySignature(
  digest: string,
  expiresAt: number,
  signature: string,
): Promise<boolean> {
  if (!canVerifyExpiry()) return false;
  const raw = bytesFromBase64Url(signature);
  if (raw === null) return false;
  try {
    return await crypto.subtle.verify(
      SIGN_PARAMS,
      await publicKey(),
      raw as unknown as ArrayBuffer,
      signingMessage(digest, expiresAt) as unknown as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

/** Whole seconds since the epoch, the unit `exp` is expressed in. */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
