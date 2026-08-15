/**
 * The ONE type→colour table for C4 nodes, consumed by both renderers (the
 * editor's `node-chrome.tsx`, the viewer's `viewer-node.tsx`), the shape
 * layer (`node-shapes.tsx`) and the SVG exporter (`viewer/export`). Follows
 * the same centralisation rule as `VALID_NODE_TYPES_BY_LEVEL` and the Mermaid
 * `mapping.ts` tables: one table, no duplicated rules — this file replaces
 * the `externalSystem` opacity tweak that used to live independently (and
 * identically) in both node components.
 *
 * Eight node types collapse onto FIVE colour roles rather than eight hues.
 * The budget is spent by CO-OCCURRENCE: a hue is only worth paying for when
 * the types it separates appear in the SAME diagram. A single container
 * diagram routinely shows container + database + queue + externalSystem +
 * person side by side — so each of those gets its own role. The four
 * internal altitudes (softwareSystem / container / component / codeElement)
 * NEVER share a canvas — a node's level is its diagram's level
 * — so stepping their hue would buy zero side-by-side
 * separation and just make the four levels look like four unrelated
 * products; they stay one blue, and border weight keeps stepping by type
 * (softwareSystem carries `border-2`).
 *
 *   - `person`   — the human actor, violet (the house primary family). C4
 *     convention singles the person out, and within one diagram it is the
 *     only silhouette that is not a piece of software.
 *   - `internal` — softwareSystem / container / component / codeElement, one
 *     confident blue (see the altitude argument above).
 *   - `external` — near-neutral grey, receding: not our code, not our story.
 *     DELIBERATELY the one role that stays almost colourless — it is the
 *     only colour on the canvas carrying meaning rather than decoration,
 *     and "not ours" only reads while everything external refuses to
 *     compete with the vivid roles around it.
 *   - `database` — data at rest, teal (the house accent family).
 *   - `queue`    — data in flight, green: same cool family as the database
 *     (both are "the data layer" and routinely flank the same containers),
 *     but a hue of its own because a container diagram showing BOTH is the
 *     norm, not the exception — the one distinction the previous shared
 *     `storage` role kept erasing.
 *
 * The three notions of "external" deliberately read differently:
 *
 *   1. The `externalSystem` TYPE → the `external` role (grey + the dashed
 *      border it always had).
 *   2. The `external` TAG — the residue a Mermaid `_Ext` form leaves when it
 *      had to be coerced to a type that is legal at its level (see
 *      `mermaid/lib/mapping.ts`). It ALSO maps to the `external` role: a
 *      Mermaid external person is type `person` + tag `external`, and it
 *      must not read as one of our actors — it keeps the person silhouette
 *      (shape carries "person") but goes grey (colour carries "not ours").
 *   3. An `externalRef` placeholder is NOT external in this sense — it is
 *      the same element, merely defined one level up — so it keeps its real
 *      role's colour and stays de-emphasised by the placeholder opacity and
 *      the `↑ ref` badge both renderers already draw.
 *
 * Colour is never the only signal (WCAG 1.4.1): every type keeps its
 * silhouette (shoulders, cylinder, pipe, tab glyph, dashed border) and the
 * visible `[Type]` metadata line — this module adds colour alongside them,
 * it removes nothing.
 *
 * Mechanically, colour flows through TWO custom properties — `--node-fill`
 * and `--node-stroke` — set per node (inline, on the React Flow wrapper) and
 * defaulted in `globals.css`. The shape classes reference only these vars,
 * so a node is recoloured by swapping two properties, never by swapping
 * class lists per consumer. Rejected alternative: per-role Tailwind classes
 * on every shape entry — that multiplies `SHAPE_WRAPPER_CLASSES` by role and
 * still leaves `tagColors` (arbitrary author hex) impossible to express as a
 * static class.
 */

import type { CSSProperties } from "react";

import type { C4Node, C4NodeType } from "@/types";

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

export type NodeColorRole =
  "person" | "internal" | "external" | "database" | "queue";

export const COLOR_ROLE_BY_TYPE: Record<C4NodeType, NodeColorRole> = {
  person: "person",
  softwareSystem: "internal",
  container: "internal",
  component: "internal",
  codeElement: "internal",
  externalSystem: "external",
  database: "database",
  queue: "queue",
};

/** The Mermaid-import residue tag marking "this was an `_Ext` form". */
export const EXTERNAL_TAG = "external";

/**
 * The colour role for a node: the `external` tag overrides the type's role
 * (an imported external person must not read internal), everything else is
 * the type table verbatim.
 */
