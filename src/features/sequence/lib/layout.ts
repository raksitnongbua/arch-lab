/**
 * Sequence-diagram layout — the ONE place geometry is derived from a
 * `SequenceLabFile`. The renderer, the viewer and the layout check script
 * (`scripts/sequence-layout-check.mjs`) all read this result; none of
 * them ever computes a coordinate of its own. Same single-source-of-truth
 * discipline as `editor/lib/frame-layout.ts`, and for the same reason: two
 * geometry computations WILL disagree, and the disagreement only shows up as
 * a box that almost contains its contents.
 *
 * Pure and framework-free on purpose (no DOM, no React, no CSS): the check
 * script loads this file through Node's type stripping, so importing anything
 * browser-shaped here would break the proof that the layout is testable.
 *
 * Text is measured with the same conservative character-width estimate the
 * SVG exporter uses (`viewer/export/render-svg.ts`): SVG has no synchronous
 * text measurement outside a live DOM, and a DOM measurement here would make
 * layout untestable in Node and non-deterministic across font fallbacks.
 * The estimate over-reserves slightly, which costs a little horizontal air
 * and buys byte-stable geometry everywhere.
 *
 * Step model produced alongside the geometry:
 *   - Every MESSAGE is one step, numbered 1..stepCount in document order —
 *     messages are the events of a sequence diagram; notes and fragment
 *     frames are commentary and scaffolding around them. The viewer uses
 *     steps for focus order and the detail panel's "Step N of M" readout.
 *   - Every other element carries a `revealStep`: the first step of the
 *     story it belongs to. A note attaches to the message that precedes it
 *     (0 = before the first message); a fragment frame and each of its
 *     branch dividers attach to the first message inside them. The viewer
 *     renders everything at once and does not read these fields; the check
 *     script still asserts them, because they pin down "which part of the
 *     story does this element belong to" as a pure function of the model —
 *     a property any future consumer (export, tour, playback) inherits
 *     for free.
 */

import type {
  SequenceFragment,
  SequenceItem,
  SequenceLabFile,
  SequenceMessage,
  SequenceHeadStyle,
  SequenceLineStyle,
  SequenceNote,
  SequenceNotePlacement,
  SequenceParticipantKind,
} from "@/types";
import { CHAR_WIDTH_RATIO, wrapText } from "@/lib/text-metrics";
import { isSelfMessage } from "@/types/sequence";

/* -------------------------------------------------------------------------- */
/* Constants — exported so the check script asserts against the same numbers   */
/* -------------------------------------------------------------------------- */

