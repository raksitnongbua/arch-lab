/**
 * The naming convention that decides what a sequence diagram EXPORTS.
 *
 * A sequence export clones the live SVG (`../export/render-svg.ts` argues
 * why), so anything on screen is in the file unless something takes it out.
 * That "something" used to be a hand-listed set of three class names, and a
 * hand-listed set cannot notice a class it has never heard of: the first drag
 * handle, selection outline or insertion indicator would have serialised into
 * every SVG, every PNG and all twenty GIF frames with no check going red.
 * `codebase.md`, habit 4, names that failure mode; this constant is the
 * derived answer to it.
 *
 * THE RULE: a class that exists only for someone who can point at the screen
 * is spelled `af-seq-chrome-…`. The exporter strips BY THIS PREFIX, so new
 * chrome needs no edit there — and `check:sequence-export` reads the prefix
 * from here, walks the feature's own source for elements that are
 * interactive, and fails when one of them is not spelled this way. The check
 * is what makes the convention load-bearing rather than a hope.
 *
 * WHAT COUNTS AS CHROME. Not "invisible" and not "added for editing" — the
 * test is whether a reader holding a still image loses anything by its
 * absence. A hit region is chrome (it is an invisible control). The fold pill
 * is chrome (it offers a click a file cannot take). The `…` mark on a
 * truncated label is chrome (it is a footnote whose footnote is a click). A
 * fragment's guard chip is NOT chrome, even though hovering it does
 * something: the words carry meaning into the file.
 *
 * CSS CANNOT IMPORT THIS. `styles/sequence-motion.css` and the class literals
 * in `components/sequence-diagram.tsx` spell the prefix out by hand, which is
 * exactly the TypeScript/CSS pair `dry.md` requires a `check:*` script to pin
 * — `check:sequence-export` is that script.
 */

/**
 * Prefix shared by every class that exists only for on-screen interaction.
 * Matched as a SUBSTRING of `class` (an element carries several classes), so
 * the exporter's selector is `[class*="af-seq-chrome-"]`.
 */
export const SEQUENCE_CHROME_CLASS_PREFIX = "af-seq-chrome-";

/**
 * The selector that removes all of it. One prefix rule rather than a list of
 * names: the point of the convention is that adding chrome does not mean
 * remembering to add it here too.
 */
export const SEQUENCE_CHROME_SELECTOR = `[class*="${SEQUENCE_CHROME_CLASS_PREFIX}"]`;
