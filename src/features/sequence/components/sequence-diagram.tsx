"use client";

/**
 * The read-only sequence diagram: pure SVG drawn from `layoutSequence`'s
 * result. This component computes NO geometry of its own — every x/y it
 * paints comes off the layout, which is what keeps the renderer, the check
 * script and the playback engine agreeing.
 *
 * WHY all-SVG rather than SVG lines + absolutely-positioned DOM text: the two
 * approaches were weighed and DOM text lost on three counts. (1) One
 * coordinate system — mixing means every zoom/resize must keep two layout
 * models in sync, and the house already learned that lesson the hard way in
 * `viewer/export/render-svg.ts`, which is all-SVG for export parity. (2) The
 * dim/emphasis states apply uniformly: one class on one <g> covers a
 * message's line, head AND label, where a DOM overlay needs a parallel
 * class-toggling pass. (3) The diagram scales as one object (`viewBox` +
 * `width: 100%`), so long diagrams shrink coherently instead of text
 * detaching from arrows. The cost — no native text wrapping — is absorbed by
 * the layout's width estimates, which reserve space per label.
 *
 * Interactivity: messages and participant headers are real keyboard-operable
 * controls (role="button", tabIndex, Enter/Space), not bare onClick shapes —
 * the SVG is NOT aria-hidden, and the player adds a text alternative beside
 * it. Clicking the backdrop clears focus.
 */

import { cn } from "@/lib/utils";

import type {
  LaidMessage,
  LaidParticipant,
  SequenceLayout,
} from "../lib/layout";
import { SEQ } from "../lib/layout";

/* -------------------------------------------------------------------------- */
/* Focus model                                                                  */
/* -------------------------------------------------------------------------- */

export type SequenceFocus =
  | { kind: "message"; step: number }
  | { kind: "participant"; id: string }
  | null;

export interface SequenceDiagramProps {
  layout: SequenceLayout;
  title: string;
  /** Messages are numbered on the canvas when the file says `autonumber`. */
  autonumber: boolean;
  /** Current playback step, 0..stepCount. Steps ≤ this are visible. */
  step: number;
  focus: SequenceFocus;
  onFocusMessage: (step: number) => void;
  onFocusParticipant: (id: string) => void;
  onClearFocus: () => void;
}

type Reveal = "shown" | "new" | "pending";

function revealOfMessage(messageStep: number, step: number): Reveal {
  if (messageStep < step) return "shown";
  if (messageStep === step) return "new";
  return "pending";
}

/** Everything outside the focus set recedes; the set keeps full strength. */
function isDimmed(
  focus: SequenceFocus,
  element:
    | { type: "message"; message: LaidMessage }
    | { type: "participant"; id: string }
    | { type: "note"; participants: readonly string[] }
    | { type: "scaffold" }
    | { type: "activation"; participantId: string },
): boolean {
  if (focus === null) return false;
  if (focus.kind === "message") {
    switch (element.type) {
      case "message":
        return element.message.step !== focus.step;
      case "participant":
        return false; // resolved by the caller, which knows the focused ends
      case "activation":
        return true;
      default:
        return true;
    }
  }
  // participant focus
  switch (element.type) {
    case "message":
      return (
        element.message.from !== focus.id && element.message.to !== focus.id
      );
    case "participant":
      return element.id !== focus.id;
    case "note":
      return !element.participants.includes(focus.id);
    case "activation":
      return element.participantId !== focus.id;
    default:
      return true;
  }
}

/* -------------------------------------------------------------------------- */
/* The component                                                                */
/* -------------------------------------------------------------------------- */

