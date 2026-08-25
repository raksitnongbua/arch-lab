import { describe, expect, it } from "vitest";

import { describeError } from "./errors";

describe("describeError", () => {
  it("prefers an Error's message", () => {
    expect(describeError(new Error("layout overflowed"))).toBe(
      "layout overflowed",
    );
  });

  /* The subtle case the implementation comment calls out: `String(new
     Error(""))` is `"Error"`, so an empty message must fall through to the
     stringified form rather than returning "". */
  it("treats an empty Error message as no message", () => {
    expect(describeError(new Error(""))).toBe("Error");
  });

  it("stringifies non-Errors rather than throwing", () => {
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(42)).toBe("42");
    expect(describeError(null)).toBe("null");
    expect(describeError(undefined)).toBe("undefined");
  });
});
