"use client";

/**
 * The read-only sequence diagram: pure SVG drawn from `layoutSequence`'s
 * result. This component computes NO geometry of its own — every x/y it
 * paints comes off the layout, which is what keeps the renderer and the
 * check script agreeing. The diagram renders COMPLETE: every message, note,
 * fragment and activation bar is present and settled from the first frame;
 * the only motion is the focus draw described below.
 *
 * WHY all-SVG rather than SVG lines + absolutely-positioned DOM text: the two
 * approaches were weighed and DOM text lost on three counts. (1) One
 * coordinate system — mixing means every zoom/resize must keep two layout
 * models in sync, and the house already learned that lesson the hard way in
 * `viewer/export/render-svg.ts`, which is all-SVG for export parity. (2) The
 * dim/emphasis states apply uniformly: one class on one <g> covers a
 * message's line, head AND label, where a DOM overlay needs a parallel
 * class-toggling pass. (3) The diagram scales as one object (`viewBox` plus
 * the fit/zoom sizing described on the `zoom` prop), so whole diagrams
 * shrink coherently instead of text detaching from arrows. The cost — no
 * native text wrapping — is absorbed by the layout's width estimates, which
 * reserve space per label.
 *
 * FOCUS DRAW: focusing a message re-draws that one arrow; focusing a
 * participant re-draws its whole message set in step order, staggered;
 * focusing a FRAGMENT (its kind chip) or one BRANCH (its guard label)
 * re-draws that flow's message set the same way. Every focus kind reduces to
 * one thing — a SET OF STEPS (`resolveFocusSteps`) — and dimming, stagger
 * ranks and the participant highlight are all derived from that set, so a
 * new focus kind can never invent a second dimming rule. Each animated
 * message carries `data-animate` plus a `--seq-rank` custom property — its
 * position within the focus set, derived from message (step) order, never
 * from a render index that could reshuffle — and the CSS turns rank into an
 * animation delay. See `focusNonce` below for how a repeat click replays.
 *
 * Interactivity: messages, participant headers, fragment kind chips and
 * branch guard labels are real keyboard-operable controls (role="button",
 * tabIndex, Enter/Space), not bare onClick shapes — the SVG is NOT
 * aria-hidden, and the viewer adds a text alternative beside it. Clicking
 * the backdrop clears focus.
 */

import { useId } from "react";

// Cross-feature on purpose: the tag-fill rebuild is the ONE definition of
// "a hue at our validated card lightness" (node-colors.ts carries the full
// rationale), and re-typing the expression here would let the two drift.
import { ICONS } from "@/features/editor/lib/icons/registry";
import { useIconStyle } from "@/lib/icon-style";
import { tagFillCss } from "@/features/editor/lib/node-colors";
import { cn } from "@/lib/utils";
import { TINT_WASH_OPACITY } from "@/lib/tint";

import type {
  LaidFragment,
  LaidMessage,
  LaidParticipant,
  SequenceLayout,
} from "../lib/layout";
import { estimateTextWidth, SEQ } from "../lib/layout";

/**
 * A point on a message's colour ramp: the sender's lane at `t` 0, the
 * receiver's at 1, muted toward `--edge` so a resting line never competes with
 * the `--primary` focus line. Both the line's gradient and its comet bands
 * paint from this, so the light is always the line's own colour.
 */
function laneMix(fromLane: number, toLane: number, t: number): string {
  const between = `color-mix(in oklch, var(--seq-lane-${fromLane}) ${Math.round((1 - t) * 100)}%, var(--seq-lane-${toLane}))`;
  return `color-mix(in oklch, ${between} 55%, var(--edge))`;
}

/* -------------------------------------------------------------------------- */
/* Focus model                                                                  */
/* -------------------------------------------------------------------------- */

export type SequenceFocus =
  | { kind: "message"; step: number }
  | { kind: "participant"; id: string }
  /** `branch: null` = the whole fragment; a number = that branch only. */
  | { kind: "fragment"; id: string; branch: number | null }
  | null;

/**
 * THE focus set: which message steps a focus selects. One function, exported,
 * because two consumers need the same answer — this renderer (dimming +
 * stagger ranks) and the viewer (announcement + detail panel) — and a
 * fragment flow computed twice is a fragment flow that can disagree.
 * Returns null for no focus AND for a dangling focus (a fragment id a
 * re-parse removed): a focus pointing at nothing must read as no focus,
 * the same validated-at-read-time rule the viewer applies.
 */
export function resolveFocusSteps(
  layout: SequenceLayout,
  focus: SequenceFocus,
): ReadonlySet<number> | null {
  if (focus === null) return null;
  switch (focus.kind) {
    case "message":
      return new Set([focus.step]);
    case "participant":
      return new Set(
        layout.messages
          .filter((m) => m.from === focus.id || m.to === focus.id)
          .map((m) => m.step),
      );
    case "fragment": {
      const fragment = layout.fragments.find((f) => f.id === focus.id);
      if (fragment === undefined) return null;
      const steps =
        focus.branch === null
          ? fragment.steps
          : (fragment.branches[focus.branch]?.steps ?? null);
      return steps === null ? null : new Set(steps);
    }
  }
}

export interface SequenceDiagramProps {
  layout: SequenceLayout;
  title: string;
  /** Messages are numbered on the canvas when the file says `autonumber`. */
  autonumber: boolean;
  focus: SequenceFocus;
  /**
   * Bumped by the viewer on EVERY focus gesture, including re-focusing the
   * SAME target. A CSS animation does not restart on its own when the
   * animating class/attribute is already present, so the nonce's PARITY
   * picks between two identical keyframe animations (`data-animate="a"` /
   * `"b"` in sequence-motion.css): each gesture flips the animation-name,
   * and a changed animation-name IS a restart. Parity — not the raw number —
   * because CSS can only branch on discrete attribute values, and two names
   * are enough to make every consecutive pair of gestures differ.
   */
  focusNonce: number;
  /**
   * How the SVG is sized in its pane — the hand-rolled equivalent of the C4
   * viewer's fitView/zoomTo pair:
   *   - `"fit"`: width and height 100% with preserveAspectRatio "meet", so
   *     the WHOLE diagram scales down (or up) to sit inside the pane — the
   *     last message is on screen without scrolling, like fitView.
   *   - a number: explicit pixel size (`layout × zoom`), 1 = one SVG user
   *     unit per CSS pixel — "actual size". The pane scrolls (= pans).
   */
  zoom: number | "fit";
  onFocusMessage: (step: number) => void;
  onFocusParticipant: (id: string) => void;
  /** `branch: null` focuses the whole fragment, a number that branch only. */
  onFocusFragment: (id: string, branch: number | null) => void;
  /**
   * Participants whose dependencies are currently folded away, and how many
   * each one would fold. The counts come from the FULL document (see
   * lib/collapse.ts), so a collapsed card can still say how many are behind
   * it — a card that hid its own count would leave no way to tell a collapsed
   * participant from a leaf.
   */
  collapsed: ReadonlySet<string>;
  dependencyCount: ReadonlyMap<string, number>;
  onToggleCollapse: (id: string) => void;
  /*
   * There is NO onClearFocus here, deliberately. Clearing is what happens when
   * a click lands on nothing, and "nothing" is bigger than this component: in
   * fit mode `preserveAspectRatio="meet"` letterboxes the drawing inside the
   * pane, and at a small zoom the SVG is a fraction of it. A backdrop rect
   * sized to the viewBox — which is what used to be here — covered neither,
   * so clicking obviously-empty canvas did nothing. The VIEWER owns it at the
   * pane level instead; every interactive element in here stops propagation,
   * which is what makes that safe.
   */
}

