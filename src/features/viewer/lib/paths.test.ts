/**
 * The ugly edges of chain resolution, pinned before any pixel depends on them:
 * a pair joined by two relationships, a hop told against its arrow, an anchor
 * that narrows a hop to one edge, and a model with an id the diagram lost.
 *
 * The parser refuses most of these on the way in, which is exactly why they
 * are worth asserting here: this module is what the viewer runs, and the
 * viewer also renders models that never went through the parser.
 */

import { describe, expect, it } from "vitest";

import type { C4Diagram, C4Node } from "@/types";

import { beatBounds, findPath, pathsOf, resolvePath } from "./paths";

function node(id: string, x: number, y: number): C4Node {
  return {
    id,
    type: "softwareSystem",
    name: id.toUpperCase(),
    position: { x, y },
    size: { width: 100, height: 50 },
  };
}

/** `a` and `b` are joined TWICE, in opposite directions. `b`–`c` once. */
const DIAGRAM: C4Diagram = {
  id: "d",
  level: "context",
  title: "D",
  ownerNodeId: null,
  parentDiagramId: null,
  nodes: [node("a", 0, 0), node("b", 200, 0), node("c", 400, 0)],
  edges: [
    { id: "e-ab", source: "a", target: "b", direction: "forward" },
    { id: "e-ba", source: "b", target: "a", direction: "forward" },
    { id: "e-bc", source: "b", target: "c", direction: "forward" },
  ],
  paths: [
    {
      id: "send",
      title: "Send",
      beats: [
        { caption: "one", chains: [{ nodes: ["a", "b"] }] },
        { caption: "two", chains: [{ nodes: ["c", "b"] }] },
      ],
    },
  ],
};

function resolve(chains: { nodes: string[]; edgeId?: string }[]) {
  return resolvePath(DIAGRAM, {
    id: "p",
    title: "P",
    beats: [{ caption: "x", chains }],
  }).beats[0];
}

describe("resolvePath", () => {
  it("lights every relationship joining a hop's pair", () => {
    expect([...resolve([{ nodes: ["a", "b"] }]).edgeIds].sort()).toEqual([
      "e-ab",
      "e-ba",
    ]);
  });

  /* The arrow orders the telling. `c -> b` is a legal way to say the thing
     the model spells `b -> c`. */
  it("matches a hop against its relationship in either orientation", () => {
    expect([...resolve([{ nodes: ["c", "b"] }]).edgeIds]).toEqual(["e-bc"]);
  });

  it("narrows a hop to one relationship when anchored", () => {
    expect([...resolve([{ nodes: ["a", "b"], edgeId: "e-ba" }]).edgeIds]).toEqual(
      ["e-ba"],
    );
  });

  /* A model the parser never saw can carry an anchor the hop does not have.
     Lighting the hop whole is what an unanchored hop does, so the overlay is
     merely less precise — never empty, never thrown. */
  it("falls back to the whole hop when the anchor is not on it", () => {
    expect([...resolve([{ nodes: ["a", "b"], edgeId: "e-bc" }]).edgeIds].sort()).toEqual(
      ["e-ab", "e-ba"],
    );
  });

  it("walks every hop of a chain longer than two", () => {
    const beat = resolve([{ nodes: ["a", "b", "c"] }]);
    expect([...beat.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...beat.edgeIds].sort()).toEqual(["e-ab", "e-ba", "e-bc"]);
  });

  it("unions several chain lines into one beat", () => {
    const beat = resolve([{ nodes: ["a", "b"] }, { nodes: ["b", "c"] }]);
    expect([...beat.nodeIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("drops an id the diagram does not have instead of throwing", () => {
    const beat = resolve([{ nodes: ["a", "ghost"] }, { nodes: ["b", "c"] }]);
    expect([...beat.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...beat.edgeIds]).toEqual(["e-bc"]);
  });

  it("unions the beats into the path's own sets — the middle tier", () => {
    const resolved = resolvePath(DIAGRAM, DIAGRAM.paths![0]);
    expect([...resolved.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...resolved.edgeIds].sort()).toEqual(["e-ab", "e-ba", "e-bc"]);
    expect(resolved.beats.map((b) => b.caption)).toEqual(["one", "two"]);
  });
});

describe("beatBounds", () => {
  it("frames only the beat's own elements", () => {
    const beat = resolve([{ nodes: ["a", "b"] }]);
    expect(beatBounds(DIAGRAM, beat)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 50,
    });
  });

  it("falls back to the whole diagram rather than the origin", () => {
    const beat = resolve([{ nodes: ["ghost", "phantom"] }]);
    expect(beatBounds(DIAGRAM, beat).width).toBe(500);
  });
});

describe("pathsOf", () => {
  it("answers none for a diagram that has none", () => {
    expect(pathsOf({ ...DIAGRAM, paths: undefined })).toEqual([]);
  });

  it("finds a path by id, and answers null for one that is gone", () => {
    expect(findPath(DIAGRAM, "send")?.title).toBe("Send");
    expect(findPath(DIAGRAM, "nope")).toBeNull();
  });
});
