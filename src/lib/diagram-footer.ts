/**
 * The metrics of the strip under a diagram, in both of the states it has.
 *
 * WHY THIS IS SHARED. Two panes draw that strip — the C4 shell's footer and
 * the playground's, the second serving the other eight notations — and a
 * reader switches notation by TYPING, so the same pane re-renders as C4 or as
 * a gantt. Chrome that is 8px taller on one of them reads as moving between
 * two products rather than between two drawings. `check:canvas-chrome` has
 * pinned that agreement since the two drifted once already; it used to do it
 * by scraping the class strings out of both files and comparing tokens, which
 * is a check reimplementing what a shared constant states. The metrics live
 * here now and the check reads them, in the manner of `DIAGRAM_WELL_CLASSES`
 * and `lib/diagram-surface.ts`.
 *
 * SIZING ONLY, NEVER LAYOUT, and the split is deliberate rather than tidy.
 * The C4 footer stacks a title block above its controls on a phone; the
 * playground's has no title to stack and simply pushes its row right. Those
 * are correct differences, and a module that owned the whole class string
 * would have to forbid one of them. What both panes must agree on is how much
 * space the strip takes and how big the things in it are.
 *
 * WHAT IMMERSIVE IS FOR, since every value below has two of them. The control
 * that opens the mode is labelled "hide the site chrome" — so the strip that
 * survives is not the same strip at a tighter padding, it is the smallest
 * thing that still lets a reader say what they are looking at and get out.
 * Found from an embed: dropped into a Miro board as an iframe, the diagram
 * arrives inside somebody else's canvas at somebody else's scale, and chrome
 * sized for a full browser window is then the largest thing on screen. The
 * drawing is the product (`purpose.md`); the strip is how you leave.
 */

/**
 * The strip's width ceiling and side padding — the two metrics that decide
 * where the row's contents sit relative to the diagram above them.
 *
 * Unchanged by immersive mode on purpose. The row gets shorter there, never
 * narrower: a control that moved sideways on entering the mode would break the
 * line it makes with the zoom cluster and the minimap sitting above it.
 */
export const DIAGRAM_FOOTER_FRAME = "mx-auto w-full max-w-7xl px-5 sm:px-8";

/**
 * The strip's vertical padding.
 *
 * Immersive is two steps down rather than one. It was `py-2` when the only
 * thing the mode removed from the strip was the description, and the row still
 * had to carry Share, Export and a title set at reading size; with those gone
 * the padding is the last thing holding the height up.
 */
export function diagramFooterPad(immersive: boolean): string {
  return immersive ? "py-1.5" : "py-3";
}

/**
 * What a footer control wears on top of `buttonClasses({ size: "sm" })`.
 *
 * Handed to the button rather than replacing it: the variant stays `outline`
 * in both states and in both panes, because a borderless control in a row of
 * bordered ones reads as the weaker set — which is the drift
 * `check:canvas-chrome` caught the last time these two footers disagreed.
 *
 * Immersive takes the row from 32px to 28px and the label from 14px to 12px.
 * The icon comes down with it, or a 16px glyph in a 28px button is a control
 * that has been squeezed rather than sized.
 */
export function diagramFooterControl(immersive: boolean): string {
  return immersive
    ? "shrink-0 h-7 gap-1 px-2 text-xs [&_svg]:size-3.5"
    : "shrink-0";
}

/**
 * The theme dial's square, which is only ever rendered while immersive — the
 * site header carries that control in every other state.
 *
 * Its own base is `size-9`, taller than the `h-8` row it stands in, so this
 * override existed before the mode had anything else to say about size. It
 * tracks the buttons beside it: 28px, matching `diagramFooterControl`.
 */
export const DIAGRAM_FOOTER_DIAL = "size-7";

/**
 * The model's title in the strip.
 *
 * ONE PANE HAS ONE — the C4 shell — and it lives here anyway, because the
 * question it answers is this strip's height and that is the subject of this
 * module. A title set at `text-lg` is the tallest thing in the row, so
 * shrinking the controls around it and leaving it alone moves nothing.
 *
 * IT IS NOT REMOVED, and that is a decision rather than an oversight. A
 * diagram put on a screen in front of an audience still has to say what it is,
 * and once the site chrome is gone this line is all that names the model. The
 * canvas breadcrumb often repeats it — but only while a child diagram is open,
 * so it cannot be relied on to be there.
 */
export function diagramFooterTitle(immersive: boolean): string {
  return immersive
    ? "truncate text-sm font-medium tracking-tight text-muted-foreground"
    : "truncate text-lg font-semibold tracking-tight text-foreground";
}