export function SequenceDiagram({
  layout,
  title,
  autonumber,
  step,
  focus,
  onFocusMessage,
  onFocusParticipant,
  onClearFocus,
}: SequenceDiagramProps): React.JSX.Element {
  const focusedMessage =
    focus?.kind === "message"
      ? (layout.messages.find((m) => m.step === focus.step) ?? null)
      : null;

  const participantDimmed = (id: string): boolean => {
    if (focus === null) return false;
    if (focus.kind === "participant") return id !== focus.id;
    // Message focus: the two endpoints stay lit with their message.
    return focusedMessage === null
      ? false
      : focusedMessage.from !== id && focusedMessage.to !== id;
  };

  /**
   * Activation bars GROW with playback: a bar revealed at step N is drawn
   * only down to the frontier of the current step, so work-in-progress reads
   * as still in progress. At the final step the clamp lifts entirely.
   */
  const frontierY =
    step >= layout.stepCount
      ? Number.POSITIVE_INFINITY
      : step > 0
        ? (layout.yByStep[step - 1] ?? 0) + 12
        : 0;

  const keyActivate =
    (action: () => void) => (event: React.KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        // Stop the player's space-= play/pause shortcut from also firing.
        event.stopPropagation();
        action();
      }
    };

  return (
    <svg
      viewBox={`${layout.minX} 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label={`Sequence diagram: ${title}. ${layout.participants.length} participants, ${layout.stepCount} messages. A text listing of every step follows the diagram.`}
      className="block h-auto max-w-full"
      style={{ maxHeight: "100%" }}
    >
      {/* Backdrop — clicking empty space clears focus. Not a button: it is
          the ABSENCE of a target, and tabbing onto "nothing" would be noise
          (Escape already covers keyboard users, in the player). */}
      <rect
        x={layout.minX}
        y={0}
        width={layout.width}
        height={layout.height}
        fill="transparent"
        onClick={onClearFocus}
      />

      {/* ---- fragments, outermost first (paint order = nesting order) ---- */}
      {layout.fragments.map((fragment, index) => (
        <g
          key={`frag-${index}`}
          className={cn(
            "af-seq-reveal af-seq-dimmable pointer-events-none",
            isDimmed(focus, { type: "scaffold" }) && "af-seq-dim",
          )}
          data-reveal={fragment.revealStep <= step ? "shown" : "pending"}
        >
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
          {/* Kind chip + guard label in the label band. */}
          <rect
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
          {fragment.label !== undefined ? (
            <text
              x={fragment.x + 42}
              y={fragment.y + 13}
              fontSize={SEQ.fragmentFontSize}
              fontStyle="italic"
              fill="var(--muted-foreground)"
            >
              [{fragment.label}]
            </text>
          ) : null}
          {fragment.dividers.map((divider, dividerIndex) => (
            <g
              key={`div-${dividerIndex}`}
              className="af-seq-reveal"
              data-reveal={divider.revealStep <= step ? "shown" : "pending"}
            >
              <line
                x1={fragment.x}
                y1={divider.y}
                x2={fragment.x + fragment.width}
                y2={divider.y}
                stroke="var(--node-border)"
                strokeWidth={1}
                strokeDasharray="5 4"
              />
              {divider.label !== undefined ? (
                <text
                  x={fragment.x + 10}
                  y={divider.y - 5}
                  fontSize={SEQ.fragmentFontSize}
                  fontStyle="italic"
                  fill="var(--muted-foreground)"
                >
                  [{divider.label}]
                </text>
              ) : null}
            </g>
          ))}
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

      {/* ---- activation bars (over lifelines, under arrows) ---- */}
      {layout.activations.map((bar, index) => {
        const bottom = Math.min(bar.y1, Math.max(frontierY, bar.y0 + 6));
        return (
          <rect
            key={`act-${index}`}
            className={cn(
              "af-seq-reveal af-seq-dimmable pointer-events-none",
              isDimmed(focus, {
                type: "activation",
                participantId: bar.participantId,
              }) && "af-seq-dim",
            )}
            data-reveal={bar.revealStep <= step ? "shown" : "pending"}
            x={bar.x}
            y={bar.y0}
            width={bar.width}
            height={Math.max(0, bottom - bar.y0)}
            fill="var(--secondary)"
            stroke="var(--node-border)"
            strokeWidth={1}
            rx={2}
          />
        );
      })}

      {/* ---- notes ---- */}
      {layout.notes.map((note, index) => (
        <g
          key={`note-${index}`}
          className={cn(
            "af-seq-reveal af-seq-dimmable pointer-events-none",
            isDimmed(focus, {
              type: "note",
              participants: note.participants,
            }) && "af-seq-dim",
          )}
          data-reveal={note.revealStep <= step ? "shown" : "pending"}
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
          reveal={revealOfMessage(message.step, step)}
          focused={focus?.kind === "message" && focus.step === message.step}
          dimmed={isDimmed(focus, { type: "message", message })}
          onFocus={() => onFocusMessage(message.step)}
          onKeyDown={keyActivate(() => onFocusMessage(message.step))}
        />
      ))}
    </svg>
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
      {/* The whole header is the participant's click/keyboard target. */}
      <rect
        className="af-seq-hit"
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
  reveal,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  message: LaidMessage;
  autonumber: boolean;
  reveal: Reveal;
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

  const ariaLabel = `Step ${message.step}: ${message.from} to ${message.to}, ${kind}${self ? ", self-message" : ""} — ${message.label}`;

  return (
    <g
      className={cn("af-seq-msg af-seq-dimmable", dimmed && "af-seq-dim")}
      data-reveal={reveal}
      data-focused={focused || undefined}
      // A pending message must not be reachable at all — it has not happened.
      style={
        reveal === "pending" ? { opacity: 0, pointerEvents: "none" } : undefined
      }
    >
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
          pathLength={1}
        />
      )}

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
        className="af-seq-hit"
        d={linePath}
        role="button"
        // A pending message has not happened yet: unreachable by Tab and
        // invisible to AT, not merely transparent.
        tabIndex={reveal === "pending" ? -1 : 0}
        aria-hidden={reveal === "pending" || undefined}
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