export const SEQ = {
  /**
   * Kept as a `SEQ` field because `scripts/sequence-layout-check.mjs` asserts
   * against it, but the VALUE now comes from `@/lib/text-metrics` — the same
   * estimate the C4 exporter uses, which this comment used to only claim.
   */
  charWidthRatio: CHAR_WIDTH_RATIO,

  marginX: 28,
  marginTop: 20,
  marginBottom: 28,

  headerHeight: 52,
  headerMinWidth: 112,
  headerPadX: 16,
  /**
   * Extra header height above the name when any participant is an actor — the
   * band the AVATAR DISC occupies (renderer: ParticipantColumn). Sized to the
   * disc's diameter plus a hair of clearance so the disc never touches the card
   * below it; a floating stick figure needed less, but read as a pin rather
   * than a person. Applied to EVERY column's header so all the cards keep one
   * baseline — only the actor draws in the band.
   */
  actorGlyphHeight: 26,

  nameFontSize: 13,
  metaFontSize: 11,
  labelFontSize: 12,
  noteFontSize: 12,
  fragmentFontSize: 11,

  /* ---- the heading block: the document's title and description ------------
   * Drawn INSIDE the drawing rather than in the page around it, which is the
   * whole point: the export clones this SVG, so a title that lived in HTML
   * chrome would be missing from every `.svg`, `.png` and `.gif` anyone sends
   * on — and a sequence diagram with no title on it is a picture of a flow
   * nobody can name. The C4 exporter has stamped its heading into the file
   * since it shipped; this is the sequence half of that. */
  titleFontSize: 15,
  titleLineHeight: 20,
  descriptionFontSize: 12,
  descriptionLineHeight: 17,
  /** Gap between the last title line and the first description line. */
  titleDescriptionGap: 6,
  /** Gap from the bottom of the block down to the participant cards. */
  headingGap: 16,
  /**
   * Narrowest width the heading wraps to.
   *
   * The block wraps to the COLUMN SPAN first, so on any normal flow it costs the
   * canvas no width at all — the same choice notes make, and for the same
   * reason: a long title that widened the drawing would leave a
   * two-participant flow floating in whitespace. But the span of two narrow
   * columns is ~200px, which would turn a normal title into six lines, so the
   * wrap never goes below this — and where this floor is wider than the flow,
   * the canvas widens to match rather than letting the text cross the edge.
   */
  titleMinWrapWidth: 320,
  /**
   * Description lines kept before the text is ellipsised.
   *
   * A title is capped by advisory (`MAX_TITLE_LENGTH`) and wraps in full; a
   * description is prose with no limit at all, and an unbounded one would push
   * the flow off the first screen — the diagram is the content, not the blurb.
   * The full text is never lost: it stays in the source pane, the `.alab` file
   * and the MCP summary.
   */
  descriptionMaxLines: 3,

  /* ---- the participant icon -----------------------------------------------
   * Drawn INSIDE the card, left of the name, the way a C4 node wears its own
   * — one visual vocabulary across the two document kinds, since a
   * participant and a container are usually the same system drawn twice.
   *
   * It is 16px square with a 6px gutter, and both numbers are REAL LAYOUT:
   * the card's width is derived from its text, so an icon that drew without
   * being measured would either overlap the name or push it past the card's
   * edge. `planColumns` adds `iconSize + iconGap` to the name's measured
   * width for exactly the participants that carry one. */
  iconSize: 16,
  iconGap: 6,

  /* ---- participant boxes (`SequenceBox`) ----------------------------------
   * The bracket is drawn AROUND the header cards, not above them, so it reads
   * as "these lifelines are one thing" rather than as a second, unrelated
   * label row. Its band pushes `headerTop` down by exactly `boxLabelHeight`,
   * and only when the document has boxes — a diagram with none is not made
   * taller by a feature it does not use. */
  boxLabelHeight: 20,
  boxLabelFontSize: 11,
  boxPadX: 10,
  boxPadBottom: 8,

  /** Vertical gap between the header row and the first item. */
  headerGap: 24,
  /**
   * Gap between the foot of the lifelines and the FOOTER card row — the
   * participant names repeated at the bottom, so a long flow stays readable
   * without scrolling back up to learn which column is which. The footer is
   * a plain card (no actor glyph: the silhouette is an identity cue, and
   * repeating it would claim the actor is a second participant), so its
   * height is the base `headerHeight` and never the actor-taller one.
   */
  footerGap: 12,

  rowMessage: 44,
  rowSelf: 64,

  /**
   * The message CLICK TARGET's bands, as distances from the arrow's y. Here
   * rather than in the renderer because they are coupled to `rowMessage`, not
   * free: a row's line band and the NEXT row's label band must never meet, or
   * the lower target steals clicks meant for the upper one's label — and only
   * these three numbers plus the row height decide that. `check:sequence-
   * layout` asserts the gutter, so widening one of these fails loudly instead
   * of silently swallowing a neighbour's clicks.
   */
  hitLineBand: 13,
  hitLabelTop: 26,
  hitLabelBottom: 3,
  selfLoopWidth: 44,
  selfLoopHeight: 26,

  /** MINIMUM note box height — a wrapped note grows past it, see wrapText. */
  noteHeight: 36,
  noteGap: 10,
  notePadX: 12,
  /** Vertical padding and per-line advance for WRAPPED note text. */
  notePadY: 10,
  noteLineHeight: 15,
  noteMaxWidth: 320,
  noteOffset: 16,

  /** Label band at the top of a fragment box (the `alt`/`loop` chip row). */
  fragmentLabelBand: 26,
  fragmentBottomPad: 14,
  fragmentDividerHeight: 26,
  /**
   * Horizontal padding of a fragment box grows with the deepest nest INSIDE
   * it (`base + innerDepth * step`), so a parent spanning the same lifelines
   * as its child is strictly wider — without this, a 3-deep nest over two
   * participants collapses into three borders on the same pixels, exactly
   * the failure `frame-layout.ts` documents for C4 frames.
   */
  fragmentPadBase: 16,
  fragmentPadStep: 12,

  /** Activation bars: width, and the x-stagger of a nested (stacked) bar. */
  barWidth: 10,
  barStagger: 5,

  /** Floor and ceiling for the gap between adjacent lifelines. The ceiling
   * stops one epic label from stretching the whole diagram; the renderer
   * lets long labels sit over their neighbours instead. */
  minColumnGap: 150,
  maxColumnGap: 460,
} as const;

function estimateWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * SEQ.charWidthRatio);
}

/**
 * The renderer needs a handful of text extents the layout does not store
 * (fragment guard-label hit boxes). Exporting the ESTIMATOR — not letting the
 * renderer invent one — keeps the character-width ratio a single fact: if the
 * estimate ever changes, hit boxes and reserved gaps move together.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return estimateWidth(text, fontSize);
}

/* -------------------------------------------------------------------------- */
/* Result shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface LaidParticipant {
  id: string;
  name: string;
  kind: SequenceParticipantKind;
  /** Icon slug from the shared registry; the renderer resolves it. */
  icon?: string;
  technology?: string;
  description?: string;
  /** Lifeline x — the centre of the header box. */
  x: number;
  headerWidth: number;
  /**
   * Colour lane, 1-based — the N of the `--seq-lane-N` token the renderer
   * paints this participant's chrome with (globals.css owns the values and
   * their validation notes; the two files change together). Assigned from
   * the participant's index in `file.participants` — DOCUMENT order, which
   * is also lifeline order — so colour follows the entity, not its rank:
   * re-parsing the same document gives the same participant the same lane.
   * Past five lanes the assignment CYCLES; two lanes sharing a hue is
   * acceptable only because a participant's name always renders in its
   * header (identity is never colour-alone), and the alternative — minting
   * a sixth hue — would ship a colour pair nobody can tell apart, which is
   * worse than an honest repeat.
   */
  lane: number;
}