/* -------------------------------------------------------------------------- */
/* The component                                                                */
/* -------------------------------------------------------------------------- */

export function SequenceDiagram({
  layout,
  title,
  autonumber,
  focus,
  focusNonce,
  zoom,
  onFocusMessage,
  onFocusParticipant,
  onFocusFragment,
  collapsed,
  dependencyCount,
  onToggleCollapse,
}: SequenceDiagramProps): React.JSX.Element {
  /**
   * Every dim decision below derives from THIS set (see resolveFocusSteps):
   * a focus is a set of steps, and everything else — which participants
   * stay lit, which notes and bars belong to the story, which fragment
   * boxes frame it — is membership arithmetic on that set. One rule.
   */
  const focusSteps = resolveFocusSteps(layout, focus);

  const messageDimmed = (m: LaidMessage): boolean =>
    focusSteps !== null && !focusSteps.has(m.step);

  const participantDimmed = (id: string): boolean => {
    if (focus === null || focusSteps === null) return false;
    // Participant focus dims every OTHER participant — even the ones its
    // messages touch: the question asked was "this column", not "this
    // column's correspondents".
    if (focus.kind === "participant") return id !== focus.id;
    // Message and fragment focus: the endpoints of the focused set stay
    // lit with their messages.
    return !layout.messages.some(
      (m) => focusSteps.has(m.step) && (m.from === id || m.to === id),
    );
  };

  const noteDimmed = (note: {
    participants: readonly string[];
    revealStep: number;
  }): boolean => {
    if (focus === null) return false;
    if (focus.kind === "participant")
      return !note.participants.includes(focus.id);
    // Fragment focus: a note reveals with the message before it, so
    // membership of that step tells us whether the note sits inside the
    // focused flow — the same "belongs to the story" test the check script
    // pins revealStep down for.
    if (focus.kind === "fragment")
      return focusSteps === null ? false : !focusSteps.has(note.revealStep);
    return true; // message focus: notes are commentary around the one arrow
  };

  const activationDimmed = (bar: {
    participantId: string;
    revealStep: number;
  }): boolean => {
    if (focus === null) return false;
    if (focus.kind === "participant") return bar.participantId !== focus.id;
    // Fragment focus: a bar opened by a message inside the flow is part of
    // the flow (same revealStep-membership test as notes).
    if (focus.kind === "fragment")
      return focusSteps === null ? false : !focusSteps.has(bar.revealStep);
    return true; // message focus
  };

  const fragmentDimmed = (f: LaidFragment): boolean => {
    if (focus === null) return false;
    // Message/participant focus: fragment boxes are scaffolding and recede,
    // exactly as before fragments became focusable.
    if (focus.kind !== "fragment") return true;
    if (focusSteps === null) return false;
    if (f.id === focus.id) return false; // the focused frame itself
    // A nested fragment WHOLLY inside the focused flow is part of the story
    // being told (an `alt` focus keeps its inner `par` frame lit); anything
    // only partially covered — an ancestor, a sibling — recedes.
    return f.steps.length === 0 || !f.steps.every((s) => focusSteps.has(s));
  };

  /**
   * The focus set's draw order: step → stagger rank. Ranks are assigned by
   * walking `layout.messages`, which the layout guarantees is in step
   * (model) order — so the delay each message gets is a function of WHERE
   * it sits in the story, never of a filtered render index that could
   * reshuffle. A message focus is the degenerate one-element set (rank 0,
   * no delay).
   */
  const animateRankByStep = new Map<number, number>();
  if (focusSteps !== null) {
    let rank = 0;
    for (const m of layout.messages) {
      if (focusSteps.has(m.step)) {
        animateRankByStep.set(m.step, rank);
        rank += 1;
      }
    }
  }
  const animateToken = focusNonce % 2 === 0 ? "a" : "b";

  /** Sender/receiver lane lookup (the layout owns the assignment). */
  const laneById = new Map(layout.participants.map((p) => [p.id, p.lane]));

  /**
   * Prefix for every gradient id this diagram mints. `useId` rather than the
   * step alone: two diagrams on one page (the chooser's previews, a docs page
   * showing several flows) would otherwise both define `#seq-line-3`, and an
   * SVG `url(#…)` reference resolves against the WHOLE document — the second
   * diagram would silently repaint the first one's lines. Deterministic and
   * SSR-stable, which a random id would not be.
   */
  const gradPrefix = useId();
  const lineGradId = (step: number) => `${gradPrefix}line${step}`;
  const cardGradId = (participantId: string) =>
    `${gradPrefix}card${participantId}`;

  const keyActivate =
    (action: () => void) => (event: React.KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        // Stop the key from also reaching the viewer's wrapper handler and
        // from scrolling the pane (Space scrolls by default).
        event.stopPropagation();
        action();
      }
    };

  return (
    <svg
      viewBox={`${layout.minX} 0 ${layout.width} ${layout.height}`}
      // Fit mode fills the pane on BOTH axes and lets preserveAspectRatio
      // "meet" letterbox the drawing inside — the whole flow is visible at
      // once, like the C4 viewer's fitView. A numeric zoom pins the SVG to
      // explicit pixels (1 = actual size); the pane's scrollbars become the
      // pan. The old width-only fit (`width="100%" h-auto`) is gone on
      // purpose: it let a long flow overrun the pane's height, which is
      // exactly what "fit" must never do.
      {...(zoom === "fit"
        ? { width: "100%", height: "100%" }
        : {
            width: Math.round(layout.width * zoom),
            height: Math.round(layout.height * zoom),
          })}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Sequence diagram: ${title}. ${layout.participants.length} participants, ${layout.stepCount} messages. A text listing of every step follows the diagram.`}
      className="af-seq-svg block"
    >
      <defs>
        {/* CARD GRADIENTS — a vertical lift on each participant card, in that
            card's own lane hue. Both stops are built from `tagFillCss`, the
            audited card-lightness expression, so the gradient stays inside
            the measured lightness band the name's contrast was validated
            against: the top stop is the audited fill lifted slightly toward
            --background, the bottom is the same fill leaning slightly back
            into its lane. A gradient between two unrelated colours would put
            the midpoint outside that band. objectBoundingBox units (the
            default) are right here — every card wants the same top-to-bottom
            lift regardless of its width. */}
        {layout.participants.map((participant) => {
          const fill = tagFillCss(`var(--seq-lane-${participant.lane})`);
          return (
            <linearGradient
              key={participant.id}
              id={cardGradId(participant.id)}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={`color-mix(in oklch, ${fill} 88%, var(--background))`}
              />
              <stop
                offset="100%"
                stopColor={`color-mix(in oklch, ${fill} 88%, var(--seq-lane-${participant.lane}))`}
              />
            </linearGradient>
          );
        })}
      </defs>

      {/* ---- fragments, outermost first (paint order = nesting order) ----
          The BOX stays decoration (pointer-events-none — a fragment can
          cover half the diagram, and a giant click target would swallow
          every message inside it). What IS clickable, precisely: the kind
          chip (focus the whole fragment) and each branch's guard label
          (focus that branch) — small, labelled, and exactly where the eye
          reads "this is the alt / this is the [card accepted] case". */}
      {layout.fragments.map((fragment) => {
        /* The chip is sized to its WORD, not to a constant: `alt` and
           `critical` differ by five characters, and a fixed 34px box that fit
           the first clipped the second. The guard label then starts after
           whatever width came out, so the two never overlap. */
        const chipWidth = Math.max(
          34,
          Math.ceil(estimateTextWidth(fragment.kind, SEQ.fragmentFontSize)) +
            14,
        );
        return (
          <g
            key={fragment.id}
            className={cn(
              "af-seq-dimmable",
              fragmentDimmed(fragment) && "af-seq-dim",
            )}
          >
            <g className="pointer-events-none">
              {/* A `rect` is a HIGHLIGHT, so its fill is the author's colour at
                a wash rather than the neutral scaffolding fill every other
                fragment gets. The wash opacity is fixed here (not taken from
                the document) so a tint can never be strong enough to hide the
                messages it is drawn behind. */}
              <rect
                x={fragment.x}
                y={fragment.y}
                width={fragment.width}
                height={fragment.height}
                rx={8}
                fill={fragment.tint ?? "var(--canvas)"}
                fillOpacity={
                  fragment.tint !== undefined ? TINT_WASH_OPACITY : 0.5
                }
                stroke="var(--node-border)"
                strokeWidth={1}
              />
              {fragment.dividers.map((divider, dividerIndex) => (
                <line
                  key={`div-${dividerIndex}`}
                  x1={fragment.x}
                  y1={divider.y}
                  x2={fragment.x + fragment.width}
                  y2={divider.y}
                  stroke="var(--node-border)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                />
              ))}
            </g>

            {/* Kind chip — clicking it focuses the WHOLE fragment. */}
            <FragmentControl
              ariaLabel={`Focus the ${fragment.kind} fragment — every message in ${
                fragment.branches.length > 1
                  ? `all ${fragment.branches.length} branches`
                  : "it"
              }`}
              hitX={fragment.x - 2}
              hitY={fragment.y - 2}
              hitWidth={chipWidth + 4}
              hitHeight={22}
              onFocus={() => onFocusFragment(fragment.id, null)}
            >
              <rect
                className="af-seq-chip"
                x={fragment.x}
                y={fragment.y}
                width={chipWidth}
                height={18}
                rx={6}
                fill="var(--secondary)"
                stroke="var(--border)"
              />
              <text
                x={fragment.x + chipWidth / 2}
                y={fragment.y + 13}
                textAnchor="middle"
                fontSize={SEQ.fragmentFontSize}
                fontFamily="var(--font-mono)"
                fill="var(--secondary-foreground)"
              >
                {fragment.kind}
              </text>
            </FragmentControl>

            {/* Branch 0's guard label sits beside the chip; branches 1+ label
              their dividers (dividers[i] pairs with branches[i + 1] — the
              layout's documented contract). Each guard focuses ITS branch. */}
            {fragment.label !== undefined ? (
              <FragmentControl
                ariaLabel={`Focus the [${fragment.label}] branch of the ${fragment.kind} fragment`}
                hitX={fragment.x + chipWidth + 4}
                hitY={fragment.y - 2}
                hitWidth={
                  estimateTextWidth(
                    `[${fragment.label}]`,
                    SEQ.fragmentFontSize,
                  ) + 4
                }
                hitHeight={22}
                onFocus={() => onFocusFragment(fragment.id, 0)}
              >
                <text
                  className="af-seq-guard"
                  x={fragment.x + chipWidth + 6}
                  y={fragment.y + 13}
                  fontSize={SEQ.fragmentFontSize}
                  fontStyle="italic"
                  fill="var(--muted-foreground)"
                >
                  [{fragment.label}]
                </text>
              </FragmentControl>
            ) : null}
            {fragment.dividers.map((divider, dividerIndex) =>
              divider.label !== undefined ? (
                <FragmentControl
                  key={`guard-${dividerIndex}`}
                  ariaLabel={`Focus the [${divider.label}] branch of the ${fragment.kind} fragment`}
                  hitX={fragment.x + 8}
                  hitY={divider.y - 18}
                  hitWidth={
                    estimateTextWidth(
                      `[${divider.label}]`,
                      SEQ.fragmentFontSize,
                    ) + 4
                  }
                  hitHeight={18}
                  onFocus={() => onFocusFragment(fragment.id, dividerIndex + 1)}
                >
                  <text
                    className="af-seq-guard"
                    x={fragment.x + 10}
                    y={divider.y - 5}
                    fontSize={SEQ.fragmentFontSize}
                    fontStyle="italic"
                    fill="var(--muted-foreground)"
                  >
                    [{divider.label}]
                  </text>
                </FragmentControl>
              ) : null,
            )}
          </g>
        );
      })}

      {/* ---- participant boxes: the bracket around a run of lifelines ----
          Drawn BEFORE the header cards so the cards sit on top of the wash,
          and `pointer-events-none` throughout: a box is a label for a group,
          not a control. Making it clickable was considered and dropped —
          "focus everything in this box" is the participant focus repeated N
          times, and a click target this large would swallow the cards inside
          it, which ARE controls.

          `aria-hidden` for the same reason the footer cards are: the grouping
          is stated in the <svg>'s own aria-label copy and in the text
          alternative, and a screen reader meeting a bracket has nothing to do
          with it. */}
      {layout.boxes.map((box, index) => (
        <g
          key={`box-${index}`}
          aria-hidden="true"
          className="pointer-events-none"
        >
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={10}
            fill={box.tint ?? "var(--canvas)"}
            fillOpacity={box.tint !== undefined ? TINT_WASH_OPACITY : 0.45}
            stroke="var(--node-border)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={box.x + 10}
            y={box.y + SEQ.boxLabelHeight - 6}
            fontSize={SEQ.boxLabelFontSize}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            {box.label}
          </text>
        </g>
      ))}

      {/* ---- the heading: the document's title and description ----
          INSIDE the drawing, so it travels with every export — the export
          clones this node, and a title in the page's HTML would be absent from
          every file anyone sends on. Left-aligned to the first lifeline's
          column rather than centred on the canvas: centring would move the
          title every time a note widened the drawing on one side.

          `aria-hidden`: the <svg> carries role="img" with an aria-label that
          already opens with this title, so these tspans would be either
          ignored (children of role="img" are) or, worse, read twice. */}
      <g aria-hidden="true" className="af-seq-heading">
        <text
          x={SEQ.marginX}
          y={SEQ.marginTop + SEQ.titleFontSize}
          className="af-seq-heading-title"
          fontSize={SEQ.titleFontSize}
          fontWeight={600}
        >
          {layout.heading.titleLines.map((line, index) => (
            <tspan
              key={index}
              x={SEQ.marginX}
              {...(index === 0 ? {} : { dy: SEQ.titleLineHeight })}
            >
              {line}
            </tspan>
          ))}
        </text>

        {layout.heading.descriptionLines.length > 0 ? (
          <text
            x={SEQ.marginX}
            y={
              SEQ.marginTop +
              layout.heading.titleLines.length * SEQ.titleLineHeight +
              SEQ.titleDescriptionGap +
              SEQ.descriptionFontSize
            }
            className="af-seq-heading-description"
            fontSize={SEQ.descriptionFontSize}
          >
            {layout.heading.descriptionLines.map((line, index) => (
              <tspan
                key={index}
                x={SEQ.marginX}
                {...(index === 0 ? {} : { dy: SEQ.descriptionLineHeight })}
              >
                {line}
              </tspan>
            ))}
          </text>
        ) : null}
      </g>

      {/* ---- lifelines + participant headers ---- */}
      {layout.participants.map((participant) => (
        <ParticipantColumn
          key={participant.id}
          participant={participant}
          layout={layout}
          dimmed={participantDimmed(participant.id)}
          paintId={cardGradId(participant.id)}
          dependencies={dependencyCount.get(participant.id) ?? 0}
          collapsed={collapsed.has(participant.id)}
          onToggleCollapse={() => onToggleCollapse(participant.id)}
          onFocus={() => onFocusParticipant(participant.id)}
          onKeyDown={keyActivate(() => onFocusParticipant(participant.id))}
        />
      ))}

      {/* ---- activation bars (over lifelines, under arrows) ----
          Bars always draw their full extent — the diagram is complete. */}
      {layout.activations.map((bar, index) => (
        <rect
          key={`act-${index}`}
          className={cn(
            "af-seq-dimmable pointer-events-none",
            activationDimmed(bar) && "af-seq-dim",
          )}
          x={bar.x}
          y={bar.y0}
          width={bar.width}
          height={Math.max(0, bar.y1 - bar.y0)}
          fill="var(--secondary)"
          stroke="var(--node-border)"
          strokeWidth={1}
          rx={2}
        />
      ))}

      {/* ---- notes ---- */}
      {layout.notes.map((note, index) => (
        <g
          key={`note-${index}`}
          className={cn(
            "af-seq-dimmable pointer-events-none",
            noteDimmed(note) && "af-seq-dim",
          )}
        >
          {/* The classic dog-eared note, tinted with the WARNING token: the
              one house colour that already means "an aside demanding
              attention", and visibly not a node or a message in either
              theme. */}
          <path
            d={`M ${note.x} ${note.y} H ${note.x + note.width - 10} L ${note.x + note.width} ${note.y + 10} V ${note.y + note.height} H ${note.x} Z`}
            fill="color-mix(in oklab, var(--warning) 16%, var(--card))"
            stroke="color-mix(in oklab, var(--warning) 55%, var(--border))"
            strokeWidth={1}
          />
          <path
            d={`M ${note.x + note.width - 10} ${note.y} v 10 h 10`}
            fill="none"
            stroke="color-mix(in oklab, var(--warning) 55%, var(--border))"
            strokeWidth={1}
          />
          {/* ONE TSPAN PER WRAPPED LINE, from `note.lines` — never `note.text`.
              SVG text does not wrap, so drawing the raw string put a single
              unbroken line through both walls of the box and off the canvas
              (see `wrapText` in lib/layout.ts). The lines are measured there,
              which is also what gave this box its height, so the block is
              centred by construction: start half a line-height above centre
              for each line past the first. */}
          <text
            x={note.x + note.width / 2}
            textAnchor="middle"
            fontSize={SEQ.noteFontSize}
            fill="var(--foreground)"
          >
            {note.lines.map((line, lineIndex) => (
              <tspan
                key={lineIndex}
                x={note.x + note.width / 2}
                y={
                  note.y +
                  note.height / 2 +
                  4 -
                  ((note.lines.length - 1) * SEQ.noteLineHeight) / 2 +
                  lineIndex * SEQ.noteLineHeight
                }
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}

      {/* ---- messages ---- */}
      {layout.messages.map((message) => (
        <Message
          key={`msg-${message.step}`}
          message={message}
          autonumber={autonumber}
          animateRank={animateRankByStep.get(message.step) ?? null}
          animateToken={animateToken}
          focused={focus?.kind === "message" && focus.step === message.step}
          dimmed={messageDimmed(message)}
          // The line's gradient id, and the two lanes it ramps between. The
          // message MINTS its own gradient (see the Message component) rather
          // than reading one from a shared <defs> — null when either endpoint
          // has no lane, and the CSS fallback then paints a flat --edge line
          // rather than leaving a dangling url() reference.
          paintId={
            laneById.has(message.from) && laneById.has(message.to)
              ? lineGradId(message.step)
              : null
          }
          fromLane={laneById.get(message.from) ?? null}
          toLane={laneById.get(message.to) ?? null}
          onFocus={() => onFocusMessage(message.step)}
          onKeyDown={keyActivate(() => onFocusMessage(message.step))}
        />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Fragment chip / guard-label control                                          */
/* -------------------------------------------------------------------------- */

/**
 * One clickable unit inside a fragment's label band: the visible children
 * (chip rect + text, or a guard-label text) plus an invisible hit rect ON
 * TOP that owns the button semantics. The visuals are pointer-events-none so
 * the hit rect is the ONE target; the wrapper `<g>` carries the
 * `.af-seq-frag-ctl` class the stylesheet uses to paint hover/focus onto the
 * visible children (`:has()` — the same in-SVG focus-ring trick the message
 * and participant hits use, since CSS outline cannot follow SVG shapes).
 */
function FragmentControl({
  ariaLabel,
  hitX,
  hitY,
  hitWidth,
  hitHeight,
  onFocus,
  children,
}: {
  ariaLabel: string;
  hitX: number;
  hitY: number;
  hitWidth: number;
  hitHeight: number;
  onFocus: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <g className="af-seq-frag-ctl">
      <g className="pointer-events-none">{children}</g>
      <rect
        className="af-seq-hit af-seq-hit-region"
        x={hitX}
        y={hitY}
        width={hitWidth}
        height={hitHeight}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onFocus();
          }
        }}
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Participant column                                                           */
/* -------------------------------------------------------------------------- */

function ParticipantColumn({
  participant,
  layout,
  dimmed,
  paintId,
  dependencies,
  collapsed,
  onToggleCollapse,
  onFocus,
  onKeyDown,
}: {
  participant: LaidParticipant;
  layout: SequenceLayout;
  dimmed: boolean;
  /** Gradient id for this card's vertical lift, or null for the flat wash. */
  paintId: string | null;
  /** How many participants this one would fold away; 0 means no control. */
  dependencies: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  const { x, headerWidth } = participant;
  // From the LAYOUT's header top, not `SEQ.marginTop`: the heading block above
  // pushes this row down, and only the layout knows how tall it came out.
  const boxTop =
    layout.headerTop +
    (participant.kind === "actor" ? SEQ.actorGlyphHeight : 0);
  const boxHeight = layout.headerHeight - (boxTop - layout.headerTop);
  const isActor = participant.kind === "actor";
  /* The SHARED registry, not a second one: a participant and a C4 container
     are usually the same system drawn twice, and two icon vocabularies would
     let them disagree about what to call one. An unknown slug resolves to
     nothing and the card simply draws without an icon — a document that names
     an icon this build does not have is still a valid document, and refusing
     to draw it would be the renderer enforcing a rule the format does not. */
  const icon =
    participant.icon === undefined ? undefined : ICONS[participant.icon];
  /* The sequence exporter clones the LIVE DOM (its render-svg.ts explains
     the strategy), so reading the reader's style here is all export parity
     needs — unlike the C4 exporter, which re-renders from the model and has
     to be handed the style explicitly. */
  const [iconStyle] = useIconStyle();
  /**
   * The participant's LANE colour — its header border, lifeline and actor
   * glyph, assigned by the layout (LaidParticipant.lane; globals.css owns
   * the validated values). This is participant CHROME only: the message
   * lines stay on --edge / the idle neutral / --primary, because the line's
   * three-state colour vocabulary was hard-won (idle-vs-focus collisions)
   * and a fourth colour system on the same stroke would reintroduce exactly
   * that class of bug. Text also never takes a lane — names stay on the
   * node text tokens, which is what makes the below-3:1 light-mode lanes
   * acceptable (identity is carried by the name, not the colour).
   */
  const lane = `var(--seq-lane-${participant.lane})`;
  /**
   * ONE colour per card: the fill is a low-chroma wash of the card's OWN
   * lane hue, rebuilt through the exact relative-colour pins tag fills use
   * (`tagFillCss` — lane hue at OUR `--tag-fill-l`/`--tag-fill-c` lightness
   * and chroma), so every fill lands on the same measured lightness band as
   * the audited node fills and the label contrast holds BY CONSTRUCTION in
   * both themes. The role fill this replaces (--node-person for actors) was
   * a second colour system on the most prominent card — a violet card in an
   * aqua border — from the days when nothing else carried participant
   * identity; the lane border does now, and the actor/participant
   * distinction rides the SHAPE instead: the stick-figure glyph and the
   * taller silhouette stay.
   *
   * The flat wash is now the GRADIENT's fallback rather than the paint: the
   * <defs> gradient is built from this same expression at both stops (a small
   * lift toward --background at the top, the same lean back into the lane at
   * the bottom), so the card gains depth without leaving the measured
   * lightness band the name's contrast was validated against. `paintId` is
   * null only if the diagram could not mint the gradient, and then this flat
   * fill is exactly what shipped before.
   */
  const fill = tagFillCss(lane);
  const cardFill = paintId === null ? fill : `url(#${paintId})`;

  return (
    <g
      className={cn(
        "af-seq-participant af-seq-dimmable",
        dimmed && "af-seq-dim",
      )}
    >
      {/* The lifeline wears the lane at reduced strength: it must mark the
          column all the way down without out-shouting the --edge message
          lines that cross it — the lane's full strength is reserved for the
          header border, where "which service is this" is actually read. */}
      <line
        x1={x}
        y1={layout.lifelineTop}
        /* Down to the FOOTER, not to lifelineBottom: the line should visibly
           join the card that repeats the name, rather than stopping in the
           gap above it. lifelineBottom stays what activation bars close
           against — the foot of the FLOW, which is a different fact. */
        x2={x}
        y2={layout.footerTop}
        stroke={lane}
        strokeOpacity={0.6}
        strokeWidth={1.25}
        strokeDasharray="4 4"
      />
      {isActor ? (
        /* THE ACTOR'S AVATAR — a disc above the card carrying a head-and-
           shoulders bust, which is what a person looks like at 24px. Two
           earlier attempts are worth not repeating: a head with a crossbar read
           as a map pin, and a full stick figure with arms and legs turned to
           scaffolding at this size, because a 1.5px limb has no silhouette to
           recognise. A FILLED bust does — it is the same mark every avatar
           slot in every interface uses, so it needs no learning.

           It also replaces the halo ring that used to sit around this card.
           Two emphasis devices on one card competed; the disc is the stronger
           and the more meaningful of the two, since it says WHAT this
           participant is rather than merely "look here". The actor/participant
           distinction the model preserves stays carried by shape, never by
           colour alone — the name is always rendered too, which is the relief
           rule the lane palette depends on.

           The disc wears the card's own fill and border, so it reads as part
           of the card rather than a sticker on top of it, and the bust is
           filled in the lane: a decorative mark, not text, so the lane hues
           that fall below 3:1 in light mode are as acceptable here as they are
           on the lifeline. */
        <g className="pointer-events-none">
          <circle
            cx={x}
            cy={layout.headerTop + 13}
            r={12}
            fill={cardFill}
            stroke={lane}
            strokeWidth={1.5}
          />
          <circle cx={x} cy={layout.headerTop + 10} r={3.4} fill={lane} />
          <path
            d={`M ${x - 5.6} ${layout.headerTop + 19} a 5.6 5.6 0 0 1 11.2 0 Z`}
            fill={lane}
          />
        </g>
      ) : null}
      <rect
        className="af-seq-header-box"
        x={x - headerWidth / 2}
        y={boxTop}
        width={headerWidth}
        height={boxHeight}
        rx={8}
        fill={cardFill}
        stroke={lane}
        strokeWidth={1.5}
      />
      {/* ---- the icon, and the name it shares a row with ----
          THE NAME IS ANCHORED, the icon is placed. An earlier version centred
          the pair by measuring the row and drawing the name from its left
          edge, which quietly made every label's position depend on
          `estimateTextWidth` being right — including the labels of the many
          participants that have no icon at all. It showed up as a name sitting
          off-centre above a technology line that was not: the `[Go]` beneath
          uses `textAnchor="middle"` and lands exactly, so the two disagreed
          inside one card, which the eye catches long before absolute drift.

          Now the name is `textAnchor="middle"` too, so no estimate can move
          it. The estimate survives only to place the ICON — and a 16px mark a
          pixel out is invisible, where a drifting word is not. With no icon
          the name's centre IS the card's centre, so those cards are exact. */}
      {(() => {
        const Icon = icon?.byStyle[iconStyle];
        const iconRun = Icon === undefined ? 0 : SEQ.iconSize + SEQ.iconGap;
        /* The name gives up half the icon's run so that ICON + NAME together
           read as centred, rather than the name alone. */
        const nameCentre = x + iconRun / 2;
        const nameY =
          boxTop +
          (participant.technology === undefined
            ? boxHeight / 2 + 4
            : boxHeight / 2 - 3);
        return (
          <>
            {Icon === undefined ? null : (
              <Icon
                x={
                  nameCentre -
                  estimateTextWidth(participant.name, SEQ.nameFontSize) / 2 -
                  SEQ.iconGap -
                  SEQ.iconSize
                }
                /* Optically centred on the text's x-height rather than its
                   baseline: `nameY` is where the glyphs SIT, so an icon
                   aligned to it would hang below the word. */
                y={nameY - SEQ.iconSize + 3}
                width={SEQ.iconSize}
                height={SEQ.iconSize}
                /* Monochrome registry icons paint with `currentColor`; a
                   brand mark carries its own fills and ignores this. */
                color="var(--node-meta)"
              />
            )}
            <text
              x={nameCentre}
              y={nameY}
              textAnchor="middle"
              fontSize={SEQ.nameFontSize}
              fontWeight={600}
              fill="var(--node-foreground)"
            >
              {participant.name}
            </text>
          </>
        );
      })()}
      {participant.technology !== undefined ? (
        <text
          x={x}
          y={boxTop + boxHeight / 2 + 12}
          textAnchor="middle"
          fontSize={SEQ.metaFontSize}
          fill="var(--node-meta)"
        >
          [{participant.technology}]
        </text>
      ) : null}
      {/* The whole header is the participant's click/keyboard target —
          `af-seq-hit-region` makes the rect's INTERIOR hit-testable
          (pointer-events: all), not just an 18px stroke band around it. */}
      <rect
        className="af-seq-hit af-seq-hit-region"
        x={x - headerWidth / 2}
        y={layout.headerTop}
        width={headerWidth}
        height={layout.headerHeight}
        fill="transparent"
        role="button"
        tabIndex={0}
        aria-label={`Focus participant ${participant.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
        }}
        onKeyDown={onKeyDown}
      />

      {/* ---- the dependency FOLD control ----
          Offered only on participants that actually have private dependencies
          (see lib/collapse.ts), which in a typical flow is the middle tier —
          the actor and the front end own nothing privately, so their cards stay
          clean. A control that hides nothing is worse than no control.

          MINIMAL BY DEFAULT: no pill, no border — just a small `−` glyph while
          expanded, and `+2` once collapsed. The chrome was a bordered capsule
          and it competed with the card it sits on; a card is already a bordered
          box, so a second one inside it reads as a defect. What survives is the
          part that carries information.

          The count appears only when COLLAPSED, and asymmetry is the right
          answer rather than a slip. Expanded, the number is noise: the
          dependencies are on screen to be counted. Collapsed, it is the only
          thing distinguishing a folded service from one that never had
          dependencies, so it has to be visible then. Hovering either state
          reveals the full label through the button's accessible name.

          Top-right of the card, clear of the vertically-centred name and its
          technology line. A real button: role, aria-pressed and a label naming
          the action, and it stops propagation so folding a card never also
          focuses it — those are different intents on the same card. The hit
          target stays 24×18 regardless of how small the glyph is, because a
          minimal control must be quiet, not hard to hit. */}
      {dependencies > 0 ? (
        <g className="af-seq-fold">
          <text
            x={x + headerWidth / 2 - 9}
            y={boxTop + 16}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="var(--node-meta)"
          >
            {collapsed ? `+${dependencies}` : "−"}
          </text>
          <rect
            className="af-seq-hit af-seq-hit-region"
            x={x + headerWidth / 2 - 24}
            y={boxTop + 3}
            width={24}
            height={18}
            role="button"
            tabIndex={0}
            aria-pressed={collapsed}
            aria-label={
              collapsed
                ? `Show ${dependencies} dependencies of ${participant.name}`
                : `Hide ${dependencies} dependencies of ${participant.name}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse();
              }
            }}
          >
            {/* A HOVER tooltip, which the accessible name alone never gave a
                pointer user: `−` is the whole visible affordance, and until
                this <title> existed the only way to learn what it did was to
                press it and watch the diagram change. It names WHAT folds
                rather than only how many — "2 dependencies" counts things the
                reader cannot see. `aria-label` above still wins the accessible
                name, so nothing is announced twice. */}
            <title>
              {collapsed
                ? `Show the ${dependencies} service${dependencies === 1 ? "" : "s"} only ${participant.name} uses`
                : `Hide the ${dependencies} service${dependencies === 1 ? "" : "s"} only ${participant.name} uses`}
            </title>
          </rect>
        </g>
      ) : null}

      {/* ---- the FOOTER card ----
          The name repeated at the foot of the lifeline, so a long flow can be
          read at the bottom of the page without scrolling back up to learn
          which column is which — the convention every hand-drawn sequence
          diagram uses.

          It CLICKS like the header — focusing this participant — because at
          the bottom of a long flow the footer is the card under the reader's
          cursor, and a card that looks identical to a clickable one but is
          inert is worse than no card. But it is `aria-hidden` and NOT a tab
          stop: it is the same participant and the same action, so a second
          announced control would double every column's tab stops and name
          every service twice for no new information. A redundant POINTER
          affordance for an action that already has an accessible control is
          exactly the case where hiding it from the tree is correct.

          It omits the actor glyph, because the silhouette is an identity CUE
          and repeating it invites reading the footer as a second, separate
          actor. And it omits the technology line, which is metadata the
          header already states; down here the name alone orients the eye. */}
      <g aria-hidden="true">
        <rect
          className="af-seq-header-box pointer-events-none"
          x={x - headerWidth / 2}
          y={layout.footerTop}
          width={headerWidth}
          height={layout.footerHeight}
          rx={8}
          fill={cardFill}
          stroke={lane}
          strokeWidth={1.5}
        />
        <text
          x={x}
          y={layout.footerTop + layout.footerHeight / 2 + 4}
          textAnchor="middle"
          fontSize={SEQ.nameFontSize}
          fontWeight={600}
          fill="var(--node-foreground)"
          className="pointer-events-none"
        >
          {participant.name}
        </text>
        <rect
          className="af-seq-hit af-seq-hit-region"
          x={x - headerWidth / 2}
          y={layout.footerTop}
          width={headerWidth}
          height={layout.footerHeight}
          onClick={(event) => {
            event.stopPropagation();
            onFocus();
          }}
        />
      </g>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* One message                                                                  */
