import type { C4Level } from "@/types";

export const APP_NAME = "arch-lab";

/* -------------------------------------------------------------------------- */
/* Feature flags                                                               */
/* -------------------------------------------------------------------------- */

/*
 * `EDITOR_ENABLED` WAS HERE and is deliberately gone rather than left at
 * `false`. It gated `/editor`, a second page whose job was "a canvas you can
 * move things on"; that route is now a forwarding alias for `/view`, whose own
 * C4 canvas is editable in place, so there is no separate editor for a flag to
 * ship or withhold. Its four consumers — the navbar entry, the site default
 * title, the landing page's closing CTA and the viewer's edit link — read
 * `CANVAS_EDIT_ENABLED` below instead, which is the honest subject: whether a
 * canvas in this app can be edited at all.
 *
 * A flag nothing reads is worse than no flag: it reads as a switch someone
 * could still throw.
 */

/**
 * Makes the C4 canvas on `/view` directly editable — select a node, drag it,
 * nudge it with the arrow keys, delete it — with every change written back
 * into the source pane as text.
 *
 * `false` for the current deploy. The canvas is read-only exactly as it was,
 * and no lock control renders. Flipping it to `true` is the whole switch:
 * every affordance reads from this flag rather than being commented out, so
 * neither state can ship half-built.
 *
 * C4 ONLY FOR A POSITION, and that is a property of the notations rather than a
 * gap here. The other five kinds SOLVE their geometry from the text —
 * `layoutEr` derives columns from the relationships, the dictionary is a table
 * — so a dragged node would be moved back by the next render, and there is
 * nowhere in those grammars to write the position down. The C4 grammar is the
 * one that carries per-node geometry (`(x,y wxh)`), so it is the one a canvas
 * can author positions for.
 *
 * A SEQUENCE DIAGRAM IS STILL NOT A COUNTER-EXAMPLE, and the distinction is
 * worth keeping straight because this flag's name invites the confusion: its
 * canvas does answer a drag, but a drag there is an ORDER change, not a
 * position — a dragged message takes a neighbour's slot in `items` and a
 * dragged lifeline takes a neighbour's slot in `participants`
 * (`sequence/lib/reorder.ts`). No coordinate is written, which is exactly why
 * `canvasEditability(doc, "move")` still refuses every sequence document while
 * `"revise"` allows it.
 *
 * Typed `boolean`, not the literal, for the reason above.
 */
export const CANVAS_EDIT_ENABLED: boolean = true;

/**
 * The site's one description, and it is a BUDGETED string: it is the meta
 * description, the Open Graph and Twitter description, and the `description`
 * of the home page's JSON-LD. A search result truncates around 155–160
 * characters and a link preview around 200, so anything past that is written
 * for nobody. Keep it under 160.
 *
 * It used to run 267 characters and open with "a local-first workspace for
 * architecture documentation" — a phrase nobody searches — then spend its
 * back half on the roadmap, which was cut off in every result it appeared in.
 * What survives leads with what the thing does and names the two features
 * people arrive for.
 */
/* NAMES EVERY DOCUMENT KIND, and that is the reason it is right up against the
   160-character budget the search snippet allows. This one string is the meta
   description on every route that does not set its own, the OG description, and
   the sentence an assistant asked "what is arch-lab" is most likely to quote —
   so a kind missing from here is a kind the product supports and nothing
   outside the app ever says it supports. "No account." was the phrase that gave
   way to make room; the pages that need it say it in their own copy. */
export const APP_DESCRIPTION =
  "Beautiful, zoomable C4, sequence, flowchart and use-case diagrams written as plain text, rendered live in your browser. An AI agent can author them over MCP.";

/* -------------------------------------------------------------------------- */
/* Theming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every theme the app knows about. Adding one takes three edits, and
 * `pnpm check:themes` fails on each of them being forgotten:
 *
 *   1. this list;
 *   2. a matching CSS block in `globals.css` redefining every concrete colour
 *      (see the EXTENSION POINT comment there) — a theme with no block is
 *      offered in the picker and silently renders as light;
 *   3. an entry in `THEME_META` in `layout/theme-toggle.tsx` — a
 *      `Record<Theme, …>`, so the compiler asks for it rather than the menu
 *      rendering a bare slug — and, for a DARK-FAMILY theme, its name in the
 *      `dark` variant and the `color-scheme` rule in `globals.css`.
 *
 * The provider and the picker both read this list, so nothing else changes.
 */
export const THEMES = [
  "light",
  "paper",
  "pastel",
  "glass",
  "dark",
  "midnight",
  "contrast",
] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The theme a first-time visitor gets. A product decision, not an OS preference
 * — see `enableSystem={false}` in `app/providers.tsx`.
 *
 * HIGH CONTRAST, not `dark`. `contrast` separates by OUTLINE rather than by
 * fill: its ground is `oklch(0.05 0 0)` and its cards sit 0.07 above that, so
 * what tells one node from another is a `--border` at L 0.72 rather than a
 * lighter surface. Defaulting to it means the first thing anyone sees is the
 * most legible arrangement the app can draw.
 *
 * THE TRADE, recorded because it is easy to reverse by accident: `dark` is the
 * theme whose palette is tuned — the dark-grey ground at #1c1e24, the role fills
 * lifted 0.03 with brightened borders, the wash measured against its own
 * top stop — and none of that is what a visitor now sees first. `contrast` is
 * deliberately starker than beautiful. If this moves back, move the picker's
 * "The default" hint in `theme-toggle.tsx` and the OG palette in
 * `marketing/og/card.tsx` with it: both are derived from whatever this says, by
 * hand, and `check:og-cards` only pins the lane colours.
 */
export const DEFAULT_THEME: Theme = "contrast";

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
