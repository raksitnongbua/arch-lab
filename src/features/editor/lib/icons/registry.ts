/**
 * The icon registry (dev-handoff §4.6, D15, AF-E4-S1/S2). Owned by T2-A.
 * Icons are referenced by slug; no SVG data or URL is ever written into the
 * model.
 *
 * TWO SOURCES, AND ONLY TWO:
 *
 * 1. PRODUCTS come from the `thesvg` package (`./brand`) — real logos, used
 *    NOMINATIVELY to label what a container runs, never to imply endorsement.
 *    Each mark remains the trademark of its owner. A coloured mark is NEVER
 *    recoloured: beyond diluting it, several upstream licences forbid
 *    derivatives outright, so `currentColor`-ing one is not merely ugly but a
 *    licence breach. The narrow exception is a monochrome RENDERING of a mark
 *    that publishes none, gated on an explicit licence allowlist (brand.tsx).
 *
 * 2. CONCEPTS come from lucide (`./generic`) — a database, a queue, a person,
 *    an API. Monochrome, because there is no brand colour to be faithful to;
 *    the node's accent is the only colour that means anything, and
 *    `currentColor` lets the canvas supply it.
 *
 * WHAT WAS DELETED, and why it matters. A third family used to live here: 59
 * hand-drawn SVGs covering both concepts AND named products. The product half
 * was the problem — hand-drawn logos are cruder than the vendors' own, and no
 * amount of redrawing gives them a colour version, so colour mode could never
 * look coherent while a third of its marks had nothing to show. All of it is
 * gone. Slugs did not change, which is the whole reason the model stores a
 * slug and never artwork: `@postgresql` in a year-old document resolves to
 * the new drawing with no migration.
 *
 * ONE INK OR TWO is the reader's choice, not the document's (`IconStyle`),
 * resolved per icon by `byStyle`. Products draw their published `mono`
 * variant where there is one, a licensed derivation where there is not, and
 * stay coloured in the four cases where neither is permitted. Concepts render
 * the same either way. So each style has one coherent story: mono is a single
 * ink throughout, colour is "every logo is the real logo, every concept is a
 * glyph".
 *
 * WHETHER A MARK CAN BE SEEN is settled by `pnpm check:icon-contrast`, which
 * renders all of them on a light and a dark canvas and counts the pixels that
 * stand out. Three rounds of invisible icons shipped before that existed —
 * white ink on white, black ink on black, unfilled paths falling back to the
 * browser's default black — because every one of them is well-formed markup
 * that no parser, type or build can object to.
 *
 * SLUG COLLISIONS: `ICONS` below throws on any duplicate rather than letting
 * `Object.fromEntries`-style last-wins silently shadow one definition with
 * another — a concept and a product claiming one slug is exactly the bug this
 * registry must make impossible. The throw fires while `pnpm build`
 * prerenders, so a collision cannot ship.
 */

import type { C4Node, C4NodeType } from "@/types";

import type { IconStyle } from "@/lib/icon-style";

import { BRAND_ICON_DEFS } from "./brand";
import { GENERIC_ICON_DEFS } from "./generic";
import { ICON_CATEGORY_ORDER, type IconCategory } from "./categories";

export type { IconCategory } from "./categories";

type IconSvg = React.FC<React.SVGProps<SVGSVGElement>>;

/**
 * What an icon DECLARES — the authoring shape, used by the literals below and
 * by `brand.tsx`. Consumers get `IconDef`, which adds the per-style lookup.
 */
export interface IconSource {
  /** e.g. "postgresql" — what the model stores. */
  slug: string;
  /** e.g. "PostgreSQL". */
  name: string;
  /** e.g. ["pg", "postgres"]. */
  aliases: string[];
  category: IconCategory;
  /** Inline SVG component; `currentColor` where monochrome. */
  Svg: IconSvg;
  /**
   * The monochrome artwork, for readers who prefer one ink (`IconStyle`).
   * ABSENT means "`Svg` is already the answer" — true of every hand-authored
   * icon, and of the nine brand marks that ship no `mono` variant. Read it
   * through `byStyle`, never directly, so those two cases stay one case at
   * the call site.
   */
  SvgMono?: IconSvg;
  /**
   * True when `Svg` paints with `currentColor`: the hand-authored set, plus
   * the brand marks whose artwork carries no ink of its own. False for a
   * coloured brand mark, whose colours are immutable (file header — never
   * recolour).
   */
  monochrome: boolean;
}

