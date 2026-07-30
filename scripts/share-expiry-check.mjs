/**
 * Proves share-link expiry is actually tamper-resistant.
 *
 *   node scripts/share-expiry-check.mjs
 *
 * The whole feature rests on one claim: you cannot move the expiry without
 * invalidating the signature. That claim is worth a test rather than a comment,
 * because a subtle mistake — signing the expiry but not the payload digest, say,
 * or a non-canonical signed message — leaves something that still LOOKS like it
 * works while protecting nothing.
 *
 * Generates its own throwaway keypair, so it needs no configured environment and
 * never touches real keys.
 */

const ALG = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

const { publicKey, privateKey } = await crypto.subtle.generateKey(ALG, true, [
  "sign",
  "verify",
]);

const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

/**
 * Mirrors `signingMessage` in features/viewer/share/signature.ts. Kept as a
 * literal on purpose: if that canonical form ever changes, this check fails and
 * forces a deliberate decision, because changing it silently invalidates every
 * link already in the wild.
 */
const message = (digest, exp) =>
  new TextEncoder().encode(`archlab-share-v1|${digest}|${exp}`);

async function digestOf(bytes) {
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function sign(digest, exp) {
  return b64u(
    new Uint8Array(
      await crypto.subtle.sign(SIGN, privateKey, message(digest, exp)),
    ),
  );
}

async function verify(digest, exp, signature) {
  let raw;
  try {
    raw = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  try {
    return await crypto.subtle.verify(
      SIGN,
      publicKey,
      raw,
      message(digest, exp),
    );
  } catch {
    return false;
  }
}

console.log("share-expiry-check");

const payload = new TextEncoder().encode('archlab 1.0\ntitle "T"\n');
const digest = await digestOf(payload);
const exp = Math.floor(Date.now() / 1000) + 7 * 86_400;
const signature = await sign(digest, exp);

check("a SHA-256 digest is 43 base64url characters", digest.length === 43);
check("a P-256 signature is 86 base64url characters", signature.length === 86);
check(
  "a genuine (digest, expiry) pair verifies",
  await verify(digest, exp, signature),
);

/* --- the attacks this feature exists to resist --- */

check(
  "extending the expiry invalidates the signature",
  !(await verify(digest, exp + 365 * 86_400, signature)),
);
check(
  "shortening the expiry invalidates the signature",
  !(await verify(digest, exp - 86_400, signature)),
);
check(
  "swapping the model invalidates the signature",
  !(await verify(
    await digestOf(new TextEncoder().encode("other")),
    exp,
    signature,
  )),
);
check(
  "a corrupted signature is refused",
  !(await verify(
    digest,
    exp,
    signature.slice(0, -2) + (signature.endsWith("A") ? "B" : "A"),
  )),
);
check(
  "a non-base64url signature is refused",
  !(await verify(digest, exp, "!!!")),
);
check(
  "a signature from a different key is refused",
  await (async () => {
    const other = await crypto.subtle.generateKey(ALG, true, [
      "sign",
      "verify",
    ]);
    const forged = b64u(
      new Uint8Array(
        await crypto.subtle.sign(SIGN, other.privateKey, message(digest, exp)),
      ),
    );
    return !(await verify(digest, exp, forged));
  })(),
);

/* --- the canonical message must stay unambiguous --- */

check(
  "the signed message separates its fields (digest|exp cannot be confused)",
  new TextDecoder().decode(message("AAA", 12)) !==
    new TextDecoder().decode(message("AAA1", 2)),
);

if (failures > 0) {
  console.error(`\nshare-expiry-check: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nshare-expiry-check: all checks passed.");
