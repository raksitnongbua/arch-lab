/**
 * The share-link codec: an arch-lab model encoded INTO a URL fragment, so a
 * link can carry a whole diagram with no account, no upload and no server —
 * the browser never sends the `#…` fragment anywhere.
 *
 * Payload shape (the part after `#`), URLSearchParams-style:
 *
 *   m=AF1.<base64url(deflate-raw(utf8(.alab text)))>   — the model
 *   d=<diagram id>                                    — optional: the diagram
 *                                                       the sharer was viewing
 *
 * Design decisions, and why:
 *   - The model is carried as its `.alab` TEXT form, not JSON — the archtext
 *     serializer is deterministic and lossless (proven round trip) and the
 *     text is materially smaller than the JSON, which matters when the whole
 *     model must fit in a URL.
 *   - Compression is the platform's `CompressionStream("deflate-raw")` — no
 *     dependency. Both directions are feature-detected (`canEncodeShare` /
 *     the decode path's own check) and degrade with an honest message.
 *   - base64url (RFC 4648 §5, unpadded) keeps the payload URL-safe without
 *     percent-encoding blow-up.
 *   - The `AF1.` version prefix lets a future format change be DETECTED
 *     instead of mis-parsed; unknown prefixes produce a clear error.
 *
 * Decoding never throws: every failure mode (unknown version, bad base64,
 * truncated deflate stream, invalid UTF-8) comes back as a typed error with
 * a human sentence, so a corrupt link is a message — never a crash.
 */

import {
  canVerifyExpiry,
  digestPayload,
  nowInSeconds,
  SHARE_PARAM_EXPIRES,
  SHARE_PARAM_SIGNATURE,
  verifyExpirySignature,
} from "./signature";

/** Version prefix on the `m` payload — bump on any format change. */
export const SHARE_VERSION_PREFIX = "AF1.";

/** Fragment parameter carrying the compressed model. */
export const SHARE_PARAM_MODEL = "m";

/** Fragment parameter carrying the diagram the sharer was viewing. */
export const SHARE_PARAM_DIAGRAM = "d";

/**
 * The longest share URL we are willing to hand out. Deliberately
 * conservative: plenty of tools (older proxies, some chat apps, email
 * clients, spreadsheet cells) truncate or refuse URLs beyond ~2000
 * characters, and a truncated link fails for the RECIPIENT — silently
 * producing one would make the feature untrustworthy. Past this, the UI
 * offers the `.alab` file download instead.
 */
export const MAX_SHARE_URL_LENGTH = 2000;

/* -------------------------------------------------------------------------- */
/* Feature detection                                                           */
/* -------------------------------------------------------------------------- */

/** Can this browser BUILD a share link? (CompressionStream, Baseline 2023.) */
export function canEncodeShare(): boolean {
  return typeof CompressionStream === "function";
}

/** Can this browser OPEN a share link? */
export function canDecodeShare(): boolean {
  return typeof DecompressionStream === "function";
}

/* -------------------------------------------------------------------------- */
/* Bytes ⇄ base64url                                                           */
/* -------------------------------------------------------------------------- */