/* -------------------------------------------------------------------------- */

function Message({
  message,
  autonumber,
  animateRank,
  animateToken,
  focused,
  dimmed,
  paintId,
  fromLane,
  toLane,
  onFocus,
  onKeyDown,
}: {
  message: LaidMessage;
  autonumber: boolean;
  /** Stagger rank within the focus set, or null when not animating. */
  animateRank: number | null;
  animateToken: "a" | "b";
  focused: boolean;
  dimmed: boolean;
  /** Gradient id for this line's sender→receiver paint, or null for --edge. */
  paintId: string | null;
  /** Sender's and receiver's colour lanes — the ramp's two ends. */
  fromLane: number | null;
  toLane: number | null;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  const { y, fromX, toX, kind, self } = message;
  const dir = toX >= fromX ? 1 : -1;

  const linePath = self
    ? `M ${fromX} ${y} h ${SEQ.selfLoopWidth} v ${SEQ.selfLoopHeight} H ${fromX + 7}`
    : `M ${fromX} ${y} L ${toX} ${y}`;

  // Head geometry. A self-message's head points LEFT, back at the lifeline.
  const headX = self ? fromX + 7 : toX;
  const headY = self ? y + SEQ.selfLoopHeight : y;
  const headDir = self ? -1 : dir;
  const filledHead = `M ${headX} ${headY} l ${-9 * headDir} -4.5 v 9 Z`;
  const openHead = `M ${headX - 9 * headDir} ${headY - 4.5} L ${headX} ${headY} L ${headX - 9 * headDir} ${headY + 4.5}`;

  const midX = (fromX + toX) / 2;
  const labelX = self ? fromX + SEQ.selfLoopWidth + 10 : midX;
  const labelY = self ? y + SEQ.selfLoopHeight / 2 + 4 : y - 7;

  /**
   * ONE hit target per message, covering the arrow AND its label — a user's
   * instinct is to click the words, and two separate targets would double
   * the tab stops and split the accessible name. Built as closed rect
   * subpaths (hit-tested by fill via `.af-seq-hit-region`, no stroke) so the
   * bounds are EXACT — the old 18px-stroke trick would halo 9px past every
   * edge and let a label box steal clicks from its neighbour.
   *
   * Bounding: the band sizes live in SEQ (`hitLineBand`, `hitLabelTop`,
   * `hitLabelBottom`) because they are coupled to `rowMessage` rather than
   * free — two ADJACENT rows' targets must never meet, or the lower one steals
   * the clicks meant for the upper one's label. `check:sequence-layout`
   * asserts the gutter that separates them, so these cannot be widened by
   * feel without a failing check.
   *
   * Self-messages sit in the taller `rowSelf` and get the loop's bounding box
   * plus the label hanging to its right, so they can afford a little more.
   */
  const w = message.labelWidth;
  const band = SEQ.hitLineBand;
  const hitPath = self
    ? `M ${fromX - 6} ${y - band} H ${fromX + SEQ.selfLoopWidth + 12} V ${y + SEQ.selfLoopHeight + band} H ${fromX - 6} Z ` +
      `M ${labelX - 4} ${y + SEQ.selfLoopHeight / 2 - 14} H ${labelX + w} V ${y + SEQ.selfLoopHeight / 2 + 12} H ${labelX - 4} Z`
    : `M ${Math.min(fromX, toX) - 8} ${y - band} H ${Math.max(fromX, toX) + 8} V ${y + band} H ${Math.min(fromX, toX) - 8} Z ` +
      `M ${labelX - w / 2} ${y - SEQ.hitLabelTop} H ${labelX + w / 2} V ${y - SEQ.hitLabelBottom} H ${labelX - w / 2} Z`;

  /* The description is ANNOUNCED, not read out: it can run to 500 characters,
     and a control whose name is a paragraph is unusable to navigate by. The
     name says the detail exists and where it appears; the dock reads it. */
  const ariaLabel =
    `Step ${message.step}: ${message.from} to ${message.to}, ${kind}${self ? ", self-message" : ""} — ${message.label}` +
    (message.description !== undefined ? ". Has details" : "");

  /**
   * At rest, and therefore marching. All three exclusions are deliberate: the
   * focus draw owns stroke-dashoffset on the animating set (two motions on one
   * wire reads as a glitch), a focused-and-held message keeps its steady
   * emphasis rather than fidgeting, and a dimmed message is explicitly not
   * what the reader asked about — motion there would defeat the dimming. With
   * nothing focused, that means every message marches.
   */
  const idle = animateRank === null && !dimmed && !focused;

  return (
    <g
      className={cn("af-seq-msg af-seq-dimmable", dimmed && "af-seq-dim")}
      data-focused={focused || undefined}
      data-animate={animateRank !== null ? animateToken : undefined}
      // The kind picks which dash pattern marches (the stylesheet's march
      // block); replies keep the 6/5 they already wear, the solid kinds get a
      // long dash and a small gap.
      data-kind={kind}
      // The step number, for consumers outside React that need to address one
      // message: the GIF export reveals messages in order and has only the DOM
      // to work from (export/frames.ts).
      data-step={message.step}
      // AT REST — neither focused, animating, nor dimmed — and therefore
      // marching. The gate lives here rather than in a CSS :not() chain
      // because "at rest" is a fact about the focus MODEL (three separate
      // states collapse into it), and the renderer already knows all three.
      data-idle={idle ? "" : undefined}
      style={
        {
          // The rank becomes a stagger delay (`rank × --seq-stagger`) in CSS,
          // so no per-element millisecond appears here — durations stay owned
          // by lib/motion.ts.
          ...(animateRank !== null ? { "--seq-rank": animateRank } : {}),
          // The sender→receiver gradient, as a VALUE the .af-seq-line rule
          // consumes. Deliberately not `stroke`: an inline stroke would
          // outrank the focus rule and a focused line would keep its gradient
          // instead of escalating to --primary.
          ...(paintId !== null
            ? { "--seq-line-paint": `url(#${paintId})` }
            : {}),
        } as React.CSSProperties
      }
    >
      {/* THIS MESSAGE'S GRADIENT, defined INSIDE its group rather than in a
          shared <defs> at the top of the SVG. Both the line and its comet
          bands reference it by id, and the stylesheet reaches the bands with a
          DESCENDANT selector rooted at .af-seq-msg — anything the CSS must
          match has to be nested here, and keeping the paint beside the one
          line that uses it keeps that honest. (A gradient is legal anywhere in
          the document; it paints nothing itself.)

          Direction: `gradientUnits="userSpaceOnUse"` with the message's OWN
          endpoints, so a reply's right-to-left run ramps right-to-left too and
          a self-loop ramps diagonally across the loop. objectBoundingBox units
          would flip nothing and squash the loop's tall box.

          Both stops are MUTED toward --edge: at full lane strength a resting
          line competes with the --primary focus line, and the three-state
          vocabulary (--edge at rest → --primary on focus) is what makes focus
          read as escalation rather than as one more coloured line. Muting also
          keeps it legible in both themes, since the lane hues were validated
          against each other and the card surface, never as 1.5px strokes. */}
      {paintId !== null && fromLane !== null && toLane !== null ? (
        <defs>
          <linearGradient
            id={paintId}
            gradientUnits="userSpaceOnUse"
            x1={fromX}
            y1={y}
            x2={self ? fromX + SEQ.selfLoopWidth : toX}
            y2={self ? y + SEQ.selfLoopHeight : y}
          >
            <stop offset="0%" stopColor={laneMix(fromLane, toLane, 0)} />
            <stop offset="100%" stopColor={laneMix(fromLane, toLane, 1)} />
          </linearGradient>
        </defs>
      ) : null}

      {kind === "reply" ? (
        /* Replies FADE (dashed from frame one) — see sequence-motion.css for
           why they cannot share the dashoffset draw. */
        <path
          className="af-seq-line af-seq-fade-in"
          d={linePath}
          fill="none"
          strokeDasharray="6 5"
        />
      ) : (
        <path
          className="af-seq-line af-seq-draw"
          d={linePath}
          fill="none"
          /* pathLength=1 normalises the draw so every arrow draws in the same
             time regardless of span — but it also renormalises ALL dash maths
             on this path, which would turn the march's real-unit 10/4 into
             fractions of the line and stretch a long message's dashes. The
             two states are mutually exclusive, so the attribute is present
             only while drawing. */
          {...(animateRank !== null ? { pathLength: 1 } : {})}
        />
      )}

      {/* THE COMET — the C4 viewer's edge flow, same construction and same
          numbers: a blurred glow under a soft tail under a sharp head, three
          paths over the untouched line, each `pathLength=100` so the dash
          maths are percentages of the true path (straight, self-loop, any
          length). The widths transfer verbatim rather than scaled because
          C4's `.viewer-edge-drift` line is stroke-width 1.5 and so is this
          one — the same comet over the same weight of line reads the same.
          `check:sequence-motion` reads viewer-canvas.tsx and asserts the
          dasharrays and keyframes still MATCH C4's, so "same as the C4"
          survives someone tuning one of the two.

          This is why solid arrows need no marching dash: a dash on a solid
          line makes it read as async-or-reply, whereas short bands of light
          travelling over an unbroken line leave the kind alone. The bands are
          low duty (the head is 9 of 100) — that is the boundary between a
          travelling highlight and a second line, and the reason four earlier
          overlay designs read as doubled was that they crossed it.

          Colour is the line's OWN ramp, not C4's --primary → --accent: primary
          is this view's FOCUS colour, and a resting comet wearing it would say
          "selected" on every message at once.

          Rendered only at rest, so the focused set has no comet to fight the
          draw, and gated in CSS by `data-seq-march` — a comet frozen by the
          toggle would be three bright stripes parked on every line.

          PAINTED AFTER THE LINE, and that is load-bearing. SVG has no
          z-index — later siblings paint on top — so while this group sat
          BEFORE the line, the 1.5px stroke covered its own comet: only the
          wider blurred glow bled past the edges, and the motion read as a
          faint smudge rather than a band riding the line. It looked like the
          animation was broken, and it was. C4 paints its flow layers over the
          base for the same reason. */}
      {idle && kind !== "reply" && paintId !== null ? (
        <g className="af-seq-flow" aria-hidden="true">
          <path
            className="af-seq-flow-band af-seq-flow-glow"
            d={linePath}
            pathLength={100}
          />
          <path
            className="af-seq-flow-band af-seq-flow-tail"
            d={linePath}
            pathLength={100}
          />
          <path
            className="af-seq-flow-band af-seq-flow-head"
            d={linePath}
            pathLength={100}
          />
        </g>
      ) : null}

      {kind === "sync" ? (
        <path className="af-seq-head af-seq-head-fill" d={filledHead} />
      ) : (
        <path className="af-seq-head af-seq-head-line" d={openHead} />
      )}

      <text
        className="af-seq-label af-seq-fade-in"
        x={labelX}
        y={labelY}
        textAnchor={self ? "start" : "middle"}
        fontSize={SEQ.labelFontSize}
      >
        {autonumber ? (
          <tspan className="af-seq-label-meta">{message.step}. </tspan>
        ) : null}
        {message.label}
        {message.technology !== undefined ? (
          <tspan className="af-seq-label-meta"> [{message.technology}]</tspan>
        ) : null}
        {/* The footnote mark for a message that carries a `desc` — see
            .af-seq-label-more. aria-hidden because the accessible name below
            says it in words; a screen reader announcing "bullet" would be
            noise, not an affordance. */}
        {message.description !== undefined ? (
          <tspan className="af-seq-label-more" aria-hidden="true">
            {" •"}
          </tspan>
        ) : null}
      </text>

      <path
        className="af-seq-hit af-seq-hit-region"
        d={hitPath}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
        }}
        onKeyDown={onKeyDown}
      />
    </g>
  );
}
