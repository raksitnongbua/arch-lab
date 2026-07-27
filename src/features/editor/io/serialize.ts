/**
 * Deterministic serializer for `.archlab.json` (T3-A, AF-E5-S1).
 *
 * Implements the write-time determinism rules of `docs/product/data-model.md`
 * §"Determinism rules" exactly:
 *
 *  1. Object keys in the schema-declared order, never alphabetical/insertion.
 *  2. `diagrams`, `nodes`, `edges` sorted by `id`; `tags` sorted lexically.
 *  3. 2-space indent, LF line endings, single trailing newline.
 *  4. Absent optional fields are OMITTED (in memory an unset optional is a
 *     deleted key, so serialization simply never writes `undefined`).
 *  5. Numbers via `JSON.stringify` — integral numbers print as integers
 *     (`"zoom": 1`, never `1.0`).
 *  6. `metadata.updatedAt` is written as stored; the SAVE FLOW passes
 *     `opts.updatedAt` only when the model actually changed, which is what
 *     keeps a no-op save byte-identical.
 *  7. Unknown fields from a newer minor version are preserved verbatim and in
 *     position: within any object, an unknown key is re-emitted immediately
 *     after the known key it followed in the source (key insertion order
 *     survives `JSON.parse` and `structuredClone`). Top-level unknown fields
 *     are the one exception — `EditorModel` hoists them into `unknownFields`,
 *     so they are re-emitted after `diagrams` (with `$schema`, when present,
 *     always first).
 *
 * Imported by `scripts/roundtrip-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ArchLabMetadata } from "@/types";
import type { EditorModel } from "../state";

/* -------------------------------------------------------------------------- */
/* Schema-declared key order (data-model.md field tables)                     */
/* -------------------------------------------------------------------------- */

type SchemaKind =
  | "file"
  | "metadata"
  | "generator"
  | "tagColors"
  | "customIcons"
  | "customIcon"
  | "diagram"
  | "viewport"
  | "node"
  | "point"
  | "size"
  | "externalRef"
  | "edge"
  | "unknown";

interface KindSpec {
  /** Schema-declared key order. Empty ⇒ record-like, keep insertion order. */
  order: readonly string[];
  /** Kind of the value stored at a key. */
  child?: Readonly<Record<string, SchemaKind>>;
  /** Kind of the ELEMENTS of an array stored at a key. */
  element?: Readonly<Record<string, SchemaKind>>;
  /** Record object whose every value is of this kind (e.g. customIcons). */
  allValues?: SchemaKind;
  /** Keys whose array values are sorted by the elements' `id`. */
  sortById?: readonly string[];
  /** Keys whose string-array values are sorted lexically (tags). */
  sortStrings?: readonly string[];
}

const SPECS: Readonly<Record<Exclude<SchemaKind, "unknown">, KindSpec>> = {
  file: {
    order: ["$schema", "version", "metadata", "rootDiagramId", "diagrams"],
    child: { metadata: "metadata" },
    element: { diagrams: "diagram" },
    sortById: ["diagrams"],
  },
  metadata: {
    order: [
      "title",
      "description",
      "owner",
      "tags",
      "createdAt",
      "updatedAt",
      "lastReviewedAt",
      "tagColors",
      "customIcons",
      "generator",
    ],
    child: {
      tagColors: "tagColors",
      customIcons: "customIcons",
      generator: "generator",
    },
    sortStrings: ["tags"],
  },
  generator: { order: ["name", "version"] },
  tagColors: { order: [] },
  customIcons: { order: [], allValues: "customIcon" },
  customIcon: { order: ["name", "svg"] },
  diagram: {
    order: [
      "id",
      "level",
      "title",
      "description",
      "ownerNodeId",
      "parentDiagramId",
      "viewport",
      "nodes",
      "edges",
    ],
    child: { viewport: "viewport" },
    element: { nodes: "node", edges: "edge" },
    sortById: ["nodes", "edges"],
  },
  viewport: { order: ["zoom", "x", "y"] },
  node: {
    order: [
      "id",
      "type",
      "name",
      "description",
      "technology",
      "icon",
      "iconSource",
      "position",
      "size",
      "tags",
      "childDiagramId",
      "childRef",
      "externalRef",
      "pinned",
    ],
    child: { position: "point", size: "size", externalRef: "externalRef" },
    sortStrings: ["tags"],
  },
  point: { order: ["x", "y"] },
  size: { order: ["width", "height"] },
  externalRef: { order: ["diagramId", "nodeId"] },
  edge: {
    order: [
      "id",
      "source",
      "target",
      "label",
      "technology",
      "direction",
      "style",
      "tags",
      "realizes",
      "waypoints",
    ],
    element: { waypoints: "point" },
    sortStrings: ["tags"],
  },
};

const INDENT = "  ";

/* -------------------------------------------------------------------------- */
/* Canonical writer                                                           */
/* -------------------------------------------------------------------------- */

/** UTF-16 code-unit comparison — locale-independent, so byte-deterministic. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareById(a: unknown, b: unknown): number {
  const aId =
    typeof a === "object" && a !== null
      ? (a as Record<string, unknown>).id
      : undefined;
  const bId =
    typeof b === "object" && b !== null
      ? (b as Record<string, unknown>).id
      : undefined;
  if (typeof aId !== "string" || typeof bId !== "string") return 0;
  return compareStrings(aId, bId);
}

/**
 * Merge the source object's key insertion order with the schema-declared
 * order: known keys come out in schema order; each unknown key is re-emitted
 * immediately after the known key it followed in the source (leading unknown
 * keys stay first). This is what keeps unknown fields "in position".
 */