export interface IconDef extends IconSource {
  /**
   * The artwork for each reader style, RESOLVED — both keys always present.
   *
   * A lookup rather than a `pickIcon(def, style)` helper on purpose. The
   * helper existed first and every call site tripped
   * `react-hooks/static-components`: a component returned from a function
   * call cannot be told apart, by lint, from one DEFINED during render (which
   * remounts its subtree every frame). These components are built once at
   * module load, so the warning was false — but five suppressions teach a
   * reader to ignore a rule that is usually right, and a table is what the
   * data was anyway.
   */
  readonly byStyle: Readonly<Record<IconStyle, IconSvg>>;
}

/**
 * Falling back to `Svg` for mono is not a compromise but the correct answer
 * twice over: a hand-authored icon IS monochrome already, and a brand mark
 * with no upstream `mono` variant has no monochrome artwork we are allowed to
 * invent — deriving one by stripping colour is the recolouring the registry
 * forbids. So mono mode is best-effort by design, and a few marks stay
 * coloured in it; `IconStyleToggle` says how many rather than letting it read
 * as a rendering bug.
 */
function resolveStyles(source: IconSource): IconDef {
  return {
    ...source,
    byStyle: {
      colour: source.Svg,
      mono: source.SvgMono ?? source.Svg,
    },
  };
}

/** Brand marks that stay coloured in mono mode — upstream ships no `mono`. */
export function iconsWithoutMono(): IconDef[] {
  return ICON_DEFS.filter(
    (def) => !def.monochrome && def.SvgMono === undefined,
  );
}

const CATEGORY_RANK: ReadonlyMap<IconCategory, number> = new Map(
  ICON_CATEGORY_ORDER.map((category, index) => [category, index]),
);

const rankOf = (category: IconCategory): number =>
  CATEGORY_RANK.get(category) ?? ICON_CATEGORY_ORDER.length;

/**
 * Registry order = picker display order: category-major, hand-authored icons
 * first within each category (the house monochrome set leads), brand marks
 * after them, name-sorted (brand.tsx keeps its list in that order). The sort
 * key is the category ALONE — JS sort is stable, so each source list's
 * internal order survives the merge. `searchIcons("")` returns exactly this
 * order.
 */
const ICON_DEFS: readonly IconDef[] = [...GENERIC_ICON_DEFS, ...BRAND_ICON_DEFS]
  .sort((a, b) => rankOf(a.category) - rankOf(b.category))
  .map(resolveStyles);

/**
 * Slug → def. Built with an explicit duplicate check (file header, "slug
 * collisions"): a map literal or `fromEntries` would let the LAST definition
 * silently win, and a brand icon shadowing a hand-authored slug (or vice
 * versa) is exactly the bug this registry must make impossible.
 */
export const ICONS: Record<string, IconDef> = {};
for (const def of ICON_DEFS) {
  if (ICONS[def.slug] !== undefined) {
    throw new Error(
      `icon slug "${def.slug}" is defined twice — the hand-authored mark ` +
        `owns its slug; drop or rename the brand entry in brand.tsx`,
    );
  }
  ICONS[def.slug] = def;
}

/**
 * Type → default icon slug (AF-E4-S3 baseline). MUST stay in agreement with
 * `FALLBACK_ICON_BY_TYPE` in `hooks/use-canvas-nodes.ts` (Batch-1-final),
 * which mirrors these values.
 */
export const DEFAULT_ICON_BY_TYPE: Record<C4NodeType, string> = {
  person: "person",
  softwareSystem: "service",
  externalSystem: "external",
  container: "service",
  database: "database",
  queue: "queue",
  component: "service",
  codeElement: "service",
};

/**
 * Never throws; an unknown slug resolves to the type's generic fallback with
 * `isFallback: true` so the node can render a warning marker (AF-E4-S1 —
 * never blank, never broken). An absent icon is the type default and is NOT
 * flagged.
 */
export function resolveIcon(node: Pick<C4Node, "icon" | "type">): {
  def: IconDef;
  isFallback: boolean;
} {
  if (node.icon !== undefined && node.icon !== "") {
    const def = ICONS[node.icon];
    if (def !== undefined) return { def, isFallback: false };
    return { def: ICONS[DEFAULT_ICON_BY_TYPE[node.type]], isFallback: true };
  }
  return { def: ICONS[DEFAULT_ICON_BY_TYPE[node.type]], isFallback: false };
}

/**
 * Case-insensitive substring match on name, slug and aliases — "pg" and
 * "postgres" both find PostgreSQL (AF-E4-S2). An empty query returns the full
 * registry. Results keep registry order: category-major, then name.
 */
export function searchIcons(query: string): IconDef[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...ICON_DEFS];
  return ICON_DEFS.filter(
    (def) =>
      def.name.toLowerCase().includes(needle) ||
      def.slug.toLowerCase().includes(needle) ||
      def.aliases.some((alias) => alias.toLowerCase().includes(needle)),
  );
}
