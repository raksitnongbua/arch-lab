/**
 * The two mapping tables at the heart of the converter, plus the pure
 * functions that apply them in each direction:
 *
 *   - Mermaid element form (`Person`, `SystemDb_Ext`, `ContainerQueue`, …)
 *     → abstract shape → (`C4NodeType`, marker tags) legal at the target
 *     level per `VALID_NODE_TYPES_BY_LEVEL`.
 *   - The exact inverse for the serializer.
 *
 * Where arch-lab's type system is narrower than Mermaid's form set (e.g.
 * there is no "external person" type, and no `database` type at `context`
 * level), the residue is carried in node tags:
 *
 *   - `external`  — the element was an `_Ext` form.
 *   - `database` / `queue` — the Db/Queue variant, when the variant is not
 *     already expressed by the node type itself.
 *   - `person` / `system` / `container` / `component` — the original element
 *     kind, when the node had to be coerced to a different type to stay
 *     legal at its level (e.g. a plain `System` inside `C4Container` becomes
 *     `externalSystem` + tag `system`).
 *   - `boundary:<id>` — boundary membership; owned by `toModel.ts`/`emit.ts`,
 *     ignored here.
 *
 * The pair (`toNodeType`, `toElementForm`) is a bijection over everything the
 * parser can produce, which is what makes parse → serialize → parse stable.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import { isNodeTypeValidAtLevel } from "@/types";
import type { C4Level, C4NodeType } from "@/types";

/* -------------------------------------------------------------------------- */
/* Diagram types                                                               */
/* -------------------------------------------------------------------------- */

export const MERMAID_DIAGRAM_TYPES = [
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
] as const;

export type MermaidDiagramType = (typeof MERMAID_DIAGRAM_TYPES)[number];

/**
 * Level for each Mermaid diagram type. `C4Dynamic` and `C4Deployment` have no
 * exact C4 level: both draw containers/nodes, so they map to `container`
 * (documented lossy choice — dynamic call ordering and deployment topology
 * are not part of arch-lab's model).
 */
export const LEVEL_BY_DIAGRAM_TYPE: Readonly<
  Record<MermaidDiagramType, C4Level>
> = {
  C4Context: "context",
  C4Container: "container",
  C4Component: "component",
  C4Dynamic: "container",
  C4Deployment: "container",
};

/** Header emitted for each level. `code` has no Mermaid C4 equivalent. */
export const DIAGRAM_TYPE_BY_LEVEL: Readonly<
  Record<C4Level, MermaidDiagramType>
> = {
  context: "C4Context",
  container: "C4Container",
  component: "C4Component",
  code: "C4Component",
};

/* -------------------------------------------------------------------------- */
/* Element forms                                                               */
/* -------------------------------------------------------------------------- */

export type ElementKind = "person" | "system" | "container" | "component";
export type ElementVariant = "plain" | "database" | "queue";

/**
 * Argument layout after the alias and label:
 * `person` forms take `(alias, label, ?description)`;
 * `tech` forms take `(alias, label, ?technology, ?description)`.
 */
export type ArgStyle = "person" | "tech";

export interface ElementFormSpec {
  kind: ElementKind;
  variant: ElementVariant;
  external: boolean;
  argStyle: ArgStyle;
}

function form(
  kind: ElementKind,
  variant: ElementVariant,
  external: boolean,
  argStyle: ArgStyle,
): ElementFormSpec {
  return { kind, variant, external, argStyle };
}

export const ELEMENT_FORMS: Readonly<Record<string, ElementFormSpec>> = {
  Person: form("person", "plain", false, "person"),
  Person_Ext: form("person", "plain", true, "person"),
  System: form("system", "plain", false, "person"),
  System_Ext: form("system", "plain", true, "person"),
  SystemDb: form("system", "database", false, "person"),
  SystemDb_Ext: form("system", "database", true, "person"),
  SystemQueue: form("system", "queue", false, "person"),
  SystemQueue_Ext: form("system", "queue", true, "person"),
  Container: form("container", "plain", false, "tech"),
  Container_Ext: form("container", "plain", true, "tech"),
  ContainerDb: form("container", "database", false, "tech"),
  ContainerDb_Ext: form("container", "database", true, "tech"),
  ContainerQueue: form("container", "queue", false, "tech"),
  ContainerQueue_Ext: form("container", "queue", true, "tech"),
  Component: form("component", "plain", false, "tech"),
  Component_Ext: form("component", "plain", true, "tech"),
  ComponentDb: form("component", "database", false, "tech"),
  ComponentDb_Ext: form("component", "database", true, "tech"),
  ComponentQueue: form("component", "queue", false, "tech"),
  ComponentQueue_Ext: form("component", "queue", true, "tech"),
};

