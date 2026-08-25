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