function toBase64Url(bytes: Uint8Array): string {
  // btoa wants a binary string; build it in chunks to dodge the spread /
  // apply argument-count ceiling on large models.
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

/** Strict base64url → bytes; `null` on any malformed input (never throws). */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
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

/* -------------------------------------------------------------------------- */
/* deflate-raw via the platform streams                                        */
/* -------------------------------------------------------------------------- */

async function compress(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* -------------------------------------------------------------------------- */
/* Encode                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Builds the fragment body (`m=AF1.…[&d=…]`) for a model's canonical `.alab`
 * text. The caller prepends `#` and the page URL. Requires `canEncodeShare()`.
 */
export async function encodeShareFragment(
  aftText: string,
  diagramId: string | null,
  expiry?: ShareExpiry,
): Promise<string> {
  const compressed = await compress(new TextEncoder().encode(aftText));
  let fragment = `${SHARE_PARAM_MODEL}=${SHARE_VERSION_PREFIX}${toBase64Url(compressed)}`;
  if (diagramId !== null) {
    fragment += `&${SHARE_PARAM_DIAGRAM}=${encodeURIComponent(diagramId)}`;
  }
  if (expiry !== undefined) {
    // Both or neither: an `exp` with no `sig` is refused on decode, so emitting
    // a half-pair would mint a link that cannot be opened.
    fragment +=
      `&${SHARE_PARAM_EXPIRES}=${expiry.expiresAt}` +
      `&${SHARE_PARAM_SIGNATURE}=${expiry.signature}`;
  }
  return fragment;
}

/**
 * The digest a signature must cover: SHA-256 of the exact compressed bytes the
 * link will carry. Callers hand this to the signing endpoint, then pass the
 * result back as `expiry`.
 *
 * Separate from `encodeShareFragment` because signing is a network round trip
 * and the codec stays synchronous-in-spirit and dependency-free; the caller
 * owns the ordering (compress → digest → sign → encode).
 */
export async function shareDigestFor(aftText: string): Promise<string> {
  return digestPayload(await compress(new TextEncoder().encode(aftText)));
}

export interface ShareExpiry {
  /** Whole seconds since the epoch. */
  expiresAt: number;
  /** base64url ECDSA P-256 signature over `(digest, expiresAt)`. */
  signature: string;
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                      */
/* -------------------------------------------------------------------------- */

export type DecodedShare =
  /** A model payload was present and decoded; `.alab` parsing is the caller's. */
  | { status: "ok"; aftText: string; diagramId: string | null }
  /** No model payload in this fragment — not a shared-model link. */
  | { status: "none" }
  /**
   * The link carried a valid expiry that has passed. Distinct from `error`
   * because it is not a fault: the link worked, and its author meant it to
   * stop. The UI can say so plainly instead of implying damage.
   */
  | { status: "expired"; expiresAt: number }
  /** A payload was present but could not be decoded; `message` says why. */
  | { status: "error"; message: string };

/**
 * Enforces `exp`/`sig` when present. Returns `null` to mean "carry on" — either
 * there is no expiry (the normal case; expiry is opt-in) or there is a valid one
 * that has not passed yet.
 *
 * Every refusal below exists because the alternative silently weakens the
 * feature:
 *   - `exp` without `sig` — an unsigned expiry is a number anyone can retype, so
 *     honouring it would teach users to trust something meaningless. Refuse
 *     rather than ignore, because ignoring it shows a model the author expected
 *     to be gone.
 *   - `sig` without `exp` — nothing to verify against; the pair is incomplete.
 *   - no public key configured — we cannot tell a real signature from a forged
 *     one, so we cannot honour either answer.
 *   - bad signature — the link was altered.
 */
async function checkExpiry(
  params: URLSearchParams,
  compressed: Uint8Array<ArrayBuffer>,
): Promise<DecodedShare | null> {
  const rawExpires = params.get(SHARE_PARAM_EXPIRES);
  const signature = params.get(SHARE_PARAM_SIGNATURE);
  if (rawExpires === null && signature === null) return null;

  if (rawExpires === null || signature === null) {
    return {
      status: "error",
      message:
        "it carries half of an expiry (one of `exp`/`sig` is missing) — the link was probably truncated by the app that carried it",
    };
  }
  const expiresAt = Number(rawExpires);
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    return {
      status: "error",
      message: "its expiry is not a valid timestamp — the link was altered",
    };
  }
  if (!canVerifyExpiry()) {
    return {
      status: "error",
      message:
        "it carries an expiry, but this deployment has no share public key configured, so the expiry cannot be verified",
    };
  }

  const digest = await digestPayload(compressed);
  if (!(await verifyExpirySignature(digest, expiresAt, signature))) {
    return {
      status: "error",
      message:
        "its expiry signature does not match — the link's expiry or its model was changed after it was created",
    };
  }
  if (expiresAt <= nowInSeconds()) {
    return { status: "expired", expiresAt };
  }
  return null;
}

/**
 * Decodes a location hash (with or without the leading `#`). Never throws;
 * corrupt or truncated payloads come back as `{ status: "error" }` with a
 * plain-language reason.
 */
export async function decodeShareFragment(hash: string): Promise<DecodedShare> {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body === "") return { status: "none" };

  const params = new URLSearchParams(body);
  const payload = params.get(SHARE_PARAM_MODEL);
  if (payload === null) return { status: "none" };

  if (!payload.startsWith(SHARE_VERSION_PREFIX)) {
    return {
      status: "error",
      message:
        "its payload does not start with the expected version marker — the link may come from a newer arch-lab, or it was damaged in transit",
    };
  }
  if (!canDecodeShare()) {
    return {
      status: "error",
      message:
        "this browser cannot decompress share links (it lacks DecompressionStream)",
    };
  }

  const compressed = fromBase64Url(payload.slice(SHARE_VERSION_PREFIX.length));
  if (compressed === null) {
    return {
      status: "error",
      message:
        "its payload is not valid base64url — the link was probably truncated or altered by the app that carried it",
    };
  }

  // Expiry is checked BEFORE decompressing: an expired link should not spend
  // work rebuilding a model it will refuse to show.
  const expiryCheck = await checkExpiry(params, compressed);
  if (expiryCheck !== null) return expiryCheck;

  try {
    const bytes = await decompress(compressed);
    const aftText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const rawDiagram = params.get(SHARE_PARAM_DIAGRAM);
    return {
      status: "ok",
      aftText,
      diagramId: rawDiagram === null || rawDiagram === "" ? null : rawDiagram,
    };
  } catch {
    return {
      status: "error",
      message:
        "its compressed payload would not decompress — the link was probably truncated or altered by the app that carried it",
    };
  }
}

/**
 * Just the `d=` diagram id from a hash — used by bundled-model links, whose
 * fragments carry no payload. `null` when absent or empty.
 */
export function diagramIdFromHash(hash: string): string | null {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (body === "") return null;
  const raw = new URLSearchParams(body).get(SHARE_PARAM_DIAGRAM);
  return raw === null || raw === "" ? null : raw;
}
