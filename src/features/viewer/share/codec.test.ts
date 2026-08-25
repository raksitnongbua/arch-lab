/**
 * The share codec is the one module where a regression is UNRECOVERABLE: a link
 * already pasted into a chat has to keep opening, and nobody can re-mint it.
 * `check:share-capacity` proves the routes still exist; these prove the bytes
 * still survive the trip.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_SAFE_LENGTH,
  SHARE_VERSION_PREFIX,
  canDecodeShare,
  canEncodeShare,
  decodeShareFragment,
  diagramIdFromHash,
  encodeShareFragment,
  normalizeShareFragment,
} from "./codec";

const MODEL = `archlab 1\nmodel "Payments"\n\ncontext "System"\n  person alice "Alice"\n  system api "API"\n  alice -> api "uses"\n`;

describe("the platform supports the codec", () => {
  it("has both compression streams under test", () => {
    expect(canEncodeShare()).toBe(true);
    expect(canDecodeShare()).toBe(true);
  });
});

describe("encode → decode roundtrip", () => {
  it("returns the exact text that went in", async () => {
    const fragment = await encodeShareFragment(MODEL, null);
    const decoded = await decodeShareFragment(`#${fragment}`);
    expect(decoded).toEqual({
      status: "ok",
      aftText: MODEL,
      diagramId: null,
    });
  });

  it("stamps the version marker the decoder looks for", async () => {
    const fragment = await encodeShareFragment(MODEL, null);
    expect(fragment.startsWith(`m=${SHARE_VERSION_PREFIX}`)).toBe(true);
  });

  it("carries a diagram id across when one is given", async () => {
    const fragment = await encodeShareFragment(MODEL, "context");
    const decoded = await decodeShareFragment(fragment);
    expect(decoded).toMatchObject({ status: "ok", diagramId: "context" });
  });

  it("survives text the URL grammar would otherwise mangle", async () => {
    const awkward = 'a "quote" & a #hash & a %25 & 日本語 & an emoji 🚀\n';
    const decoded = await decodeShareFragment(
      await encodeShareFragment(awkward, null),
    );
    expect(decoded).toMatchObject({ status: "ok", aftText: awkward });
  });

  it("decodes with or without the leading hash", async () => {
    const fragment = await encodeShareFragment(MODEL, null);
    const withHash = await decodeShareFragment(`#${fragment}`);
    const without = await decodeShareFragment(fragment);
    expect(withHash).toEqual(without);
  });

  it("compresses repetitive text well below the safe URL length", async () => {
    const fragment = await encodeShareFragment(MODEL.repeat(20), null);
    expect(fragment.length).toBeLessThan(SHARE_URL_SAFE_LENGTH);
  });
});

describe("a fragment that is not a shared model", () => {
  it("reports none for an empty fragment", async () => {
    await expect(decodeShareFragment("")).resolves.toEqual({ status: "none" });
    await expect(decodeShareFragment("#")).resolves.toEqual({ status: "none" });
  });

  it("reports none when there is no model param", async () => {
    await expect(decodeShareFragment("#d=context")).resolves.toEqual({
      status: "none",
    });
  });
});

describe("a damaged payload never throws", () => {
  it("names a wrong version marker", async () => {
    const decoded = await decodeShareFragment("#m=ZZ9.abc");
    expect(decoded.status).toBe("error");
  });

  it("names a payload that is not base64url", async () => {
    const decoded = await decodeShareFragment(`#m=${SHARE_VERSION_PREFIX}!!!`);
    expect(decoded).toMatchObject({ status: "error" });
  });

  it("names a payload that will not decompress", async () => {
    // Valid base64url, but not a deflate-raw stream.
    const decoded = await decodeShareFragment(`#m=${SHARE_VERSION_PREFIX}QUJD`);
    expect(decoded).toMatchObject({ status: "error" });
  });

  it("refuses an expiry with no signature rather than ignoring it", async () => {
    const fragment = await encodeShareFragment(MODEL, null);
    const decoded = await decodeShareFragment(`#${fragment}&exp=99999999999`);
    expect(decoded.status).toBe("error");
  });
});

describe("normalizeShareFragment", () => {
  it("drops the leading hash", () => {
    expect(normalizeShareFragment("#m=AF1.abc")).toBe("m=AF1.abc");
    expect(normalizeShareFragment("m=AF1.abc")).toBe("m=AF1.abc");
  });

  /* A forward that appended the fragment twice produces `#a#a`; keeping only
     the first copy is what lets such a link still open. */
  it("keeps only the first fragment when one was appended twice", () => {
    expect(normalizeShareFragment("#m=AF1.abc#m=AF1.abc")).toBe("m=AF1.abc");
  });
});

describe("diagramIdFromHash", () => {
  it("reads the diagram id from a payload-free fragment", () => {
    expect(diagramIdFromHash("#d=context")).toBe("context");
  });

  it("returns null when absent or empty", () => {
    expect(diagramIdFromHash("")).toBeNull();
    expect(diagramIdFromHash("#d=")).toBeNull();
  });
});

describe("the documented length ceilings", () => {
  it("keeps the safe length below the hard maximum", () => {
    expect(SHARE_URL_SAFE_LENGTH).toBeLessThan(MAX_SHARE_URL_LENGTH);
  });
});
