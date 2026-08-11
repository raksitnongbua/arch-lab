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

import { cn } from "@/lib/utils";

import type {
  LaidFragment,
  LaidMessage,
  LaidParticipant,
  SequenceLayout,
} from "../lib/layout";
import { estimateTextWidth, SEQ } from "../lib/layout";

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
  onClearFocus: () => void;
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
  onClearFocus,
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
      className="block"
    >
      {/* Backdrop — clicking empty space clears focus. Not a button: it is
          the ABSENCE of a target, and tabbing onto "nothing" would be noise
          (Escape already covers keyboard users, in the viewer). */}
      <rect
        x={layout.minX}
        y={0}
        width={layout.width}
        height={layout.height}
        fill="transparent"
        onClick={onClearFocus}
      />

      {/* ---- fragments, outermost first (paint order = nesting order) ----
          The BOX stays decoration (pointer-events-none — a fragment can
          cover half the diagram, and a giant click target would swallow
          every message inside it). What IS clickable, precisely: the kind
          chip (focus the whole fragment) and each branch's guard label
          (focus that branch) — small, labelled, and exactly where the eye
          reads "this is the alt / this is the [card accepted] case". */}
      {layout.fragments.map((fragment) => (
        <g
          key={fragment.id}
          className={cn(
            "af-seq-dimmable",
            fragmentDimmed(fragment) && "af-seq-dim",
          )}
        >
          <g className="pointer-events-none">
            <rect
              x={fragment.x}
              y={fragment.y}
              width={fragment.width}
              height={fragment.height}
              rx={8}
              fill="var(--canvas)"
              fillOpacity={0.5}
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
            hitWidth={38}
            hitHeight={22}
            onFocus={() => onFocusFragment(fragment.id, null)}
          >
            <rect
              className="af-seq-chip"
              x={fragment.x}
              y={fragment.y}
              width={34}
              height={18}
              rx={6}
              fill="var(--secondary)"
              stroke="var(--border)"
            />
            <text
              x={fragment.x + 17}
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
              hitX={fragment.x + 40}
              hitY={fragment.y - 2}
              hitWidth={
                estimateTextWidth(`[${fragment.label}]`, SEQ.fragmentFontSize) +
                4
              }
              hitHeight={22}
              onFocus={() => onFocusFragment(fragment.id, 0)}
            >
              <text
                className="af-seq-guard"
                x={fragment.x + 42}
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
      ))}

      {/* ---- lifelines + participant headers ---- */}
      {layout.participants.map((participant) => (
        <ParticipantColumn
          key={participant.id}
          participant={participant}
          layout={layout}
          dimmed={participantDimmed(participant.id)}
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
          <text
            x={note.x + note.width / 2}
            y={note.y + note.height / 2 + 4}
            textAnchor="middle"
            fontSize={SEQ.noteFontSize}
            fill="var(--foreground)"
          >
            {note.text}
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
  onFocus,
  onKeyDown,
}: {
  participant: LaidParticipant;
  layout: SequenceLayout;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  const { x, headerWidth } = participant;
  const boxTop =
    SEQ.marginTop + (participant.kind === "actor" ? SEQ.actorGlyphHeight : 0);
  const boxHeight = layout.headerHeight - (boxTop - SEQ.marginTop);
  const isActor = participant.kind === "actor";
  // Actors take the PERSON role tokens, participants the neutral node pair —
  // the same role→token indirection node-colors.ts uses, at sequence scale.
  const fill = isActor ? "var(--node-person)" : "var(--node)";
  const strokeColor = isActor
    ? "var(--node-person-border)"
    : "var(--node-border)";

  return (
    <g
      className={cn(
        "af-seq-participant af-seq-dimmable",
        dimmed && "af-seq-dim",
      )}
    >
      <line
        x1={x}
        y1={layout.lifelineTop}
        x2={x}
        y2={layout.lifelineBottom}
        stroke="var(--border)"
        strokeWidth={1.25}
        strokeDasharray="4 4"
      />
      {isActor ? (
        // A minimal stick figure over the box — the actor/participant
        // distinction the model preserves must be visible, not just stored.
        <g stroke={strokeColor} strokeWidth={1.5} fill="none">
          <circle cx={x} cy={SEQ.marginTop + 5} r={4.5} />
          <path
            d={`M ${x} ${SEQ.marginTop + 9.5} v 7 M ${x - 6} ${SEQ.marginTop + 12} h 12`}
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
        fill={fill}
        stroke={strokeColor}
        strokeWidth={1.25}
      />
      <text
        x={x}
        y={
          boxTop +
          (participant.technology === undefined
            ? boxHeight / 2 + 4
            : boxHeight / 2 - 3)
        }
        textAnchor="middle"
        fontSize={SEQ.nameFontSize}
        fontWeight={600}
        fill="var(--node-foreground)"
      >
        {participant.name}
      </text>
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
        y={SEQ.marginTop}
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
   * Bounding: message rows are 44px tall with the arrow mid-row, so this
   * row's territory is y±22. The line band is y±10; the label band
   * (y−24 … y−4, width from the layout's own reserved `labelWidth`) hugs the
   * text and stops 10px short of the arrow above (its line band ends at
   * y−34) — close together, never overlapping. Self-messages get the loop's
   * bounding box plus the label hanging to its right.
   */
  const w = message.labelWidth;
  const hitPath = self
    ? `M ${fromX - 4} ${y - 10} H ${fromX + SEQ.selfLoopWidth + 10} V ${y + SEQ.selfLoopHeight + 10} H ${fromX - 4} Z ` +
      `M ${labelX - 2} ${y + SEQ.selfLoopHeight / 2 - 12} H ${labelX + w} V ${y + SEQ.selfLoopHeight / 2 + 10} H ${labelX - 2} Z`
    : `M ${Math.min(fromX, toX) - 6} ${y - 10} H ${Math.max(fromX, toX) + 6} V ${y + 10} H ${Math.min(fromX, toX) - 6} Z ` +
      `M ${labelX - w / 2} ${y - 24} H ${labelX + w / 2} V ${y - 4} H ${labelX - w / 2} Z`;

  const ariaLabel = `Step ${message.step}: ${message.from} to ${message.to}, ${kind}${self ? ", self-message" : ""} — ${message.label}`;

  return (
    <g
      className={cn("af-seq-msg af-seq-dimmable", dimmed && "af-seq-dim")}
      data-focused={focused || undefined}
      data-animate={animateRank !== null ? animateToken : undefined}
      // The rank rides along as a custom property so the stylesheet can turn
      // it into a delay (`rank × --seq-stagger`) without a per-element
      // inline millisecond — durations stay owned by lib/motion.ts.
      style={
        animateRank !== null
          ? ({ "--seq-rank": animateRank } as React.CSSProperties)
          : undefined
      }
    >
      {kind === "reply" ? (
        /* Replies FADE (dashed from frame one) — see sequence-motion.css for
           why they cannot share the dashoffset draw. The "6 5" geometry is
           MIRRORED by .af-seq-idle--reply (the idle overlay rides these
           exact dashes) — change one, change the other. */
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
          pathLength={1}
        />
      )}

      {/* The IDLE DRIFT — the resting marching dash, deliberately the same
          construction as the C4 canvas's drift (viewer-edge.tsx): an OVERLAY
          copy of the line, never the base stroke, because the base dash
          pattern here carries meaning (reply = dashed) that motion must not
          borrow. On solid bases `pathLength={100}` makes the stylesheet's
          dash maths percentages of THIS path, so short hops, long spans and
          the self-message loop all show the same rhythm — and since the
          pattern lives in path units it scales cleanly with fit/zoom.
          A REPLY's overlay instead adopts the base's own "6 5" user-unit
          dash geometry (no pathLength — the units must match the base's):
          two patterns at different pitches on one line beat into a shimmer,
          one pitch marching over itself reads as the dashes moving. See
          .af-seq-idle--reply in sequence-motion.css.
          Rendered only while the message is at rest: the focus draw takes
          over on the animating set (two lights on one wire reads as a
          glitch), a focused-and-held message keeps its steady emphasis, and
          a dimmed message is explicitly not what the reader asked about —
          motion would defeat the dimming. With nothing focused that means
          every message drifts. */}
      {animateRank === null && !dimmed && !focused ? (
        kind === "reply" ? (
          <path
            aria-hidden="true"
            className="af-seq-idle af-seq-idle--reply pointer-events-none"
            d={linePath}
          />
        ) : (
          <path
            aria-hidden="true"
            className="af-seq-idle pointer-events-none"
            d={linePath}
            pathLength={100}
          />
        )
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
