import { describe, expect, it } from "vitest";

import { isNormalizedTint, normalizeTint } from "./tint";

describe("normalizeTint", () => {
  it("expands three-digit hex to six", () => {
    expect(normalizeTint("#abc")).toBe("#aabbcc");
  });

  it("accepts six-digit hex and lowercases it", () => {
    expect(normalizeTint("#AABBCC")).toBe("#aabbcc");
  });

  it("resolves a named colour", () => {
    expect(normalizeTint("blue")).toBe("#0000ff");
  });

  it("ignores surrounding whitespace and case", () => {
    expect(normalizeTint("  BLUE  ")).toBe("#0000ff");
  });

  it("converts rgb() and rgba(), dropping any alpha", () => {
    expect(normalizeTint("rgb(255, 0, 128)")).toBe("#ff0080");
    expect(normalizeTint("rgba(255, 0, 128, 0.5)")).toBe("#ff0080");
  });

  /* `channel` clamps rather than rejecting, so an out-of-range component
     still yields a colour instead of dropping the author's intent entirely. */
  it("clamps out-of-range rgb components", () => {
    expect(normalizeTint("rgb(300, 0, 0)")).toBe("#ff0000");
  });

  it("returns null for an explicit no-tint", () => {
    expect(normalizeTint("transparent")).toBeNull();
    expect(normalizeTint("none")).toBeNull();
    expect(normalizeTint("")).toBeNull();
  });

  it("returns null for anything it cannot store", () => {
    expect(normalizeTint("chartreuse-ish")).toBeNull();
    expect(normalizeTint("#ab")).toBeNull();
    expect(normalizeTint("hsl(200 50% 50%)")).toBeNull();
  });
});

describe("isNormalizedTint", () => {
  it("accepts only the canonical six-digit lowercase spelling", () => {
    expect(isNormalizedTint("#aabbcc")).toBe(true);
    expect(isNormalizedTint("#AABBCC")).toBe(false);
    expect(isNormalizedTint("#abc")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isNormalizedTint(null)).toBe(false);
    expect(isNormalizedTint(0x00ff00)).toBe(false);
  });
});
