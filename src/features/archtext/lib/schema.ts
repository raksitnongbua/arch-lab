/**
 * Schema-declared key knowledge shared by the `.aft` parser and serializer.
 *
 * `*_KEYS` mirror the key orders of `src/features/editor/io/serialize.ts`
 * (data-model.md field tables) — the serializer walks objects with these to
 * split known keys from unknown forward-compatible keys, and the parser
 * assembles objects in exactly this order so the editor's JSON writer
 * reproduces the original bytes.
 *
 * `*_RAW` list the known keys that may be set through a raw `! <key> : <json>`
 * escape line. These are the fields the editor's validator does NOT
 * shape-check, so a forward-compatible file could carry them with an
 * unexpected shape; the raw form keeps even those lossless.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

export const FILE_KEYS = [
  "$schema",
  "version",
  "metadata",
  "rootDiagramId",
  "diagrams",
] as const;

export const META_KEYS = [
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
] as const;

export const DIAGRAM_KEYS = [
  "id",
  "level",
  "title",
  "description",
  "ownerNodeId",
  "parentDiagramId",
  "viewport",
  "nodes",
  "edges",
] as const;

export const NODE_KEYS = [
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
] as const;

export const EDGE_KEYS = [
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
] as const;

export const POINT_KEYS = ["x", "y"] as const;
export const SIZE_KEYS = ["width", "height"] as const;
export const EXTERNAL_REF_KEYS = ["diagramId", "nodeId"] as const;
export const VIEWPORT_KEYS = ["zoom", "x", "y"] as const;
export const GENERATOR_KEYS = ["name", "version"] as const;
export const CUSTOM_ICON_KEYS = ["name", "svg"] as const;

export const META_RAW: ReadonlySet<string> = new Set([
  "description",
  "owner",
  "tags",
  "lastReviewedAt",
  "tagColors",
  "customIcons",
  "generator",
]);

export const DIAGRAM_RAW: ReadonlySet<string> = new Set(["description"]);

export const NODE_RAW: ReadonlySet<string> = new Set([
  "description",
  "technology",
  "icon",
  "iconSource",
  "tags",
  "childDiagramId",
  "childRef",
  "pinned",
]);

export const EDGE_RAW: ReadonlySet<string> = new Set([
  "label",
  "technology",
  "tags",
  "realizes",
  "waypoints",
]);

/** An unknown (or raw-known) field carried by a `!` line. */
export interface UnknownField {
  key: string;
  /** The known key it follows in the object, or `null` when leading. */
  after: string | null;
  value: unknown;
}

/**
 * Splits an object's keys (insertion order, `undefined` values skipped) into
 * the unknown keys with the known-key anchor each one follows — the exact
 * anchor rule of the editor serializer's `orderKeys`.
 */
export function splitUnknowns(
  obj: Record<string, unknown>,
  known: readonly string[],
): UnknownField[] {
  const knownSet: ReadonlySet<string> = new Set(known);
  const out: UnknownField[] = [];
  let anchor: string | null = null;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (knownSet.has(key)) {
      anchor = key;
    } else {
      out.push({ key, after: anchor, value });
    }
  }
  return out;
}