/* -------------------------------------------------------------------------- */
/* Boundary forms                                                              */
/* -------------------------------------------------------------------------- */

export type BoundaryKind =
  "enterprise" | "system" | "container" | "generic" | "deployment";

export interface BoundaryFormSpec {
  kind: BoundaryKind;
  /** Whether the 3rd positional argument is a type label / description. */
  hasTypeArg: boolean;
}

export const BOUNDARY_FORMS: Readonly<Record<string, BoundaryFormSpec>> = {
  Enterprise_Boundary: { kind: "enterprise", hasTypeArg: false },
  System_Boundary: { kind: "system", hasTypeArg: false },
  Container_Boundary: { kind: "container", hasTypeArg: false },
  Boundary: { kind: "generic", hasTypeArg: true },
  Deployment_Node: { kind: "deployment", hasTypeArg: true },
  Node: { kind: "deployment", hasTypeArg: true },
  Node_L: { kind: "deployment", hasTypeArg: true },
  Node_R: { kind: "deployment", hasTypeArg: true },
};

/** Canonical keyword emitted for each boundary kind. */
export const BOUNDARY_FORM_BY_KIND: Readonly<Record<BoundaryKind, string>> = {
  enterprise: "Enterprise_Boundary",
  system: "System_Boundary",
  container: "Container_Boundary",
  generic: "Boundary",
  deployment: "Deployment_Node",
};

/* -------------------------------------------------------------------------- */
/* Relationship forms                                                          */
/* -------------------------------------------------------------------------- */

export interface RelFormSpec {
  bidirectional: boolean;
}

export const REL_FORMS: Readonly<Record<string, RelFormSpec>> = {
  Rel: { bidirectional: false },
  BiRel: { bidirectional: true },
  Rel_U: { bidirectional: false },
  Rel_Up: { bidirectional: false },
  Rel_D: { bidirectional: false },
  Rel_Down: { bidirectional: false },
  Rel_L: { bidirectional: false },
  Rel_Left: { bidirectional: false },
  Rel_R: { bidirectional: false },
  Rel_Right: { bidirectional: false },
  Rel_Back: { bidirectional: false },
};

/**
 * Styling/layout directives that are parsed (so a file containing them is
 * not rejected) and then deliberately dropped — arch-lab has its own
 * presentation model.
 */
export const IGNORED_CALLS: ReadonlySet<string> = new Set([
  "UpdateElementStyle",
  "UpdateRelStyle",
  "UpdateBoundaryStyle",
  "UpdateLayoutConfig",
]);

/* -------------------------------------------------------------------------- */
/* Element form → node type (parse direction)                                  */
/* -------------------------------------------------------------------------- */

const KIND_TAGS: readonly string[] = [
  "person",
  "system",
  "container",
  "component",
];
const MARKER_TAGS: ReadonlySet<string> = new Set([
  ...KIND_TAGS,
  "external",
  "database",
  "queue",
]);

/**
 * Maps a parsed element shape onto a `C4NodeType` legal at `level`, plus the
 * marker tags needed to reverse the mapping. Tags come out sorted (the
 * data-model's write-time rule).
 */