export function colorRoleForNode(
  node: Pick<C4Node, "type" | "tags">,
): NodeColorRole {
  if (node.tags?.includes(EXTERNAL_TAG) === true) return "external";
  return COLOR_ROLE_BY_TYPE[node.type];
}

/**
 * Theme token names per role (values and measured contrast live in
 * `globals.css`). Named as var references so consumers can drop them
 * straight into `--node-fill` / `--node-stroke`.
 */
export const ROLE_COLOR_VARS: Record<
  NodeColorRole,
  { fill: string; stroke: string }
> = {
  person: { fill: "var(--node-person)", stroke: "var(--node-person-border)" },
  internal: {
    fill: "var(--node-internal)",
    stroke: "var(--node-internal-border)",
  },
  external: {
    fill: "var(--node-external)",
    stroke: "var(--node-external-border)",
  },
  database: {
    fill: "var(--node-database)",
    stroke: "var(--node-database-border)",
  },
  queue: {
    fill: "var(--node-queue)",
    stroke: "var(--node-queue-border)",
  },
};

/**
 * External elements additionally recede a step. One constant instead of the
 * literal that used to be duplicated in both node components; keyed off the
 * ROLE so a tag-external person recedes exactly like an `externalSystem`.
 * The exporter mirrors it as `EXTERNAL_NODE_OPACITY`.
 */
export const EXTERNAL_DIM_CLASS = "opacity-90";
export const EXTERNAL_NODE_OPACITY = 0.9;

/* -------------------------------------------------------------------------- */
/* tagColors — the author override                                             */
/* -------------------------------------------------------------------------- */

/**
 * The on-screen CSS expression for a tag-coloured FILL. The raw hex paints
 * the border (strong, identifiable); the fill takes the author's HUE and
 * (capped) chroma but OUR lightness — `--tag-fill-l` / `--tag-fill-c`,
 * defined per theme in globals.css to match the role fills exactly.
 *
 * This replaced the first pass's `color-mix(tag 14%, var(--node))` wash,
 * for two reasons: (1) 14% was tuned against near-white base fills — over
 * the vivid role palette a TAGGED node came out paler than an untagged one,
 * the author's deliberate colour reading as less colour; (2) a percentage
 * mix inherits the author's lightness, so a dark tag could sink the fill
 * below what the text tokens can hold. Relative colour syntax makes the
 * contrast hold BY CONSTRUCTION instead: whatever the author writes, the
 * fill lands on exactly the lightness the measured role fills use, so the
 * ratios annotated in globals.css cover tag fills too (the chroma cap keeps
 * hue-induced luminance drift inside what the audit script bounds with
 * worst-case hues). Rejected alternative: re-tuning the percentage — no
 * single percentage is right for both dark and light author colours.
 */
export function tagFillCss(tagColor: string): string {
  return `oklch(from ${tagColor} var(--tag-fill-l) min(c, var(--tag-fill-c)) h)`;
}

/**
 * The author's explicit colour for this node, or null. Precedence within a
 * node's tags: the FIRST tag (in stored order — tags are sorted lexically on
 * write, so this is deterministic and diff-stable) that has a `tagColors`
 * entry wins. Rejected alternative: `tagColors` key order — that would let
 * an unrelated metadata edit recolour nodes.
 */
export function resolveTagColor(
  node: Pick<C4Node, "tags">,
  tagColors: Readonly<Record<string, string>> | undefined,
): string | null {
  if (tagColors === undefined || node.tags === undefined) return null;
  for (const tag of node.tags) {
    const color = tagColors[tag];
    if (typeof color === "string" && color !== "") return color;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The per-node style                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Inline style for a node's React Flow wrapper: sets `--node-fill` /
 * `--node-stroke`, which the shape classes (node-shapes.tsx) consume via
 * inheritance.
 *
 * PRECEDENCE (the rule, in one place): an author's explicit `tagColors`
 * entry beats everything — including the `external`-tag greying — because
 * `tagColors` is the file format's deliberate, user-facing colour feature
 * and a residue tag must never override a choice the author
 * typed. Then the `external` tag, then the type default.
 */
export function nodeColorStyle(
  node: Pick<C4Node, "type" | "tags">,
  tagColors: Readonly<Record<string, string>> | undefined,
): CSSProperties {
  const tagColor = resolveTagColor(node, tagColors);
  const vars =
    tagColor !== null
      ? { fill: tagFillCss(tagColor), stroke: tagColor }
      : ROLE_COLOR_VARS[colorRoleForNode(node)];
  // Custom properties are legal inline-style keys at runtime; csstype only
  // admits them through a cast.
  return {
    "--node-fill": vars.fill,
    "--node-stroke": vars.stroke,
  } as CSSProperties;
}
