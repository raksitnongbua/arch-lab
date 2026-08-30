/**
 * What the themes are CALLED, and the one passage the site says about them.
 *
 * WHY A SECOND MODULE RATHER THAN MORE OF `constants.ts`: `THEMES` is the list
 * the provider, the picker and five `check:*` scripts iterate — data. This is
 * copy, and copy has a different failure mode (it goes stale silently and is
 * quoted while it does), so it is assembled from that data here rather than
 * typed on each surface. Same arrangement, and same argument, as
 * `CANVAS_EDITING_PASSAGE` in `playground/input/canvas-edit.ts`: one derivation,
 * four surfaces.
 *
 * IT IS SERVER-SAFE ON PURPOSE. The labels used to live only inside
 * `layout/theme-toggle.tsx`, which is a client component — so the landing page,
 * `/llms.txt`, `/llms-full.txt` and `/faq` could not name a theme without
 * either importing a client chunk or retyping the names, and retyping them is
 * how "eight themes" survives the day a ninth ships. Nothing here imports React.
 */

import { APP_NAME, THEMES, type Theme } from "@/lib/constants";
import { inWords, joinList } from "@/lib/prose";

/**
 * How each theme is NAMED to a reader — the picker's row, the passage below,
 * and anywhere else prose has to say which palettes exist.
 *
 * A total `Record<Theme, …>`, so adding a name to `THEMES` without naming it
 * here is a compile error rather than a menu row reading "midnight" and a
 * marketing sentence quietly listing eight of nine. The picker in
 * `layout/theme-toggle.tsx` reads these and adds its own hint and icon, which
 * are picker-only: a hint is a caption under a menu row, not a sentence.
 */
export const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  paper: "Paper",
  pastel: "Pastel",
  glass: "Liquid glass",
  dark: "Dark",
  midnight: "Midnight",
  contrast: "High contrast",
  blueprint: "Blueprint",
  eink: "E-ink",
};

/** The labels in `THEMES` order, which is light-to-dark and then the two
 *  special-purpose palettes — the order the picker lists them in. */
export const THEME_NAMES: readonly string[] = THEMES.map(
  (theme) => THEME_LABELS[theme],
);

/**
 * THE ONE PASSAGE THE SITE QUOTES ABOUT THEMES, served in these exact words by
 * the landing page, `/faq`, `/llms.txt` and `/llms-full.txt`.
 *
 * WHY IT EXISTS. `.claude/rules/purpose.md` says presentation is the product
 * and names the themes as the first place customisation is promised — and the
 * site said so nowhere a search engine or an assistant could read it. "theme"
 * appeared in no title, in no meta description, in neither `llms*.txt`, in no
 * `featureList` entry and in no home-page sentence; the only mention on the
 * whole crawled surface was half a clause inside one FAQ answer. A reader
 * asking a model "does arch-lab have a dark mode" got the same answer as one
 * asking about a tool that has none.
 *
 * EVERY COUNT AND EVERY NAME IS DERIVED, for the reason `codebase.md` habit 4
 * gives: a hand-written "eight themes" is correct until the day it is not, and
 * the day it is not is the day a picker row exists that no copy admits to. The
 * numeral is spelled because this is prose (`lib/prose.ts`).
 *
 * WHAT IT CLAIMS AND WHY EACH CLAUSE IS SAFE TO QUOTE:
 *  - "repaints the diagram, not just the page around it" — the export path
 *    resolves every colour from the live theme tokens
 *    (`viewer/export/theme.ts`), so an SVG or PNG really does leave with the
 *    theme on it. That is the half a reader assumes is missing.
 *  - "contrast-measured" — `pnpm check:themes` fails on a palette that is not,
 *    which is what makes this a fact rather than a boast.
 *  - the E-ink clause — `check:eink` requires that theme to separate roles by
 *    texture, since it has no hue to separate them with. It is named because it
 *    is the one palette whose POINT is not obvious from its name.
 *
 * It deliberately does NOT say which theme is the default: that follows
 * `prefers-color-scheme` (`lib/theme-default.ts`), so any sentence naming one
 * palette would be wrong for half the readers who quote it.
 */
export const THEMES_PASSAGE: string = `${APP_NAME} ships ${inWords(
  THEMES.length,
)} themes — ${joinList(
  THEME_NAMES,
)}. A theme repaints the diagram, not just the page around it: node fills, connector ink, the canvas ground, and the SVG or PNG you export all follow the one you picked. Every palette is contrast-measured rather than a recolour, and ${
  THEME_LABELS.eink
} has no colour at all — it tells the roles apart by texture, so a diagram still reads printed or projected in greyscale. The picker sits in the header on every page, your choice is kept in your browser, and a first visit follows your system's light or dark preference.`;