export function toNodeType(
  spec: ElementFormSpec,
  level: C4Level,
): { type: C4NodeType; tags: string[] } {
  const tags: string[] = [];
  if (spec.external) tags.push("external");

  let type: C4NodeType;
  if (spec.kind === "person" && isNodeTypeValidAtLevel("person", level)) {
    type = "person";
  } else if (spec.external) {
    type = "externalSystem";
    if (spec.kind !== "system") tags.push(spec.kind);
  } else {
    // Internal (non-_Ext) element: prefer the level's native type.
    const native: C4NodeType =
      spec.variant === "database"
        ? "database"
        : spec.variant === "queue"
          ? "queue"
          : spec.kind === "container"
            ? "container"
            : spec.kind === "component"
              ? "component"
              : "softwareSystem";
    const nativeFits =
      isNodeTypeValidAtLevel(native, level) &&
      // A Db/Queue variant may only claim the native database/queue type if
      // its kind matches the level (SystemDb at container level must stay a
      // "system", not become the container's own database).
      (spec.variant === "plain" || kindMatchesLevel(spec.kind, level));
    if (nativeFits) {
      type = native;
      if (spec.kind === "system" && level !== "context") tags.push("system");
    } else if (
      spec.kind === "system" &&
      isNodeTypeValidAtLevel("softwareSystem", level)
    ) {
      type = "softwareSystem";
    } else {
      type = "externalSystem";
      tags.push(spec.kind === "system" ? "system" : spec.kind);
    }
  }

  if (
    (spec.variant === "database" && type !== "database") ||
    (spec.variant === "queue" && type !== "queue")
  ) {
    tags.push(spec.variant);
  }

  tags.sort();
  return { type, tags };
}

function kindMatchesLevel(kind: ElementKind, level: C4Level): boolean {
  return (
    (kind === "container" && level === "container") ||
    (kind === "component" && level === "component")
  );
}

/* -------------------------------------------------------------------------- */
/* Node type → element form (emit direction)                                   */
/* -------------------------------------------------------------------------- */

/**
 * The inverse of `toNodeType`. Also total over hand-authored arch-lab
 * models whose tags were never produced by the parser: every (type, level)
 * has a canonical form. `codeElement` (no Mermaid equivalent) emits as
 * `Component`.
 */
export function toElementForm(
  type: C4NodeType,
  tags: ReadonlySet<string>,
  level: C4Level,
): { form: string; spec: ElementFormSpec } {
  const external = tags.has("external");
  const variant: ElementVariant =
    type === "database" || tags.has("database")
      ? "database"
      : type === "queue" || tags.has("queue")
        ? "queue"
        : "plain";

  let kind: ElementKind;
  let ext = external;
  switch (type) {
    case "person":
      kind = "person";
      break;
    case "softwareSystem":
      kind = tags.has("container")
        ? "container"
        : tags.has("component")
          ? "component"
          : "system";
      break;
    case "container":
      kind = "container";
      break;
    case "component":
    case "codeElement":
      kind = "component";
      break;
    case "database":
    case "queue":
      kind = tags.has("system")
        ? "system"
        : level === "component"
          ? "component"
          : "container";
      break;
    case "externalSystem":
      kind = tags.has("person")
        ? "person"
        : tags.has("container")
          ? "container"
          : tags.has("component")
            ? "component"
            : "system";
      // The type itself means "_Ext" unless the node was a coerced internal
      // element (which the parser marks with a kind tag but no "external").
      ext = external || !hasCoercionTag(tags);
      break;
  }

  const name = formName(kind, variant, ext);
  const spec = ELEMENT_FORMS[name];
  return { form: name, spec };
}

function hasCoercionTag(tags: ReadonlySet<string>): boolean {
  return KIND_TAGS.some((tag) => tags.has(tag));
}

function formName(
  kind: ElementKind,
  variant: ElementVariant,
  external: boolean,
): string {
  if (kind === "person") return external ? "Person_Ext" : "Person";
  const base =
    kind === "system"
      ? "System"
      : kind === "container"
        ? "Container"
        : "Component";
  const suffix =
    variant === "database" ? "Db" : variant === "queue" ? "Queue" : "";
  return `${base}${suffix}${external ? "_Ext" : ""}`;
}

/** Tags that carry user content rather than converter markers. */
export function isMarkerTag(tag: string): boolean {
  return MARKER_TAGS.has(tag) || tag.startsWith("boundary:");
}