function orderKeys(
  srcKeys: readonly string[],
  schemaOrder: readonly string[],
): string[] {
  if (schemaOrder.length === 0) return [...srcKeys];
  const known = new Set(schemaOrder);
  const present = new Set(srcKeys);
  const trailing = new Map<string, string[]>();
  let anchor = "";
  for (const key of srcKeys) {
    if (known.has(key)) {
      anchor = key;
    } else {
      const bucket = trailing.get(anchor);
      if (bucket === undefined) trailing.set(anchor, [key]);
      else bucket.push(key);
    }
  }
  const out = [...(trailing.get("") ?? [])];
  for (const key of schemaOrder) {
    if (present.has(key)) out.push(key);
    const bucket = trailing.get(key);
    if (bucket !== undefined) out.push(...bucket);
  }
  return out;
}

function writeValue(value: unknown, kind: SchemaKind, indent: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error(
          `Cannot serialize a non-finite number (${String(value)}).`,
        );
      }
      return JSON.stringify(value);
    }
    case "object":
      break;
    default:
      throw new Error(`Cannot serialize a value of type "${typeof value}".`);
  }
  if (Array.isArray(value)) {
    return writeArray(value, kind, indent);
  }
  return writeObject(value as Record<string, unknown>, kind, indent);
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function writeArray(
  values: readonly unknown[],
  elementKind: SchemaKind,
  indent: string,
): string {
  if (values.length === 0) return "[]";
  // Arrays of primitives (tags, …) print inline — matching the data-model
  // example ("one logical thing per line") and Prettier's JSON output, so a
  // repo-wide `prettier --write` cannot destabilise the canonical bytes.
  if (values.every(isPrimitive)) {
    return `[${values.map((item) => writeValue(item, elementKind, indent)).join(", ")}]`;
  }
  const childIndent = indent + INDENT;
  const parts = values.map(
    (item) => childIndent + writeValue(item, elementKind, childIndent),
  );
  return `[\n${parts.join(",\n")}\n${indent}]`;
}

function writeObject(
  obj: Record<string, unknown>,
  kind: SchemaKind,
  indent: string,
): string {
  const spec = kind === "unknown" ? undefined : SPECS[kind];
  const srcKeys = Object.keys(obj).filter((key) => obj[key] !== undefined);
  const keys = spec === undefined ? srcKeys : orderKeys(srcKeys, spec.order);
  if (keys.length === 0) return "{}";
  const childIndent = indent + INDENT;
  const parts = keys.map((key) => {
    let value = obj[key];
    let childKind: SchemaKind = "unknown";
    let elementKind: SchemaKind = "unknown";
    if (spec !== undefined) {
      childKind = spec.allValues ?? spec.child?.[key] ?? "unknown";
      elementKind = spec.element?.[key] ?? "unknown";
      if (Array.isArray(value)) {
        if (spec.sortById?.includes(key) === true) {
          value = [...value].sort(compareById);
        } else if (
          spec.sortStrings?.includes(key) === true &&
          value.every((item) => typeof item === "string")
        ) {
          value = [...value].sort(compareStrings);
        }
      }
    }
    const rendered = Array.isArray(value)
      ? writeArray(value, elementKind, childIndent)
      : writeValue(value, childKind, childIndent);
    return `${childIndent}${JSON.stringify(key)}: ${rendered}`;
  });
  return `{\n${parts.join(",\n")}\n${indent}}`;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "$schema",
  "version",
  "metadata",
  "rootDiagramId",
  "diagrams",
]);

/** Shallow copy preserving key insertion order, with `updatedAt` replaced. */
function withUpdatedAt(
  metadata: ArchLabMetadata,
  updatedAt: string,
): ArchLabMetadata {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    out[key] = key === "updatedAt" ? updatedAt : value;
  }
  if (!("updatedAt" in out)) out.updatedAt = updatedAt;
  return out as unknown as ArchLabMetadata;
}

export interface SerializeOptions {
  /**
   * Overrides `metadata.updatedAt` in the OUTPUT only (the model is never
   * mutated). Pass this only when the model actually changed since the last
   * save — data-model.md determinism rule 6.
   */
  updatedAt?: string;
}

/**
 * Serializes the in-memory model to canonical `.archlab.json` text.
 * Pure: identical models always produce identical bytes.
 */
export function serializeModel(
  model: EditorModel,
  opts?: SerializeOptions,
): string {
  const metadata =
    opts?.updatedAt === undefined
      ? model.metadata
      : withUpdatedAt(model.metadata, opts.updatedAt);

  const file: Record<string, unknown> = {};
  if (typeof model.unknownFields.$schema === "string") {
    file.$schema = model.unknownFields.$schema;
  }
  file.version = model.version;
  file.metadata = metadata;
  file.rootDiagramId = model.rootDiagramId;
  file.diagrams = Object.values(model.diagrams);
  for (const [key, value] of Object.entries(model.unknownFields)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) file[key] = value;
  }

  return `${writeObject(file, "file", "")}\n`;
}
