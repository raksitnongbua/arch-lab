/**
 * The `.alab` grammar, which `.claude/rules/changelog.md` treats as a BREAKING
 * surface: a document that used to parse must keep parsing, because people have
 * these on disk. `check:archtext` and `check:roundtrip` exercise the bundled
 * examples end to end; this file pins the properties those checks rely on, so a
 * grammar regression names the function that broke rather than the fixture that
 * stopped matching.
 *
 * The fixture below was confirmed valid by the shipped parser via the MCP
 * `validate_model` tool before being written down — it is not invented syntax.
 */

import { describe, expect, it } from "vitest";

import { ArchTextParseError } from "./errors";
import { parseArchText, parseArchTextWithSpans } from "./parse";
import { serializeArchText } from "./serialize";

const MODEL = `archlab 1.0
title "Payments"

@context d-ctx-root "System Context"
  desc "Who pays whom."
  view 1 0 0
  customer:person "Customer" (480,80 160x96)
    desc "Shopper placing an order."
  api:system "Payments API" [Go 1.22] (400,320 320x120)
    desc "Takes card payments."

  customer -> api : "Pays for an order" [HTTPS] id=e-customer-api
`;

describe("parseArchText", () => {
  it("reads the header into the model", () => {
    const file = parseArchText(MODEL);
    expect(file.version).toBe("1.0");
    expect(file.metadata.title).toBe("Payments");
    expect(file.rootDiagramId).toBe("d-ctx-root");
  });

  it("reads one diagram with its nodes and edges", () => {
    const file = parseArchText(MODEL);
    expect(file.diagrams).toHaveLength(1);
    const [diagram] = file.diagrams;
    expect(diagram.id).toBe("d-ctx-root");
    expect(diagram.level).toBe("context");
    expect(diagram.nodes).toHaveLength(2);
    expect(diagram.edges).toHaveLength(1);
  });

  /* The `system` KEYWORD becomes the `softwareSystem` TYPE — the grammar's
     spelling and the model's spelling are deliberately not the same, and a
     serializer that forgets the mapping writes a document it cannot re-read. */
  it("maps the system keyword to the softwareSystem type", () => {
    const [diagram] = parseArchText(MODEL).diagrams;
    const api = diagram.nodes.find((node) => node.id === "api");
    expect(api).toMatchObject({
      type: "softwareSystem",
      name: "Payments API",
      technology: "Go 1.22",
      description: "Takes card payments.",
    });
  });

  it("reads the trailing geometry into position and size", () => {
    const [diagram] = parseArchText(MODEL).diagrams;
    const api = diagram.nodes.find((node) => node.id === "api");
    expect(api?.position).toEqual({ x: 400, y: 320 });
    expect(api?.size).toEqual({ width: 320, height: 120 });
  });

  it("keeps an edge's ends, label and explicit id", () => {
    const [diagram] = parseArchText(MODEL).diagrams;
    expect(diagram.edges[0]).toMatchObject({
      id: "e-customer-api",
      source: "customer",
      target: "api",
      label: "Pays for an order",
      technology: "HTTPS",
    });
  });
});

describe("parse → serialize → parse", () => {
  /* The property `check:roundtrip` depends on: serialising a parsed model and
     re-parsing it must land on the same model. If this breaks, every saved
     document is at risk of drifting each time it is opened and written. */
  it("is stable across a full round trip", () => {
    const once = parseArchText(MODEL);
    const twice = parseArchText(serializeArchText(once));
    expect(twice).toEqual(once);
  });

  it("re-serialises to identical text the second time", () => {
    const first = serializeArchText(parseArchText(MODEL));
    const second = serializeArchText(parseArchText(first));
    expect(second).toBe(first);
  });
});

describe("parseArchTextWithSpans", () => {
  it("describes the same model as the plain parse", () => {
    const { file } = parseArchTextWithSpans(MODEL);
    expect(file).toEqual(parseArchText(MODEL));
  });

  it("reports spans so the editor gutter can point at a line", () => {
    const { spans } = parseArchTextWithSpans(MODEL);
    expect(spans).toBeDefined();
  });
});