/** How many `--seq-lane-N` tokens globals.css defines — change together. */
const LANE_COUNT = 5;

export interface LaidMessage {
  /** 1-based step number, in document order. */
  step: number;
  from: string;
  to: string;
  lineStyle: SequenceLineStyle;
  headStyle: SequenceHeadStyle;
  label: string;
  technology?: string;
  /**
   * The focus-only detail (`desc` in the source). Carried through layout but
   * NEVER measured: it is deliberately absent from `labelWidth`, because the
   * whole point of moving text off the wire is that it stops widening
   * columns. The renderer marks a message that has one; the viewer's dock
   * shows it.
   */
  description?: string;
  self: boolean;
  /** Arrow y (for a self-message, the y of the loop's TOP segment). */
  y: number;
  /** Endpoint x — already offset to the edge of any open activation bar. */
  fromX: number;
  toX: number;
  /**
   * Reserved width of the label (technology suffix included, padding
   * included) — the same estimate column planning used, exported per message
   * so the renderer's label HIT BOX and the reserved gap can never disagree.
   */
  labelWidth: number;
}

export interface LaidNote {
  placement: SequenceNotePlacement;
  participants: readonly string[];
  text: string;
  /**
   * The text WRAPPED to the box, one entry per rendered line. The renderer
   * draws these, never `text` — see `wrapText` for what an unwrapped note did
   * to the canvas. `text` stays for accessible names and anything that wants
   * the note as one string.
   */
  lines: readonly string[];
  x: number;
  y: number;
  width: number;
  height: number;
  revealStep: number;
}

export interface LaidDivider {
  y: number;
  label?: string;
  revealStep: number;
}

/**
 * One branch of a fragment, with the message steps its subtree contains —
 * RECURSIVELY, nested fragments included. `branches[i]` pairs with the
 * fragment's `dividers[i - 1]` for i ≥ 1 (branch 0 has no divider; its guard
 * label is drawn beside the kind chip) — the renderer relies on that pairing
 * to wire each guard label to its branch.
 */
export interface LaidBranch {
  /** The guard label (`alt "card accepted"` → `card accepted`), if any. */
  label?: string;
  /** Every message step inside this branch, ascending. */
  steps: number[];
}

/**
 * A `SequenceBox` placed: the bracket around a contiguous run of header
 * cards. Geometry only — membership was already settled by the model, and a
 * box whose members are all hidden never reaches here (see `collapse.ts`).
 */
