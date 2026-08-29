import type { C4Level } from "@/types";

export const APP_NAME = "arch-lab";

/* -------------------------------------------------------------------------- */
/* Feature flags                                                               */
/* -------------------------------------------------------------------------- */

/*
 * `EDITOR_ENABLED` WAS HERE and is deliberately gone rather than left at
 * `false`. It gated `/editor`, a second page whose job was "a canvas you can
 * move things on"; that route is now a forwarding alias for `/live`, whose own
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
 * Makes the C4 canvas on `/live` directly editable — select a node, drag it,
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
/* WHAT THIS 160 BUYS, and what it stopped buying, because the previous version
   spent 157 of them NAMING EVERY DOCUMENT KIND and had run out of room to be
   true. It read "C4, sequence, flowchart and use-case diagrams" — four of the
   six then shipping, since ER and the data dictionary landed after it was
   written — and there were three characters left to fix that with, let alone to
   say that a diagram here is now edited two ways.

   SO THE ENUMERATION WENT AND THE COUNT STAYED, and the two additions since
   are the proof it was the right trade: the seventh notation cost this string
   ONE character, the eighth cost it NONE and the ninth cost it NONE either,
   where the enumeration would have wanted twelve, then nineteen, then eleven
   more it did not have. "nine notations" is one word where nine names are a
   hundred characters, and it is the half a reader can act on:
   the names are in the notation cards on the home page, in the JSON-LD
   `featureList` derived from those cards, in `/live`'s own description and in
   `/llms.txt` — four places with room, none of which is truncated at 160. (The
   `<title>` is NOT one of them any more; it gave its own enumeration up for the
   same reason and for the same 60-character budget — see `app/layout.tsx`.)
   What no other budgeted surface said
   at all was that the canvas is editable, which is why that clause got the
   space the list gave up.

   `check:seo` PINS THE COUNT to `CANVAS_EDIT_OFFERS`, the total grid over the
   document kinds, so a ninth notation fails this string rather than quietly
   making it wrong — the exact failure the enumeration suffered, and the exact
   way the seventh and the eighth were both caught.

   This one string is the meta description on every route that does not set its
   own, the OG and Twitter description, the home page's JSON-LD `description`,
   and the sentence an assistant asked "what is arch-lab" is most likely to
   quote. */
export const APP_DESCRIPTION =
  "Beautiful architecture diagrams in nine notations, written as plain text or edited on the canvas, live in your browser. An AI agent can author them over MCP.";

/* -------------------------------------------------------------------------- */
/* Theming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every theme the app knows about. Adding one takes four edits, and
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
 *   4. an entry in `TAG_FILL_BY_THEME` in `editor/lib/free-color.ts` — also a
 *      `Record<Theme, …>`, so again the compiler asks. It is NOT a copy of the
 *      block's `--tag-fill-l` / `--tag-fill-c` for convenience: the free colour
 *      picker solves for a stroke that clears 3:1 against the constructed fill
 *      in EVERY theme AT ONCE, so each entry NARROWS the interval every other
 *      theme has to share. `blueprint` was written with its own role-fill band
 *      (0.34) here and closed that interval for the greens — `presentableTagColor`
 *      began refusing `#00ff88` outright, which is the picker telling an author
 *      their colour cannot be shown. `check:canvas-edit` sweeps the whole output
 *      space and is what catches it; the fix is to pick a pin an existing theme
 *      already holds rather than a new one.
 *
 * AND ONE EDIT NO COMPILER AND NO THEME CHECK MAKES, for a DARK-FAMILY theme:
 * `scripts/dot-grid-check.mjs` asserts the dark family against a HAND-TYPED
 * sorted list. It is the only place the family is spelled out by name rather
 * than derived from the palette. It fails loudly, which is what makes it
 * tolerable — but it will not remind you before you run it.
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
  "blueprint",
] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The theme a first-time visitor gets WHEN THEIR SYSTEM PREFERS DARK, and the
 * fallback whenever the preference cannot be read at all — see
 * `DEFAULT_THEME_BY_SCHEME` below and `lib/theme-default.ts` for how it is
 * resolved before first paint.
 *
 * IT USED TO BE THE ONLY DEFAULT, unconditionally, and the argument for that is
 * recorded here because it was a real one: the default is a decision about what
 * a diagram should be read on, not a reflection of what the OS happens to be
 * set to. What it got wrong is the reader it was written for — someone who has
 * told their machine they want light surfaces, and arrived at a near-black page
 * with no way to know a picker existed. A default is a first guess, and the
 * best available guess about a reader is the one they have already made.
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
 * deliberately starker than beautiful. If this moves back, move the OG palette
 * in `marketing/og/card.tsx` with it: it is derived from whatever this says, by
 * hand, and `check:og-cards` only pins the lane colours.
 *
 * THE PICKER NAMES THE DEFAULT AS A STATE, not as a palette. Its `contrast` row
 * used to read "The default", which stopped being true for half of all readers
 * the moment the default started following `prefers-color-scheme`. The word
 * moved to the `System` row, which is the state a first-time reader is actually
 * in and can say what it currently resolves to — see `lib/theme-default.ts`. */
export const DEFAULT_THEME: Theme = "contrast";

/**
 * The default a first-time visitor gets, per `prefers-color-scheme`.
 *
 * TWO NAMED THEMES, not a light/dark pair invented for the occasion: both
 * values are members of `THEMES`, so the reader's stored preference is always a
 * theme the picker can show a tick beside, and every argument the palettes
 * carry (`DEFAULT_THEME` above for the dark side) applies unchanged.
 *
 * WHY NOT next-themes' OWN `enableSystem`. It resolves the system preference to
 * the literal names "light" and "dark" and then maps THAT through its `value`
 * option — so asking it for high contrast under a dark system would also
 * repaint the `dark` theme, which is a palette a reader can explicitly choose
 * and a preference some already have stored. The mapping has to happen before
 * next-themes sees a name, which is what `lib/theme-default.ts` does.
 */
export const DEFAULT_THEME_BY_SCHEME: Record<"light" | "dark", Theme> = {
  light: "light",
  dark: DEFAULT_THEME,
};

/** localStorage key next-themes persists the choice under. */
export const THEME_STORAGE_KEY = "arch-lab-theme";

/**
 * localStorage key for "let my system decide", the picker's `System` row.
 *
 * A SECOND KEY RATHER THAN A SEVENTH THEME NAME. next-themes owns
 * `THEME_STORAGE_KEY` and stamps whatever it finds there onto <html> as a class,
 * so a value of `"system"` would need a `.system` palette in `globals.css` —
 * the light tokens normally and the contrast tokens under a media query, which
 * is a second copy of a palette this repo already has (`dry.md`). Keeping the
 * follow flag beside the theme instead means the class on <html> is always a
 * real palette, `THEMES` stays a list of palettes, and every `check:themes`
 * assertion that iterates it keeps its meaning.
 *
 * `"1"` means follow; absent means the reader pinned a theme. Both states are
 * written explicitly — see `lib/theme-default.ts`, which sets the flag on the
 * first visit so that "no flag" can only ever mean a deliberate choice.
 */
export const THEME_FOLLOW_STORAGE_KEY = "arch-lab-theme-follow";

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
