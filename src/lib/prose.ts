/**
 * The helpers that turn derived DATA into a sentence a reader can read, plus
 * the one control name three features' prose has to spell the same way.
 *
 * Both lived privately in `playground/input/canvas-edit.ts`, where the first
 * assembled passage needed them; the themes passage in `lib/theme-copy.ts`
 * needs the same two, with the same bodies, which is the duplication `dry.md`
 * names outright ("if two functions have the same body, they get one
 * definition"). They are here rather than in either caller because both callers
 * are copy the site is QUOTED BY, and two spellings of "nine" or of an Oxford
 * comma across two quoted passages read as two different products.
 *
 * NEITHER USES `Intl`. `Intl.NumberFormat` has no spelled-out mode at all, and
 * `Intl.ListFormat` varies with whatever ICU data a runtime happens to ship —
 * these strings are contracts (a meta description, a passage an assistant
 * quotes), so they must render identically on every Node version and in every
 * browser that renders the page.
 */

/**
 * Small counts as words, because prose reads them and a digit in a sentence
 * about notations or themes looks like a version number.
 *
 * Falls back to the numeral rather than `undefined` if the table is ever
 * outrun: a copy line reading "12 themes" is worse than "twelve themes" and far
 * better than "undefined themes".
 */
const NUMBER_WORD: readonly string[] = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export const inWords = (count: number): string =>
  NUMBER_WORD[count] ?? String(count);

/**
 * "C4 diagrams and sequence diagrams", or a comma list ending in the
 * conjunction once there are three.
 *
 * No serial comma, which is a choice and not an oversight: every list this
 * joins is a run of short names, and the site's prose does not use one
 * elsewhere.
 *
 * `conjunction` is "or" for the one family of callers that is not copy: the
 * three `.alab` header grammars name their closed keyword set in the refusal
 * that rejects a word outside it, and each of those sentences used to be a
 * hand-typed list sitting a screen below the switch that enforced it. Same
 * body, one definition, the difference a default — `dry.md` on `slugify`.
 */
export function joinList(
  items: readonly string[],
  conjunction: "and" | "or" = "and",
): string {
  return items.length <= 2
    ? items.join(` ${conjunction} `)
    : `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

/**
 * What the direction menu's release row is called, for `count` elements.
 *
 * HERE, NOT IN THE GESTURE MODULE, because three features say it and two of
 * them may not import the third: the playground's menu renders the row, the
 * announcement raised when a direction moved nothing points a screen-reader
 * user at that row by name (`directionInertWarning`), and the validator's
 * `column-layout` advice names it from `/validate` and the MCP
 * `validate_model`. A hand-typed copy in any of them
 * is the stale claim `canvas-editing.md` records three times over — prose that
 * was correct when it was typed, naming a control that has since been
 * reworded, with every check green.
 */
export function resetLayerLabel(count: number): string {
  return count === 1 ? "Let the layout place it" : "Let the layout place them";
}