export interface LaidBox {
  label: string;
  /** Normalised `#rrggbb`, when the document gave one. */
  tint?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidFragment {
  /**
   * Stable identity: `frag-N` where N is the fragment's pre-order position
   * in the document (== its index in `fragments[]`, which is built
   * outermost-first). Stable because it is a pure function of the model's
   * structure — the viewer validates a focused id at read time anyway, so a
   * re-parse that reshapes the document simply drops the focus, same as a
   * removed message does.
   */
  id: string;
  kind: SequenceFragment["kind"];
  /** First branch's guard label — drawn beside the kind chip. */
  label?: string;
  /** `rect` only: the highlight colour, normalised `#rrggbb`. */
  tint?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 = top level; +1 per enclosing fragment (paint order, like frames). */
  depth: number;
  revealStep: number;
  dividers: LaidDivider[];
  /**
   * Every message step inside the fragment — all branches, RECURSIVELY
   * through nested fragments — ascending. Computed here, in layout, because
   * "which steps belong to this fragment" is model structure, not
   * presentation: the viewer's focus-a-whole-flow feature and the check
   * script must read the same answer.
   */
  steps: number[];
  /** Per-branch step sets, in branch order. See LaidBranch. */
  branches: LaidBranch[];
}

export interface LaidActivation {
  participantId: string;
  x: number;
  width: number;
  y0: number;
  y1: number;
  /** 0 = first bar on the lifeline, +1 per stacked re-entrant bar. */
  level: number;
  revealStep: number;
}

export interface SequenceLayout {
  width: number;
  height: number;
  /**
   * Leftmost content x, which can be NEGATIVE (a `note left` of the first
   * participant, an outer fragment's pad). The renderer starts its viewBox
   * here instead of the layout shifting every coordinate right — shifting
   * would make "the lifeline of participant i" depend on unrelated notes,
   * which is exactly the cross-talk a one-pass layout is meant to avoid.
   */
  minX: number;
  /**
   * The document's title and description, wrapped and measured, drawn above the
   * participant row. `height` includes the gap down to the cards, so
   * `headerTop = SEQ.marginTop + heading.height` and nothing else has to know
   * how the block is composed.
   */
  heading: {
    titleLines: readonly string[];
    descriptionLines: readonly string[];
    height: number;
    /** Widest wrapped line, so the canvas can never be narrower than the text. */
    width: number;
  };
  /**
   * Y of the participant card row. Was `SEQ.marginTop` everywhere until the
   * heading block went in above it; the renderer reads this instead so the two
   * cannot disagree about where the cards start.
   */
  headerTop: number;
  headerHeight: number;
  lifelineTop: number;
  lifelineBottom: number;
  /**
   * Top of the FOOTER card row (the repeated participant names). Lifelines
   * run from `lifelineTop` down to here, so they visibly join the footer
   * instead of stopping short of it. Kept SEPARATE from `lifelineBottom`,
   * which stays the frontier open activation bars close against — a bar must
   * end at the foot of the flow, not run down through the gap into the card.
   */
  footerTop: number;
  /** Height of a footer card — the base header height, glyph excluded. */
  footerHeight: number;
  participants: LaidParticipant[];
  /** Brackets over runs of header cards. Empty when the document has none. */
  boxes: LaidBox[];
  messages: LaidMessage[];
  notes: LaidNote[];
  fragments: LaidFragment[];
  activations: LaidActivation[];
  stepCount: number;
  /**
   * Arrow y of each step, indexed `step - 1`. The renderer clamps growing
   * elements (activation bars) to the frontier of the current step with this,
   * instead of re-deriving any y of its own.
   */
  yByStep: number[];
}

/* -------------------------------------------------------------------------- */
/* Pass A — columns                                                            */
/* -------------------------------------------------------------------------- */

interface ColumnPlan {
  xById: Map<string, number>;
  order: string[];
  headerWidths: Map<string, number>;
}

/** Widest label a message carries, for gap sizing. */
function messageLabelWidth(message: SequenceMessage): number {
  const tech =
    message.technology === undefined ? "" : ` [${message.technology}]`;
  return estimateWidth(message.label + tech, SEQ.labelFontSize) + 24;
}

/*
 * `wrapText` now lives in `@/lib/text-metrics` (its history — the note box
 * that used to lie about its text — moved with it): the flowchart layout
 * needed the identical algorithm, and two copies of one wrap is exactly the
 * drift dry.md forbids. Re-exported so this module's public surface (which
 * the check script and the renderer read) is unchanged.
 */
export { wrapText };

/**
 * The note's wrapped text and the box that holds it. `contentWidth` is the
 * room the caller can offer — an over-note spanning distant lifelines is
 * wider than `noteMaxWidth`, and wrapping to the cap there would leave a wide
 * box with a narrow column of text down its middle.
 */
function layoutNoteText(
  text: string,
  contentWidth: number = SEQ.noteMaxWidth - SEQ.notePadX * 2,
): { lines: string[]; width: number; height: number } {
  const lines = wrapText(text, contentWidth, SEQ.noteFontSize);
  const widest = lines.reduce(
    (max, line) => Math.max(max, estimateWidth(line, SEQ.noteFontSize)),
    0,
  );
  return {
    lines,
    width: Math.min(widest + SEQ.notePadX * 2, contentWidth + SEQ.notePadX * 2),
    height: Math.max(
      SEQ.noteHeight,
      lines.length * SEQ.noteLineHeight + SEQ.notePadY * 2,
    ),
  };
}

function noteWidth(note: SequenceNote): number {
  return layoutNoteText(note.text).width;
}

/**
 * The title/description block above the participant row.
 *
 * Wraps to the COLUMN SPAN (floored at `titleMinWrapWidth`) instead of letting
 * the text set the width. Wrapping is what keeps a long title inside the drawing
 * rather than running off the edge — the defect notes had before they wrapped —
 * while wrapping to the FLOW's own width is what stops a three-word diagram with
 * a long title from becoming a mostly-empty wide canvas. The measured `width` it
 * returns is the backstop for the one case wrapping cannot solve: a flow
 * narrower than the wrap floor, where the caller widens the canvas instead.
 *
 * Runs off the column plan, before rows are laid out, so the block's height is
 * known in time to push everything below it down. It therefore cannot depend on
 * anything the row pass discovers, which is also why it does not try to centre
 * itself on the final drawing width.
 */
function layoutHeading(
  file: SequenceLabFile,
  order: readonly string[],
  xById: ReadonlyMap<string, number>,
  headerWidths: ReadonlyMap<string, number>,
): SequenceLayout["heading"] {
  const first = order[0];
  const last = order[order.length - 1];
  const left = first === undefined ? SEQ.marginX : (xById.get(first) ?? 0);
  const right =
    last === undefined
      ? SEQ.marginX
      : (xById.get(last) ?? 0) + (headerWidths.get(last) ?? 0) / 2;
  const wrapWidth = Math.max(SEQ.titleMinWrapWidth, right - left);

  const titleLines = wrapText(
    file.metadata.title,
    wrapWidth,
    SEQ.titleFontSize,
  );

  const description = file.metadata.description;
  let descriptionLines: string[] = [];
  if (description !== undefined && description.trim() !== "") {
    const all = wrapText(description, wrapWidth, SEQ.descriptionFontSize);
    descriptionLines = all.slice(0, SEQ.descriptionMaxLines);
    if (all.length > descriptionLines.length) {
      // Ellipsis on the last kept line, so a clipped description LOOKS clipped
      // rather than reading as a sentence that simply ends oddly.
      const lastIndex = descriptionLines.length - 1;
      descriptionLines[lastIndex] = `${descriptionLines[lastIndex]}…`;
    }
  }

  const height =
    titleLines.length * SEQ.titleLineHeight +
    (descriptionLines.length === 0
      ? 0
      : SEQ.titleDescriptionGap +
        descriptionLines.length * SEQ.descriptionLineHeight) +
    SEQ.headingGap;

  /*
   * The widest line, MEASURED, so the caller can widen the canvas if the block
   * still does not fit. Wrapping alone is not enough: the wrap floor is 320px
   * and a two-participant flow is ~318px wide, so a long title wrapped to the
   * floor would have run straight off the right edge — the exact defect notes
   * had before they wrapped, reintroduced one level up.
   */
  const width = Math.max(
    0,
    ...titleLines.map((line) => estimateWidth(line, SEQ.titleFontSize)),
    ...descriptionLines.map((line) =>
      estimateWidth(line, SEQ.descriptionFontSize),
    ),
  );

  return { titleLines, descriptionLines, height, width };
}

/**
 * Lifeline x positions. Gaps are derived from content, not fixed: a gap
 * between neighbours must clear (a) both header halves, (b) the widest label
 * of any message travelling directly between them, (c) a self-message loop
 * plus its label hanging into the gap, and (d) a side note hanging off
 * either lifeline. A flat column width was rejected because real labels
 * ("charge.succeeded [webhook]") either collide or force truncating text the
 * author explicitly wrote.
 */
function planColumns(file: SequenceLabFile): ColumnPlan {
  const order = file.participants.map((p) => p.id);
  const indexById = new Map(order.map((id, index) => [id, index]));

  const headerWidths = new Map<string, number>();
  for (const p of file.participants) {
    /* The icon shares the name's row, so its box and gutter widen THAT line
       and not the technology line below it — measuring the wider of the two
       rows is what the card's width has always been. */
    const nameW =
      estimateWidth(p.name, SEQ.nameFontSize) +
      (p.icon === undefined ? 0 : SEQ.iconSize + SEQ.iconGap);
    const techW =
      p.technology === undefined
        ? 0
        : estimateWidth(`[${p.technology}]`, SEQ.metaFontSize);
    headerWidths.set(
      p.id,
      Math.max(SEQ.headerMinWidth, Math.max(nameW, techW) + SEQ.headerPadX * 2),
    );
  }

  // gaps[i] = required distance between lifeline i and i+1.
  const gaps: number[] = [];
  for (let i = 0; i < order.length - 1; i += 1) {
    const left = headerWidths.get(order[i]) ?? SEQ.headerMinWidth;
    const right = headerWidths.get(order[i + 1]) ?? SEQ.headerMinWidth;
    gaps.push(Math.max(SEQ.minColumnGap, left / 2 + right / 2 + 20));
  }

  const widen = (index: number, needed: number) => {
    if (index < 0 || index >= gaps.length) return;
    gaps[index] = Math.min(SEQ.maxColumnGap, Math.max(gaps[index], needed));
  };

  const visit = (items: readonly SequenceItem[]) => {
    for (const item of items) {
      if (item.step === "message") {
        const a = indexById.get(item.from);
        const b = indexById.get(item.to);
        if (a === undefined || b === undefined) continue;
        if (item.from === item.to) {
          // The loop and its label hang into the gap to the RIGHT.
          widen(a, SEQ.selfLoopWidth + messageLabelWidth(item) + 12);
        } else if (Math.abs(a - b) === 1) {
          widen(Math.min(a, b), messageLabelWidth(item));
        }
        // Multi-span labels get the sum of the crossed gaps for free, which
        // is nearly always enough — widening every crossed gap for them
        // punishes unrelated columns.
      } else if (item.step === "note") {
        const w = noteWidth(item);
        const first = indexById.get(item.participants[0] ?? "");
        if (first === undefined) continue;
        if (item.placement === "right") widen(first, w + SEQ.noteOffset + 12);
        if (item.placement === "left")
          widen(first - 1, w + SEQ.noteOffset + 12);
      } else {
        for (const branch of item.branches) visit(branch.items);
      }
    }
  };
  visit(file.items);

  const xById = new Map<string, number>();
  let x = SEQ.marginX;
  for (let i = 0; i < order.length; i += 1) {
    const half = (headerWidths.get(order[i]) ?? SEQ.headerMinWidth) / 2;
    if (i === 0) x += half;
    xById.set(order[i], x);
    if (i < gaps.length) x += gaps[i];
  }

  return { xById, order, headerWidths };
}

/* -------------------------------------------------------------------------- */
/* Participant boxes                                                           */
/* -------------------------------------------------------------------------- */

function hasBoxes(file: SequenceLabFile): boolean {
  return Array.isArray(file.boxes) && file.boxes.length > 0;
}

/**
 * One bracket per box, spanning its members' header cards.
 *
 * Reads the members' PLACED x positions rather than their index, so a box
 * needs no knowledge of column planning — and a member that is not on the
 * canvas (hidden by a collapse) simply contributes nothing to the span. A box
 * with no members left is dropped: `collapse.ts` already removes those from
 * the filtered file, and this second guard costs one comparison and makes the
 * function total for any input.
 */
function placeBoxes(
  file: SequenceLabFile,
  xById: Map<string, number>,
  headerWidths: Map<string, number>,
  headerTop: number,
  headerHeight: number,
): LaidBox[] {
  if (!Array.isArray(file.boxes)) return [];
  const placed: LaidBox[] = [];
  for (const box of file.boxes) {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const id of box.participants) {
      const x = xById.get(id);
      if (x === undefined) continue;
      const half = (headerWidths.get(id) ?? SEQ.headerMinWidth) / 2;
      left = Math.min(left, x - half);
      right = Math.max(right, x + half);
    }
    if (left === Number.POSITIVE_INFINITY) continue;
    placed.push({
      label: box.label,
      ...(typeof box.tint === "string" ? { tint: box.tint } : {}),
      x: left - SEQ.boxPadX,
      y: headerTop - SEQ.boxLabelHeight,
      width: right - left + SEQ.boxPadX * 2,
      height: SEQ.boxLabelHeight + headerHeight + SEQ.boxPadBottom,
    });
  }
  return placed;
}

