import type { C4Level } from "@/types";

export const APP_NAME = "arch-lab";

/* -------------------------------------------------------------------------- */
/* Feature flags                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ships the C4 editor. `true` for the current deploy: the navbar carries its
 * Editor entry, `/editor` renders the real canvas, and every editor CTA and
 * capability claim on the landing page, the demo index, and view mode speaks
 * in the present tense.
 *
 * Flip to `false` and all of those downgrade to an honest "coming soon" on
 * their own. The one extra step is `src/app/editor/page.tsx`, which must stop
 * importing the editor while disabled — otherwise the deployed bundle still
 * carries the editor UI that the flag claims is not shipped.
 *
 * Typed `boolean`, not the literal, so both branches of every consumer stay
 * type-checked whichever way the flag points.
 */
export const EDITOR_ENABLED: boolean = true;

export const APP_DESCRIPTION =
  "A local-first workspace for architecture documentation — C4 model diagrams and sequence diagrams today, with a data dictionary and network diagrams planned. Everything saves as plain, reviewable text you own, and an MCP server lets an AI agent author and validate it.";

/* -------------------------------------------------------------------------- */
/* Theming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every theme the app knows about. Each entry needs exactly one matching CSS
 * block in `src/app/globals.css` (see the EXTENSION POINT comment there).
 * The provider and the toggle both read this list, so adding "midnight" here
 * plus a `.midnight { ... }` CSS block is the whole change.
 */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** Dark is a deliberate product decision (AF-E6-S1), not an OS preference. */
export const DEFAULT_THEME: Theme = "dark";

/** localStorage key next-themes persists the choice under. */
export const THEME_STORAGE_KEY = "arch-lab-theme";

/* -------------------------------------------------------------------------- */
/* C4 level presentation                                                       */
/* -------------------------------------------------------------------------- */

export interface C4LevelMeta {
  level: C4Level;
  /** 1-4, as shown in C4 documentation. */
  order: number;
  label: string;
  audience: string;
  summary: string;
  /** Example node types you would place at this level. */
  examples: string[];
}

/** Copy for the landing page, ordered outermost → innermost. */
export const C4_LEVEL_META: readonly C4LevelMeta[] = [
  {
    level: "context",
    order: 1,
    label: "Context",
    audience: "Everyone",
    summary:
      "The system as one box, the people who use it, and the third parties it depends on.",
    examples: ["Person", "Software System", "External System"],
  },
  {
    level: "container",
    order: 2,
    label: "Container",
    audience: "Architects & developers",
    summary:
      "The deployable units inside the boundary — apps, services, gateways, and data stores.",
    examples: ["Container", "Database", "Queue"],
  },
  {
    level: "component",
    order: 3,
    label: "Component",
    audience: "Developers",
    summary:
      "The internal structure of one container: handlers, use cases, adapters, and repositories.",
    examples: ["Component", "Database", "Queue"],
  },
  {
    level: "code",
    order: 4,
    label: "Code",
    audience: "Whoever is in the file",
    summary:
      "The last mile — the classes, interfaces, and functions that make a component real.",
    examples: ["Code Element"],
  },
];

/**
 * `C4_LEVEL_META` indexed by level.
 *
 * Total by construction — every `C4Level` has exactly one entry — so callers
 * get the meta without a `?? fallback` for a case that cannot happen. Reach for
 * this rather than `C4_LEVEL_META.find((m) => m.level === level)`, which is
 * both O(n) and needlessly nullable. The array stays the export to iterate when
 * display ORDER matters; this is the export to look one up by level.
 */
export const LEVEL_META_BY_LEVEL: Record<C4Level, C4LevelMeta> =
  Object.fromEntries(C4_LEVEL_META.map((meta) => [meta.level, meta])) as Record<
    C4Level,
    C4LevelMeta
  >;

/**
 * Level → display label. Derived, so the word a breadcrumb shows and the word
 * the landing page shows cannot drift apart.
 */
export const LEVEL_LABEL: Record<C4Level, string> = Object.fromEntries(
  C4_LEVEL_META.map((meta) => [meta.level, meta.label]),
) as Record<C4Level, string>;

/* -------------------------------------------------------------------------- */
/* File format                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Major version of the `.alab` / arch-lab JSON format this build understands.
 *
 * One declaration for the whole app: the JSON validator, the C4 text parser,
 * and the sequence text parser all gate on it, and a release that bumps the
 * format must not have to remember three places.
 */
export const SUPPORTED_MAJOR_VERSION = 1;

/**
 * Longest `title` the format asks for, in characters.
 *
 * ADVISORY, NOT ENFORCED — deliberately. A title is prose a human wrote, and
 * refusing to open a document over a punctuation mark would make a share link
 * that worked yesterday fail today. The parser therefore accepts any title and
 * the checkers say so instead, which is the same treatment the C4 review notes
 * get: valid, and worth a word.
 *
 * 120 is roughly four times the longest title anywhere in this repo (32). It is
 * the point past which a title has stopped being a title: it becomes an export
 * filename, a card in the demo gallery, and the accessible name a screen reader
 * reads before every diagram.
 *
 * It now has a LAYOUT consequence too, which it did not when it was written: a
 * sequence diagram draws its title inside the drawing (`sequence/lib/layout.ts`,
 * `layoutHeading`), so an over-long one wraps to more lines and pushes the flow
 * further down the canvas. Nothing breaks — it wraps rather than overflowing, and
 * the canvas widens if it must — but the advisory now has a visible reason
 * anyone can see, not just a filename argument.
 */
export const MAX_TITLE_LENGTH = 120;

/**
 * The title's length if it is over {@link MAX_TITLE_LENGTH}, else `null`.
 *
 * Counts CODE POINTS rather than `String.length`, which counts UTF-16 units: an
 * emoji or a surrogate pair would otherwise cost two toward a limit a reader
 * counts as one, so the same visible title would pass or fail depending on
 * which alphabet it was written in. Trimmed first, because surrounding
 * whitespace is not part of the title the format stores.
 */
export function titleLengthOverCap(title: string): number | null {
  const length = [...title.trim()].length;
  return length > MAX_TITLE_LENGTH ? length : null;
}

/**
 * Refusal text for a file whose major version is newer than we support.
 *
 * Shared so the two text parsers and the JSON validator refuse in the same
 * words. Opening such a file would silently drop what we cannot represent,
 * which is why this is an error rather than a warning.
 */
export function newerVersionMessage(version: string): string {
  return (
    `"${version}" was written by a newer arch-lab than this one, which supports up to ` +
    `${SUPPORTED_MAJOR_VERSION}.x. Upgrade arch-lab to open this file — opening it here ` +
    "would silently drop data it cannot understand."
  );
}
