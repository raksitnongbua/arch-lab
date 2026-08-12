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
  SequenceMessageKind,
  SequenceNote,
  SequenceNotePlacement,
  SequenceParticipantKind,
} from "@/types";
import { isSelfMessage } from "@/types/sequence";

/* -------------------------------------------------------------------------- */
/* Constants — exported so the check script asserts against the same numbers   */
/* -------------------------------------------------------------------------- */

export const SEQ = {
  /** Same ratio as render-svg.ts — one estimate for the whole codebase. */
  charWidthRatio: 0.58,

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

  noteHeight: 36,
  noteGap: 10,
  notePadX: 12,
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
  kind: SequenceMessageKind;
  label: string;
  technology?: string;
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

function noteWidth(note: SequenceNote): number {
  return Math.min(
    estimateWidth(note.text, SEQ.noteFontSize) + SEQ.notePadX * 2,
    SEQ.noteMaxWidth,
  );
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
    const nameW = estimateWidth(p.name, SEQ.nameFontSize);
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
/* Pass B — rows, fragments, activations                                       */
/* -------------------------------------------------------------------------- */

export function layoutSequence(file: SequenceLabFile): SequenceLayout {
  const { xById, order, headerWidths } = planColumns(file);
  const indexById = new Map(order.map((id, index) => [id, index]));

  const hasActor = file.participants.some((p) => p.kind === "actor");
  const headerHeight = SEQ.headerHeight + (hasActor ? SEQ.actorGlyphHeight : 0);
  const lifelineTop = SEQ.marginTop + headerHeight;

  const participants: LaidParticipant[] = file.participants.map((p, index) => ({
    id: p.id,
    name: p.name,
    // Absent means "unstated"; the model keeps the omission (see
    // types/sequence.ts) but a renderer treats it as `participant`.
    kind: p.kind ?? "participant",
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
      kind: item.kind,
      label: item.label,
      ...(item.technology !== undefined ? { technology: item.technology } : {}),
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
    const width = noteWidth(item);
    const y = cursorY + SEQ.noteGap / 2;
    let x: number;
    if (item.placement === "over") {
      const xs = item.participants.map(xOf);
      const min = Math.min(...xs);
      const max = Math.max(...xs);
      // An over-note SPANS its participants: at least lifeline-to-lifeline
      // plus a shoulder, wider if the text needs it, centred on the span.
      const spanWidth = Math.max(width, max - min + 56);
      x = (min + max) / 2 - spanWidth / 2;
      notes.push({
        placement: item.placement,
        participants: item.participants,
        text: item.text,
        x,
        y,
        width: spanWidth,
        height: SEQ.noteHeight,
        revealStep: stepCounter,
      });
    } else {
      const anchor = xOf(item.participants[0] ?? "");
      x =
        item.placement === "right"
          ? anchor + SEQ.noteOffset
          : anchor - SEQ.noteOffset - width;
      notes.push({
        placement: item.placement,
        participants: item.participants,
        text: item.text,
        x,
        y,
        width,
        height: SEQ.noteHeight,
        revealStep: stepCounter,
      });
    }
    cursorY += SEQ.noteHeight + SEQ.noteGap;
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
    }
  }

  const viewMinX = Math.floor(Math.min(0, minX - 8));
  const footerHeight = SEQ.headerHeight;
  const footerTop = lifelineBottom + SEQ.footerGap;
  return {
    width: Math.ceil(maxX + SEQ.marginX - viewMinX),
    height: Math.ceil(footerTop + footerHeight + SEQ.marginBottom),
    minX: viewMinX,
    headerHeight,
    lifelineTop,
    lifelineBottom,
    footerTop,
    footerHeight,
    participants,
    messages,
    notes,
    fragments,
    activations,
    stepCount: stepCounter,
    yByStep,
  };
}
