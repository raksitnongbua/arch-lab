import { describe, expect, it } from "vitest";

import {
  immersiveFromParam,
  immersiveFromSearch,
  immersiveQuery,
  SHARE_PARAM_IMMERSIVE,
} from "./immersive-param";

describe("immersiveQuery", () => {
  it("mints the one spelling both share kinds use", () => {
    // The minted form is asserted literally, not built from the constant: what
    // this proves is that links already in circulation keep opening, and a
    // derived expectation would follow a rename instead of catching it.
    expect(immersiveQuery(true)).toBe("?i=1");
  });

  it("adds nothing when immersive was not asked for", () => {
    // An empty string, never `?i=0`: the default is not a state worth five
    // characters of a URL that competes with the payload ceiling.
    expect(immersiveQuery(false)).toBe("");
  });

  it("round-trips through the reader", () => {
    expect(immersiveFromSearch(immersiveQuery(true))).toBe(true);
    expect(immersiveFromSearch(immersiveQuery(false))).toBe(false);
  });
});

describe("immersiveFromParam", () => {
  it("accepts the minted spelling and the typed one", () => {
    expect(immersiveFromParam("1")).toBe(true);
    expect(immersiveFromParam("true")).toBe(true);
  });

  it("is off when absent", () => {
    expect(immersiveFromParam(undefined)).toBe(false);
  });

  it("is off for anything else, rather than an error", () => {
    // The param names how a diagram opens, not a route: a mangled value must
    // still show the diagram. `0` and `false` matter most — a reader who
    // switches the option off by hand must not switch it on.
    for (const value of ["", "0", "false", "yes", "on", "TRUE"]) {
      expect(immersiveFromParam(value)).toBe(false);
    }
  });

  it("reads the first of a repeated param", () => {
    // Next hands a repeated query key over as an array. Taking `[0]` matches
    // `URLSearchParams.get`, so the two readers below cannot disagree about
    // the same URL.
    expect(immersiveFromParam(["1", "0"])).toBe(true);
    expect(immersiveFromParam(["0", "1"])).toBe(false);
    expect(immersiveFromParam([])).toBe(false);
  });
});

describe("immersiveFromSearch", () => {
  it("reads the param out of a full query string", () => {
    expect(immersiveFromSearch(`?${SHARE_PARAM_IMMERSIVE}=1`)).toBe(true);
    expect(immersiveFromSearch("?e=shopflow&i=1&d=seq")).toBe(true);
    expect(immersiveFromSearch("?e=shopflow&d=seq")).toBe(false);
  });

  it("is off for an empty or absent query", () => {
    expect(immersiveFromSearch("")).toBe(false);
    expect(immersiveFromSearch("?")).toBe(false);
  });

  it("does not mistake another param that merely contains the name", () => {
    // `?id=…` and `?index=…` both start with `i`. A substring match would
    // read either as an immersive request.
    expect(immersiveFromSearch("?id=1")).toBe(false);
    expect(immersiveFromSearch("?index=1")).toBe(false);
  });

  it("reads the first value of a repeated param, like the record reader", () => {
    expect(immersiveFromSearch("?i=1&i=0")).toBe(true);
    expect(immersiveFromSearch("?i=0&i=1")).toBe(false);
  });
});
