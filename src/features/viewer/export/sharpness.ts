/**
 * The PNG sharpness axis — ONE map for the whole product.
 *
 * "Sharp" has to mean the same thing wherever it is offered, or a reader who
 * learns the control on one diagram kind is misled by the next. Four exporters
 * each declared this map privately (the C4, sequence, flowchart and use-case
 * buttons, plus the shared `SvgExportButton`), and `svg-export-button.tsx`
 * named unifying them as the follow-up it was deliberately not attempting.
 * This is that unification, and nothing else: the numbers are unchanged.
 *
 * NOT THE GIF AXES, which share these three NAMES and deliberately not their
 * numbers — `C4_SHARPNESS` is a multiplier of 1/1.5/2 and `GIF_SHARPNESS` and
 * `FLOWCHART_GIF_SHARPNESS` are target pixel widths, because a GIF is sized
 * by construction rather than scaled up from the diagram's own pixels. Each
 * carries the argument in its own header. Do not "finish the job" by folding
 * those in here; they are different quantities that happen to be spelled with
 * the same three words.
 *
 * 1x is the diagram's own pixel size.
 */
export const PNG_SCALE_BY_SHARPNESS = {
  compact: 1,
  standard: 2,
  sharp: 3,
} as const;

/**
 * The three sharpness names. Every GIF axis uses the same keys, so a component
 * holding one state for both axes can type it with either — they are keyed
 * alike on purpose, and only the values differ.
 */
export type Sharpness = keyof typeof PNG_SCALE_BY_SHARPNESS;
