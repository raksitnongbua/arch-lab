/**
 * The row style both export menus use.
 *
 * SHARED because the two drifted and it was noticed from outside: the C4 menu
 * offered one row per outcome, each naming what it produces, while the
 * sequence panel asked for a format in a `<select>` and then offered a generic
 * "Download" — the same feature presenting itself as two different products
 * depending on which diagram was open.
 *
 * A row per outcome is the better shape and is why this is the surviving one:
 * a menu should say what you GET, not make you assemble it. The class lives
 * here so the next menu inherits that rather than re-deciding it.
 */
export const MENU_ITEM_CLASSES =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** The second line of a row: what the choice produces. */
export const MENU_ITEM_HINT_CLASSES = "block text-xs text-muted-foreground";
