import { describe, expect, it } from "vitest";

import { orAbsent } from "./absent";

describe("orAbsent", () => {
  it("keeps a value that has content", () => {
    expect(orAbsent("Payments API")).toBe("Payments API");
  });

  /* The whole point: a cleared field must REMOVE the value, not store
     emptiness, because the serializer omits an absent field and would
     otherwise write `desc ""` into the document. */
  it("treats an empty string as absent", () => {
    expect(orAbsent("")).toBeUndefined();
  });

  it("treats whitespace-only as absent", () => {
    expect(orAbsent("   ")).toBeUndefined();
    expect(orAbsent("\n\t ")).toBeUndefined();
  });

  /* Trims for the DECISION, not for the value — a field the author padded
     deliberately keeps its spacing, so this never silently edits their text. */
  it("returns the untrimmed original when it keeps the value", () => {
    expect(orAbsent("  Order Service  ")).toBe("  Order Service  ");
  });
});
