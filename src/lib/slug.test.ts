import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugify("Payment Platform", "diagram")).toBe("payment-platform");
  });

  it("collapses runs of punctuation into one hyphen", () => {
    expect(slugify("Order  ->  Ledger!!", "diagram")).toBe("order-ledger");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Context--  ", "diagram")).toBe("context");
  });

  /* The reason NFKD is in the implementation at all: an accented title should
     survive as readable ASCII rather than collapsing to the fallback. */
  it("folds accents to their ASCII base letter", () => {
    expect(slugify("Café München", "diagram")).toBe("cafe-munchen");
  });

  it("falls back when nothing sluggable survives", () => {
    expect(slugify("", "diagram")).toBe("diagram");
    expect(slugify("!!!", "diagram")).toBe("diagram");
  });
});