describe("a document that does not parse", () => {
  it("throws ArchTextParseError carrying the first position", () => {
    let caught: unknown;
    try {
      parseArchText('archlab 1.0\nnonsense "x"\n');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ArchTextParseError);
    const parseError = caught as ArchTextParseError;
    expect(parseError.line).toBeGreaterThan(0);
    expect(parseError.column).toBeGreaterThan(0);
    expect(parseError.issues.length).toBeGreaterThan(0);
  });

  /* The version marker is the one thing the reader checks before anything
     else — a bare `1` was a real early mistake and must stay a hard error. */
  it("rejects a version that is not MAJOR.MINOR", () => {
    expect(() => parseArchText('archlab 1\ntitle "x"\n')).toThrow(
      ArchTextParseError,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A path is authored text, so its failure modes are the grammar's problem, not
 * the viewer's: a beat that names something absent would light the wrong thing
 * in silence, and a diagram that lights the wrong thing is a presentation bug.
 * Every refusal below is asserted by the id it names, because "it threw" would
 * still pass if the parser threw for the wrong reason.
 */
const PATHS = `archlab 1.0
title "Paths"

@context d-ctx-root "Root"
  a:person "A"
  b:system "B"
  c:external "C"

  a -> b : "asks"
  b -> a : "answers"
  b -> c : "calls" id=e-bc

  path send "The send path"
    beat "A asks B, and B answers"
      a -> b
    beat "B calls C, and A is still in the picture"
      b -> c ~e-bc
      a -> b

  path other "The other path"
    beat "C is reached from B"
      c -> b
`;

function refusal(text: string): string {
  try {
    parseArchText(text);
  } catch (error) {
    return (error as ArchTextParseError).message;
  }
  throw new Error("expected the parse to be refused, but it succeeded");
}

/** `PATHS` with its two path blocks replaced by `body`. */
function withPaths(body: string): string {
  return PATHS.slice(0, PATHS.indexOf("  path send")) + body;
}

describe("paths", () => {
  it("reads a path into the model in author order", () => {
    const diagram = parseArchText(PATHS).diagrams[0];
    expect(diagram.paths?.map((p) => p.id)).toEqual(["send", "other"]);
    expect(diagram.paths?.[0].title).toBe("The send path");
    expect(diagram.paths?.[0].beats).toHaveLength(2);
    expect(diagram.paths?.[0].beats[0].caption).toBe(
      "A asks B, and B answers",
    );
  });

  it("keeps several chain lines in one beat", () => {
    const beat = parseArchText(PATHS).diagrams[0].paths?.[0].beats[1];
    expect(beat?.chains).toHaveLength(2);
    expect(beat?.chains[0].nodes).toEqual(["b", "c"]);
    expect(beat?.chains[0].edgeId).toBe("e-bc");
    expect(beat?.chains[1].edgeId).toBeUndefined();
  });

  /* The arrow orders the TELLING. A request and its response point opposite
     ways, and a walk that could not go against an arrow is one authors fight. */
  it("matches a hop against a relationship in either orientation", () => {
    const other = parseArchText(PATHS).diagrams[0].paths?.[1];
    expect(other?.beats[0].chains[0].nodes).toEqual(["c", "b"]);
  });

  it("round-trips byte-identically", () => {
    expect(serializeArchText(parseArchText(PATHS))).toBe(PATHS);
  });

  /* Comments are dropped by this parser everywhere, paths included — they
     survive only the line-patch route. What matters here is that one between
     two paths does not end the first path or swallow the second. */
  it("is not derailed by a comment between two paths", () => {
    const commented = PATHS.replace(
      "  path other",
      "  // the webhook story\n  path other",
    );
    const diagram = parseArchText(commented).diagrams[0];
    expect(diagram.paths?.map((p) => p.id)).toEqual(["send", "other"]);
  });

  it("leaves a document without paths untouched", () => {
    const pathless = PATHS.slice(0, PATHS.indexOf("\n  path send"));
    expect(serializeArchText(parseArchText(pathless))).toBe(pathless);
    expect(parseArchText(pathless).diagrams[0].paths).toBeUndefined();
  });

  it("refuses a beat naming an element that is not on this canvas", () => {
    expect(
      refusal(withPaths('  path p "P"\n    beat "x"\n      a -> ghost\n')),
    ).toContain("beat names 'ghost'");
  });

  it("refuses a hop no relationship joins", () => {
    expect(
      refusal(withPaths('  path p "P"\n    beat "x"\n      a -> c\n')),
    ).toContain("no relationship joins 'a' and 'c'");
  });

  it("refuses an edge anchor that does not join its own hop", () => {
    expect(
      refusal(withPaths('  path p "P"\n    beat "x"\n      a -> b ~e-bc\n')),
    ).toContain("~e-bc does not join 'a' and 'b'");
  });

  it("refuses a duplicate path id, naming the line the first one is on", () => {
    const message = refusal(
      withPaths(
        '  path p "P"\n    beat "x"\n      a -> b\n' +
          '  path p "Q"\n    beat "y"\n      a -> b\n',
      ),
    );
    expect(message).toContain('duplicate path id "p"');
    expect(message).toContain("already declared on line");
  });

  it("refuses a path with no beats", () => {
    expect(refusal(withPaths('  path p "P"\n'))).toContain(
      "a path needs at least one beat",
    );
  });

  /* A beat with prose and no elements is a caption card, which is the thing
     the design cuts — so the grammar does not let one be written. */
  it("refuses a beat that names no relationship", () => {
    expect(refusal(withPaths('  path p "P"\n    beat "x"\n'))).toContain(
      "a beat must name at least one relationship",
    );
  });

  it("refuses a chain of one element", () => {
    expect(
      refusal(withPaths('  path p "P"\n    beat "x"\n      a\n')),
    ).toContain("a chain of one element names no relationship");
  });

  /* This is also what catches an edge line mis-indented into a path. */
  it("refuses any arrow but ->, naming the one that was written", () => {
    expect(
      refusal(withPaths('  path p "P"\n    beat "x"\n      a <-> b\n')),
    ).toContain('"<->" is not allowed in a beat');
  });

  it("refuses a chain line with no beat open above it", () => {
    expect(refusal(withPaths('  path p "P"\n      a -> b\n'))).toContain(
      'no "beat" line is open above it',
    );
  });

  it("refuses a node line indented into a path, naming the word written", () => {
    expect(refusal(withPaths('  path p "P"\n    d:person "D"\n'))).toContain(
      "is not allowed inside a path",
    );
  });

  it("still refuses an indent the grammar has no production for", () => {
    expect(refusal(withPaths('  path p "P"\n   beat "x"\n'))).toContain(
      "inconsistent indentation of 3 spaces",
    );
  });
});