/* -------------------------------------------------------------------------- */
/* Pass B — rows, fragments, activations                                       */
/* -------------------------------------------------------------------------- */

export function layoutSequence(file: SequenceLabFile): SequenceLayout {
  const { xById, order, headerWidths } = planColumns(file);
  const indexById = new Map(order.map((id, index) => [id, index]));

  const hasActor = file.participants.some((p) => p.kind === "actor");
  const headerHeight = SEQ.headerHeight + (hasActor ? SEQ.actorGlyphHeight : 0);

  const heading = layoutHeading(file, order, xById, headerWidths);
  /* The box band is reserved BEFORE the cards are placed, because the label
     sits inside the bracket above them: adding it afterwards would either
     overlap the heading or clip the label. Documents with no boxes reserve
     nothing, so nothing about them moves. */
  const boxBand = hasBoxes(file) ? SEQ.boxLabelHeight : 0;
  const headerTop = SEQ.marginTop + heading.height + boxBand;
  const lifelineTop = headerTop + headerHeight;
  const boxes = placeBoxes(file, xById, headerWidths, headerTop, headerHeight);

  const participants: LaidParticipant[] = file.participants.map((p, index) => ({
    id: p.id,
    name: p.name,
    // Absent means "unstated"; the model keeps the omission (see
    // types/sequence.ts) but a renderer treats it as `participant`.
    kind: p.kind ?? "participant",
    ...(p.icon !== undefined ? { icon: p.icon } : {}),
    ...(p.technology !== undefined ? { technology: p.technology } : {}),
    ...(p.description !== undefined ? { description: p.description } : {}),
    x: xById.get(p.id) ?? SEQ.marginX,
    headerWidth: headerWidths.get(p.id) ?? SEQ.headerMinWidth,
    // Computed here, once, like every other per-participant fact — the
    // renderer reads the lane rather than re-deriving an index.
    lane: (index % LANE_COUNT) + 1,
  }));

  const messages: LaidMessage[] = [];
  const notes: LaidNote[] = [];
  const fragments: LaidFragment[] = [];
  const activations: LaidActivation[] = [];
  const yByStep: number[] = [];

  // Open activation bars per participant, in stack order. `deactivate` on a
  // message pops its sender's newest bar; popping an empty stack is IGNORED
  // rather than an error, deliberately: an `alt` whose branches each end with
  // a deactivating reply is perfectly good authoring, but this walk is linear
  // through all branches, so the second branch's pop finds the bar already
  // closed. Tolerating it renders every well-formed path correctly.
  const openBars = new Map<
    string,
    { y0: number; level: number; revealStep: number }[]
  >();

  const barEdgeX = (participantId: string): number => {
    const stack = openBars.get(participantId);
    const depth = stack === undefined ? 0 : stack.length;
    const x = xById.get(participantId) ?? 0;
    if (depth === 0) return x;
    return x + SEQ.barWidth / 2 + (depth - 1) * SEQ.barStagger;
  };

  let cursorY = lifelineTop + SEQ.headerGap;
  let stepCounter = 0;

  const xOf = (id: string): number => xById.get(id) ?? SEQ.marginX;

  /** Lifelines a subtree touches — a fragment's horizontal extent. */
  const touchedRange = (
    items: readonly SequenceItem[],
  ): { min: number; max: number } | null => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const touch = (id: string) => {
      const index = indexById.get(id);
      if (index === undefined) return;
      const x = xOf(id);
      min = Math.min(min, x);
      max = Math.max(max, x);
    };
    const walk = (list: readonly SequenceItem[]) => {
      for (const item of list) {
        if (item.step === "message") {
          touch(item.from);
          touch(item.to);
          if (item.from === item.to)
            max = Math.max(max, xOf(item.from) + SEQ.selfLoopWidth);
        } else if (item.step === "note") {
          for (const id of item.participants) touch(id);
        } else {
          for (const branch of item.branches) walk(branch.items);
        }
      }
    };
    walk(items);
    return min === Number.POSITIVE_INFINITY ? null : { min, max };
  };

  /** Deepest fragment nesting inside `items` (0 = no nested fragment). */
  const innerDepth = (items: readonly SequenceItem[]): number => {
    let deepest = 0;
    for (const item of items) {
      if (item.step !== "fragment") continue;
      let below = 0;
      for (const branch of item.branches) {
        below = Math.max(below, innerDepth(branch.items));
      }
      deepest = Math.max(deepest, 1 + below);
    }
    return deepest;
  };

  const placeMessage = (item: SequenceMessage) => {
    stepCounter += 1;
    const self = isSelfMessage(item);
    const rowHeight = self ? SEQ.rowSelf : SEQ.rowMessage;
    const y = cursorY + (self ? 14 : rowHeight / 2);

    // `deactivate` ends the SENDER's bar at this arrow's y — resolve the
    // sender's edge BEFORE popping so the reply still leaves from the bar it
    // is closing (a reply that leaves from the bare lifeline looks like it
    // was sent after the work finished).
    const fromX = barEdgeX(item.from);
    if (item.deactivate === true) {
      const stack = openBars.get(item.from);
      const bar = stack?.pop();
      if (bar !== undefined) {
        activations.push({
          participantId: item.from,
          x: xOf(item.from) - SEQ.barWidth / 2 + bar.level * SEQ.barStagger,
          width: SEQ.barWidth,
          y0: bar.y0,
          y1: y,
          level: bar.level,
          revealStep: bar.revealStep,
        });
      }
    }

    // `activate` starts a bar on the TARGET at this arrow's y — push before
    // resolving the target edge so the arrowhead lands on the NEW bar.
    if (item.activate === true && !self) {
      const stack = openBars.get(item.to) ?? [];
      stack.push({ y0: y, level: stack.length, revealStep: stepCounter });
      openBars.set(item.to, stack);
    }
    const toX = self ? fromX : barEdgeX(item.to);

    messages.push({
      step: stepCounter,
      from: item.from,
      to: item.to,
      lineStyle: item.lineStyle,
      headStyle: item.headStyle,
      label: item.label,
      ...(item.technology !== undefined ? { technology: item.technology } : {}),
      ...(item.description !== undefined
        ? { description: item.description }
        : {}),
      self,
      y,
      fromX,
      toX,
      labelWidth: messageLabelWidth(item),
    });
    yByStep.push(y);
    cursorY += rowHeight;
  };

  const placeNote = (item: SequenceNote) => {
    const y = cursorY + SEQ.noteGap / 2;
    let box: { lines: string[]; width: number; height: number };
    let x: number;
    let width: number;
    if (item.placement === "over") {
      const xs = item.participants.map(xOf);
      const min = Math.min(...xs);
      const max = Math.max(...xs);
      // An over-note SPANS its participants: at least lifeline-to-lifeline
      // plus a shoulder, wider if the text needs it, centred on the span.
      // The span is measured FIRST and handed to the text as its content
      // width, so a note stretched between distant lifelines wraps to the
      // room it actually has instead of to the 320px cap.
      const span = max - min + 56;
      box = layoutNoteText(
        item.text,
        Math.max(SEQ.noteMaxWidth, span) - SEQ.notePadX * 2,
      );
      width = Math.max(box.width, span);
      x = (min + max) / 2 - width / 2;
    } else {
      box = layoutNoteText(item.text);
      width = box.width;
      const anchor = xOf(item.participants[0] ?? "");
      x =
        item.placement === "right"
          ? anchor + SEQ.noteOffset
          : anchor - SEQ.noteOffset - width;
    }
    notes.push({
      placement: item.placement,
      participants: item.participants,
      text: item.text,
      lines: box.lines,
      x,
      y,
      width,
      height: box.height,
      revealStep: stepCounter,
    });
    // The row advances by the note's OWN height: a wrapped note is taller
    // than `noteHeight`, and paying the fixed cost would let it grow down
    // through the next message's arrow.
    cursorY += box.height + SEQ.noteGap;
  };

  /** Steps strictly after `after`, up to and including `upTo`, ascending. */
  const stepsBetween = (after: number, upTo: number): number[] => {
    const out: number[] = [];
    for (let s = after + 1; s <= upTo; s += 1) out.push(s);
    return out;
  };

  const placeFragment = (item: SequenceFragment, depth: number) => {
    const startY = cursorY;
    const stepBefore = stepCounter;
    cursorY += SEQ.fragmentLabelBand;

    const dividers: LaidDivider[] = [];
    // Per-branch step sets. A branch's set is simply the step-counter SPAN
    // of its walk: steps are numbered in document order and a branch's
    // subtree — nested fragments included — is walked contiguously, so
    // "everything numbered while inside the branch" IS its recursive message
    // set. No second recursive walk exists that could disagree with the one
    // that numbered the steps.
    const branchSets: LaidBranch[] = [];
    // Index into `fragments` is reserved BEFORE walking the contents so the
    // array stays outermost-first — the paint order renderers rely on, same
    // contract as placeFrames().
    const slot = fragments.length;
    fragments.push(null as unknown as LaidFragment);

    item.branches.forEach((branch, index) => {
      const branchStepBefore = stepCounter;
      if (index > 0) {
        const dividerY = cursorY + SEQ.fragmentDividerHeight / 2;
        cursorY += SEQ.fragmentDividerHeight;
        walk(branch.items, depth + 1);
        dividers.push({
          y: dividerY,
          ...(branch.label !== undefined ? { label: branch.label } : {}),
          // The divider reveals with its branch's first message; an empty
          // branch reveals with whatever preceded it.
          revealStep:
            stepCounter > branchStepBefore
              ? branchStepBefore + 1
              : branchStepBefore,
        });
      } else {
        walk(branch.items, depth + 1);
      }
      branchSets.push({
        ...(branch.label !== undefined ? { label: branch.label } : {}),
        steps: stepsBetween(branchStepBefore, stepCounter),
      });
    });

    cursorY += SEQ.fragmentBottomPad;

    const range = touchedRange(item.branches.flatMap((b) => b.items)) ?? {
      // An entirely empty fragment still needs a box; span the whole stage.
      min: xOf(order[0] ?? ""),
      max: xOf(order[order.length - 1] ?? ""),
    };
    const pad =
      SEQ.fragmentPadBase +
      innerDepth(item.branches.flatMap((b) => b.items)) * SEQ.fragmentPadStep;

    fragments[slot] = {
      // The reserved slot doubles as the pre-order document position — the
      // one number that is stable for a given model structure.
      id: `frag-${slot}`,
      kind: item.kind,
      ...(item.branches[0]?.label !== undefined
        ? { label: item.branches[0].label }
        : {}),
      ...(typeof item.tint === "string" ? { tint: item.tint } : {}),
      x: range.min - pad,
      y: startY,
      width: range.max - range.min + pad * 2,
      height: cursorY - startY,
      depth,
      revealStep: stepCounter > stepBefore ? stepBefore + 1 : stepBefore,
      dividers,
      // Same span argument as the branches, one level up: the fragment's
      // recursive message set is the counter span of walking all branches.
      steps: stepsBetween(stepBefore, stepCounter),
      branches: branchSets,
    };
  };

  const walk = (items: readonly SequenceItem[], depth: number) => {
    for (const item of items) {
      if (item.step === "message") placeMessage(item);
      else if (item.step === "note") placeNote(item);
      else placeFragment(item, depth);
    }
  };
  walk(file.items, 0);

  // Close any bar still open: it runs to the foot of the lifeline, exactly
  // like every hand-drawn sequence diagram treats a call that never returns.
  const lifelineBottom = cursorY + 18;
  for (const [participantId, stack] of openBars) {
    for (const bar of stack) {
      activations.push({
        participantId,
        x: xOf(participantId) - SEQ.barWidth / 2 + bar.level * SEQ.barStagger,
        width: SEQ.barWidth,
        y0: bar.y0,
        y1: lifelineBottom,
        level: bar.level,
        revealStep: bar.revealStep,
      });
    }
  }

  // Extents: lifelines, note overhangs and fragment boxes all count.
  let maxX = 0;
  let minX = Number.POSITIVE_INFINITY;
  for (const p of participants) {
    maxX = Math.max(maxX, p.x + p.headerWidth / 2);
    minX = Math.min(minX, p.x - p.headerWidth / 2);
  }
  for (const n of notes) {
    maxX = Math.max(maxX, n.x + n.width);
    minX = Math.min(minX, n.x);
  }
  for (const f of fragments) {
    maxX = Math.max(maxX, f.x + f.width);
    minX = Math.min(minX, f.x);
  }
  for (const m of messages) {
    if (m.self) {
      maxX = Math.max(maxX, m.fromX + SEQ.selfLoopWidth + m.labelWidth + 8);
      continue;
    }
    /* A NON-SELF label is centred on the arrow's midpoint and may be wider
       than the arrow — column gaps are capped (maxColumnGap), so an epic label
       is allowed to sit over its neighbours rather than stretch the diagram.
       Allowed to OVERLAP, not allowed to be CLIPPED: without this the viewBox
       was computed from lifelines alone and the ends of such a label fell
       outside it. Overlap is a legible compromise; a half-drawn label is not. */
    const mid = (m.fromX + m.toX) / 2;
    maxX = Math.max(maxX, mid + m.labelWidth / 2);
    minX = Math.min(minX, mid - m.labelWidth / 2);
  }

  /* `contentMinX` is computed just below, from `minX` plus the boxes — so
     the viewBox has to wait for it rather than reading `minX` directly. */
  const footerHeight = SEQ.headerHeight;
  const footerTop = lifelineBottom + SEQ.footerGap;
  /*
   * The heading is the LAST thing allowed to widen the drawing, and only when it
   * genuinely does not fit: it wraps to the column span first, so on any normal
   * flow this changes nothing. It matters on the narrow ones — two participants
   * and a long title — where the wrap floor is wider than the flow itself and
   * the text would otherwise cross the right edge.
   */
  /* A bracket pads past its outermost card, so on the first or last column it
     reaches beyond every other bound — include it or the box is clipped by
     the viewBox on exactly the diagrams that use one. */
  const contentMaxX = Math.max(
    maxX,
    SEQ.marginX + heading.width,
    ...boxes.map((box) => box.x + box.width),
  );
  const contentMinX = Math.min(minX, ...boxes.map((box) => box.x));
  const viewMinX = Math.floor(Math.min(0, contentMinX - 8));
  return {
    width: Math.ceil(contentMaxX + SEQ.marginX - viewMinX),
    height: Math.ceil(footerTop + footerHeight + SEQ.marginBottom),
    minX: viewMinX,
    heading,
    headerTop,
    headerHeight,
    lifelineTop,
    lifelineBottom,
    footerTop,
    footerHeight,
    participants,
    boxes,
    messages,
    notes,
    fragments,
    activations,
    stepCount: stepCounter,
    yByStep,
  };
}
