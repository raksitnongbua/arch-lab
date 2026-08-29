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

import {
  type RoleTexture,
  textureCssImage,
  textureCssSize,
} from "@/lib/role-texture";
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
 * The tile geometry each role wears when a theme textures its roles — the
 * SECOND channel identity travels on, and in `eink` the only one (`lib/
 * role-texture.ts` carries the argument for why a hue-free palette needs it).
 *
 * Beside `ROLE_COLOR_VARS` rather than in the texture module, because this is
 * the role table and the role table lives in one file. The flowchart's two
 * extra shapes assign themselves the same way, next to `FLOW_SHAPE_TOKENS`.
 *
 * THE ASSIGNMENTS ARE NOT ARBITRARY, and each one is the reason it can be
 * remembered rather than looked up:
 *
 *   - `external` is PLAIN. It is the one role that means something ("not
 *     ours"), and it is already the quiet one everywhere else — a near-neutral
 *     fill, no wash, matte by decision. Leaving it untextured is that same
 *     decision in the texture channel, not an omission.
 *   - `database` is HORIZONTAL — data at rest, ruled like the strata a
 *     cylinder's rim already draws.
 *   - `queue` is BACK-SLANTED — data in flight; a diagonal is the mark that
 *     reads as movement, and `database`/`queue` stay one family separated by
 *     one property, exactly as their teal/green hues are.
 *   - `person` is STIPPLED. The softest mark in the set for the only role that
 *     is not a machine.
 *   - `internal` is VERTICAL — the plainest ruling for the default working
 *     shape, the one a reader sees most often and should notice least.
 *
 * `hatch-forward` (45°) is DELIBERATELY UNUSED HERE and belongs to the
 * flowchart's `end`. A gantt's four state fills are four of these role tokens,
 * and a gantt bar already carries a 45° duration hatch; a role that ruled at
 * 45° would superpose into it and both meanings would be lost. `check:eink`
 * asserts that, derived from the gantt's own tile paths.
 */
export const TEXTURE_BY_ROLE: Record<NodeColorRole, RoleTexture> = {
  person: "dots",
  internal: "vertical",
  external: "plain",
  database: "horizontal",
  queue: "hatch-back",
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
 * Every tag on this node that carries a `tagColors` entry, in the node's
 * stored tag order. The FIRST one is the colour that wins (see
 * `resolveTagColor`); the rest are the tags a colour edit must take OFF the
 * node, or the new choice silently loses the precedence race — the details
 * panel and `playground/input/canvas-edit.ts` both read this so the control
 * and the gesture cannot disagree about which tags are "the colour".
 */
export function colorTagsOf(
  node: Pick<C4Node, "tags">,
  tagColors: Readonly<Record<string, string>> | undefined,
): string[] {
  if (tagColors === undefined || node.tags === undefined) return [];
  return node.tags.filter((tag) => {
    const color = tagColors[tag];
    return typeof color === "string" && color !== "";
  });
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
  const winner = colorTagsOf(node, tagColors)[0];
  return winner === undefined ? null : (tagColors?.[winner] ?? null);
}

/**
 * The named colours the details panel offers when the document defines none
 * of its own — each becomes a `#<tag>` on the node and one shared
 * `tagcolor <tag> "<hex>"` header line, so ten nodes coloured amber cost the
 * header ONE line, not ten.
 *
 * A CURATED SET beside a free picker. This palette used to be the ONLY offer,
 * refusing free colour for two reasons: a free picker mints one junk tag per
 * node, and it can hand the author a stroke that vanishes on a theme — the
 * on-screen FILL is safe by construction (`tagFillCss` pins its lightness),
 * but the raw hex paints the BORDER, and nothing constructed that. The
 * product owner reversed the refusal, so both reasons are now handled rather
 * than avoided, in `free-color.ts`: a free pick is clamped per hue into the
 * band where the border holds the same bar these five are measured to
 * (stroke ≥3:1 against the constructed tag fill, node title ≥7:1 on it, every
 * declared theme, all audited by `check:canvas-edit` — the clamp's whole
 * output space, not just the five), and its tag is derived from the hex so a
 * repeated colour reuses one header line instead of minting twins. The five
 * named entries stay because a measured, nameable shortlist is still the
 * faster reach for "single this node out".
 *
 * Hues deliberately avoid the four role families (violet 295, blue 250, teal
 * 195, green 150): a palette colour is the author SINGLING a node out, and a
 * near-role hue would read as a sixth role instead. Values are oklch
 * L≈0.61 C 0.11–0.17 rendered to hex — the band the sweep in
 * `check:canvas-edit`'s header found to clear every theme.
 */
export const NODE_TAG_PALETTE: readonly { tag: string; color: string }[] = [
  { tag: "brick", color: "#bc6761" },
  { tag: "orange", color: "#bd6b2a" },
  { tag: "amber", color: "#a47c13" },
  { tag: "plum", color: "#b25ec5" },
  { tag: "rose", color: "#ca549d" },
];

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
  /* THE TEXTURE IS KEYED OFF THE ROLE, NEVER OFF `tagColors`. An author who
     colours a node has said what it should LOOK like, not what it IS — so the
     role marker survives the recolour, which is the whole point of carrying
     identity in a channel the palette does not own. It resolves to `none` in
     every theme but `eink` by way of `--role-texture-opacity`. */
  const texture = TEXTURE_BY_ROLE[colorRoleForNode(node)];
  // Custom properties are legal inline-style keys at runtime; csstype only
  // admits them through a cast.
  return {
    "--node-fill": vars.fill,
    "--node-stroke": vars.stroke,
    "--node-texture": textureCssImage(texture),
    "--node-texture-size": textureCssSize(texture),
  } as CSSProperties;
}
