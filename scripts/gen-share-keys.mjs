/**
 * Generates the ECDSA P-256 keypair that signs share-link expiries.
 *
 *   node scripts/gen-share-keys.mjs
 *
 * Prints two env lines. The private key stays server-side; the public key is
 * `NEXT_PUBLIC_` because the BROWSER is what verifies — the fragment never
 * reaches a server, so verification cannot happen anywhere else.
 *
 * Rotating the keypair invalidates every outstanding expiring link (their
 * signatures no longer verify) but leaves links WITHOUT an expiry untouched,
 * since those carry no signature to check.
 */

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const [pub, priv] = await Promise.all([
  crypto.subtle.exportKey("jwk", publicKey),
  crypto.subtle.exportKey("jwk", privateKey),
]);

// `key_ops`/`ext` are noise for our importKey calls, which state usages
// explicitly; dropping them keeps the env values short.
const strip = ({ key_ops, ext, ...rest }) => rest;

process.stdout.write(
  [
    "# Share-link expiry signing keys (ECDSA P-256).",
    "# Private: server only. Public: shipped to the browser, which verifies.",
    `ARCHLAB_SHARE_PRIVATE_KEY='${JSON.stringify(strip(priv))}'`,
    `NEXT_PUBLIC_ARCHLAB_SHARE_PUBLIC_KEY='${JSON.stringify(strip(pub))}'`,
    "",
  ].join("\n"),
);
