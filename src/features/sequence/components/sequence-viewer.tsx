"use client";

/**
 * The sequence VIEWER: layout + focus, composed around the pure
 * `SequenceDiagram` renderer. This component owns every piece of interaction
 * state; the renderer below it stays a function of (layout, focus).
 *
 * THE DIAGRAM IS COMPLETE FROM FIRST PAINT. There is no playback: a sequence
 * diagram is a record of what happened, and the record is the content — so
 * the whole story is on screen immediately, and the animation budget is
 * spent where it answers a question the user just asked:
 *
 *   - Clicking a MESSAGE (its arrow OR its label — one hit target covers
 *     both) re-draws that one arrow (the stroke-dashoffset draw in
 *     sequence-motion.css) and holds it emphasised; the DETAILS DOCK (a
 *     side panel on the diagram's right, a bottom sheet below `md`) names
 *     sender and receiver with their technologies, the message's own
 *     technology, kind, `Message N of M`, and the fragment guard path it
 *     sits inside (`alt [card accepted] › par [receipt]`).
 *   - Clicking a PARTICIPANT re-draws its whole message set in step order,
 *     lightly staggered so it reads as one gesture; the dock lists every
 *     message it takes part in, each one a button that re-focuses it.
 *   - Clicking a FRAGMENT's kind chip re-draws every message in the
 *     fragment — all branches, nested fragments included; clicking a branch
 *     GUARD label re-draws just that branch's flow. The step sets come from
 *     the layout (LaidFragment.steps / .branches), never recomputed here;
 *     the dock names the fragment, the branch, the participants, and the
 *     flow's messages as the same re-focusing buttons.
 *   - Everything outside the focus set recedes (opacity only); Escape — or
 *     clicking empty canvas, or the dock's close button — brings the full
 *     diagram back.
 *
 * THE DOCK IS NOT A MODAL — deliberately. The request behind it said
 * "modal", but the entire point of this view is clicking AROUND the diagram
 * while reading details, and a dialog (focus trap, backdrop, inert page)
 * would forbid exactly that. It is a docked, non-blocking side panel; do
 * not "fix" it into a <dialog>. See the aside in the render for how it
 * avoids reflowing the diagram when it opens.
 *
 * Re-clicking a focused target REPLAYS its animation: every focus gesture
 * bumps `focusNonce`, and the diagram maps the nonce's parity onto one of
 * two identical keyframe animations — see the `focusNonce` prop in
 * sequence-diagram.tsx for why parity rather than the raw number.
 *
 * REDUCED MOTION costs this model nothing: the complete diagram was already
 * the resting state. The focus draw simply does not animate (every `--seq-*`
 * duration is 0 — see lib/motion.ts); dimming and the detail panel are
 * instant, equally meaningful state changes.
 *
 * State discipline: focus is VALIDATED at read time (`rawFocus` may point at
 * a message or participant a re-parse removed) rather than synchronised by
 * effects — no setState in an effect body, per the same eslint rule
 * `editor/components/view-mode-link.tsx` documents. The only state writes
 * happen in event handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  Columns3,
  EyeOff,
  HelpCircle,
  ListOrdered,
  MousePointerClick,
  Pencil,
  Plus,
  Scan,
  SquareMinus,
  Trash2,
  UserMinus,
  UserPlus,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import {
  sequenceArrowPhrase,
  SEQUENCE_HEAD_STYLE_MEANING,
  SEQUENCE_HEAD_STYLES,
  SEQUENCE_LINE_STYLE_MEANING,
  SEQUENCE_LINE_STYLES,
} from "@/types";
import type {
  SequenceItemPath,
  SequenceLabFile,
  SequenceHeadStyle,
  SequenceLineStyle,
  SequenceMessageRevision,
  SequenceParticipantKind,
  SequenceParticipantRevision,
} from "@/types";
import {
  readIdleMotion,
  useIdleMotion,
  useReducedMotion,
  writeIdleMotion,
} from "@/lib/idle-motion";
import { CopyButton } from "@/components/ui/copy-button";
import { Tour, useTour, type TourStep } from "@/components/ui/tour";
import { IconStyleToggle } from "@/components/ui/icon-style-toggle";
import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import { orAbsent } from "@/lib/absent";
import { useModKey } from "@/lib/mod-key";
import { cn } from "@/lib/utils";

import type { LaidMessage } from "../lib/layout";
import { messagePathForStep } from "../lib/address";
import {
  armingCancelled,
  armingPrompt,
  ARMING_PROMPT_CLASS,
} from "../lib/arming-prompt";
import {
  SEQUENCE_MOUSE_GESTURES,
  SEQUENCE_MOUSE_GUIDE,
  SEQUENCE_MOUSE_GUIDE_CAVEAT,
  SEQUENCE_READ_ONLY_HINT,
  type SequenceGuideIcon,
} from "../lib/mouse-guide";
import {
  CANVAS_DRAG_THRESHOLD,
  messageReorderRange,
  messageReorderStepRange,
  messageSlotForStep,
  participantReorderRange,
} from "../lib/reorder";
import {
  collapseSequence,
  dependenciesOf,
  hiddenParticipants,
} from "../lib/collapse";
import { layoutSequence } from "../lib/layout";
import { sequenceMarchState, sequenceMotionVars } from "../lib/motion";
import type {
  SequenceFocus,
  SequenceLifelinePick,
  SequenceReorder,
} from "./sequence-diagram";
import { resolveFocusSteps, SequenceDiagram } from "./sequence-diagram";

/* -------------------------------------------------------------------------- */
/* Editing                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What a host must be able to do for this viewer to offer editing at all.
 *
 * ADDRESSES, NOT STEP NUMBERS, cross this boundary. A step is a layout ordinal
 * over whatever is being DRAWN, which is the collapsed file while a lifeline is
 * folded — so a step number does not name a line in the reader's document.
 * `lib/address.ts` resolves the one into the other, on this side of the
 * boundary, and the host receives something it can splice by.
 *
 * NOTHING HERE RETURNS ANYTHING. The viewer does not learn whether an edit
 * landed; the host re-parses the patched text and hands back a new `file`, and
 * this component re-renders from it. That is the same one-model rule the C4
 * canvas follows — the text is the authority, not the gesture's intent.
 */
export interface SequenceEditHandlers {
  onReviseMessage: (
    path: SequenceItemPath,
    revision: SequenceMessageRevision,
  ) => void;
  onReviseParticipant: (
    participantId: string,
    revision: SequenceParticipantRevision,
  ) => void;
  /** `after === null` appends to the end of the flow. */
  onInsertMessage: (
    after: SequenceItemPath | null,
    from: string,
    to: string,
  ) => void;
  /** Send an existing message between two other lifelines. */
  onRepointMessage: (path: SequenceItemPath, from: string, to: string) => void;
  /**
   * Move a message EARLIER OR LATER, to `toIndex` among its own siblings.
   *
   * AN INDEX, NOT A DELTA, and not a step number. A delta would make the host
   * re-derive where it landed, giving two answers to "which slot"; a step
   * number is a depth-first ordinal over the whole tree and does not name a
   * position in one branch. `messageSlotForStep` is the one conversion, and it
   * lives beside the range the drag was offered so the two cannot disagree.
   */
  onReorderMessage: (path: SequenceItemPath, toIndex: number) => void;
  onDeleteMessage: (path: SequenceItemPath) => void;
  /** Move a lifeline's COLUMN, to `toIndex` in the declaration order. */
  onReorderParticipant: (participantId: string, toIndex: number) => void;
  onDeleteParticipant: (participantId: string) => void;
  /** Appends a placeholder lifeline; the host picks its id and name. */
  onInsertParticipant: () => void;
  /**
   * Turn step numbering on or off — the diagram's one drawing flag, and the
   * only gesture here that is about the WHOLE document rather than an element
   * in it. No argument: the host reads the current state off the text it owns
   * and writes the other one, which keeps the "is it on" question with the
   * document rather than with a control that could disagree with it.
   */
  onToggleAutonumber: () => void;
  /*
   * WHY NO `canDelete`, AND NO DISABLED STATE FOR THE REMOVE CONTROLS. Both
   * deletes can be refused — a message carrying an activation flag, a lifeline
   * messages still point at — and the refusal has a SENTENCE with a count in
   * it. That sentence is the host's to say: it is the host that owns the
   * document, the refusal predicates and the one live region, and asking this
   * component to mirror the predicate so it could grey a button out would be a
   * second authority on "is this deletable" free to disagree with the one that
   * decides. So the control is always live, and pressing it either deletes or
   * explains. That is the same verdict the C4 canvas reached for a node that
   * owns a child diagram.
   */
}

/**
 * The armed two-click gesture, as the viewer holds it.
 *
 * A DISCRIMINATED UNION rather than one shape with an optional `path`, because
 * the two purposes need different things to be true: an insert may legitimately
 * have no anchor (it appends), while a repoint without an address is not a
 * repoint. Making `path` optional would let the second case compile.
 */
type Arming =
  | { purpose: "insert"; from: string | null }
  | {
      purpose: "repoint";
      from: string | null;
      /** The message being moved, captured when the gesture was armed. */
      path: SequenceItemPath;
      /** Its step at arm time — for the indicator's row and the wording. */
      step: number;
    };

/* -------------------------------------------------------------------------- */
/* The viewer                                                                   */
/* -------------------------------------------------------------------------- */

export function SequenceViewer({
  file,
  onAnnounce,
  extraTourSteps,
  tour: tourEnabled = true,
  edit,
  lockSlot,
}: {
  file: SequenceLabFile;
  /**
   * Where focus announcements go. The viewer OWNS no live region: the page
   * hosting it (the playground) renders the single polite region, and this
   * prop plumbs focus messages into it — two polite regions updated near
   * each other race, and the loser's announcement is swallowed. The host
   * owns the region because it renders unconditionally (this viewer can be
   * replaced by the seed-failure fallback) and already announces parse and
   * immersive state.
   */
  onAnnounce: (message: string) => void;
  /**
   * Steps appended to the viewer's own tour. The viewer only teaches controls
   * it renders (focus, fold, zoom); immersive mode and the source pane belong
   * to the playground around it, so their steps arrive from there — the
   * example view passes nothing and its tour honestly ends at zoom. One
   * storage key covers every host: the tour is about the viewer, not a route.
   */
  extraTourSteps?: readonly TourStep[];
  /**
   * Whether this viewer offers the tour at all. On by default — every page
   * that exists to SHOW a flow wants it.
   *
   * `false` is for a host that embeds the viewer as EVIDENCE rather than as
   * the destination — a preview beside something else. A card that opened
   * itself over a preview would teach the wrong page's controls, and would
   * count as the reader's one first visit, spending the auto-show somewhere
   * it does not apply.
   */
  tour?: boolean;
  /**
   * Present only when this host can WRITE the document back — the playground
   * with an `.alab` sequence document and the canvas lock off. Absent is the
   * default and is what every read-only host gets, so a viewer embedded as
   * evidence renders no editing chrome without being told not to.
   *
   * PRESENCE IS "EDITING IS ON RIGHT NOW", not "editing is possible here", and
   * the two are different questions — PR #69 landed that distinction on
   * `ViewerShell` after a locked diagram grew a button offering to edit it
   * somewhere the reader already was. The CAPABILITY question is the host's:
   * the playground answers it with `canvasEditability(doc, "revise")` and
   * withholds this prop while the canvas is locked. Do not reconflate them by
   * passing handlers plus a disabled flag.
   */
  edit?: SequenceEditHandlers;
  /**
   * The host's canvas-lock control, mounted at the diagram pane's top right.
   * A SLOT because the lock is the HOST'S state — the playground owns the
   * cookie and the wording — and this feature must not import from the
   * playground. Deliberately separate from `edit`, and not gated on it:
   * locking WITHDRAWS the handlers, so a lock that only rendered alongside
   * them could never be pressed to undo itself.
   */
  lockSlot?: React.ReactNode;
}): React.JSX.Element {
  /**
   * COLLAPSED PARTICIPANTS — the ones whose private dependencies are folded
   * away. State is the set of collapse HANDLES, not the set of hidden
   * participants, because the hidden set is derived (lib/collapse.ts) and
   * storing a derived set is how it goes stale: re-parse the document with one
   * dependency removed and a stored hidden set would keep hiding a participant
   * nothing points at any more.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const hidden = useMemo(
    () => hiddenParticipants(file, collapsed),
    [file, collapsed],
  );

  /** The folded-away lifelines, named, for the restore bar. Document order,
   * so the list reads left-to-right like the diagram did. */
  const hiddenList = useMemo(
    () => file.participants.filter((p) => hidden.has(p.id)).map((p) => p.name),
    [file, hidden],
  );

  /**
   * The file as rendered. Everything downstream — layout, the dock, the text
   * listing, focus resolution — reads THIS rather than the parsed file, so a
   * collapsed view is internally consistent by construction instead of by each
   * consumer remembering to skip hidden ids. `collapseSequence` returns the
   * original object when nothing is hidden, so the uncollapsed case allocates
   * nothing and every memo below keeps its identity.
   */
  const shown = useMemo(() => collapseSequence(file, hidden), [file, hidden]);

  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutSequence(shown), [shown]);
  const nameById = useMemo(
    () => new Map(file.participants.map((p) => [p.id, p.name])),
    [file],
  );

  const fragmentById = useMemo(
    () => new Map(layout.fragments.map((f) => [f.id, f])),
    [layout],
  );

  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();
  /* Named for the reader's own platform: the bar used to say "ctrl-scroll",
     which on a Mac is the gesture that zooms the operating system. */
  const mod = useModKey();

  /**
   * Focus and its nonce live in ONE state cell because they only ever change
   * together: every focus gesture — including re-focusing the SAME target —
   * bumps the nonce, and the nonce is what lets the diagram restart the draw
   * animation on a repeat click. Splitting them into two states would invite
   * a set-one-forget-the-other bug no compiler could catch.
   */
  const [rawFocus, setRawFocus] = useState<{
    focus: NonNullable<SequenceFocus>;
    nonce: number;
  } | null>(null);

  // Focus is validated at read time, not with a state-sync effect: a
  // re-parse can remove the focused message, participant or fragment, and a
  // focus pointing at nothing must read as no focus.
  const focus: SequenceFocus = (() => {
    if (rawFocus === null) return null;
    const raw = rawFocus.focus;
    switch (raw.kind) {
      case "message":
        return raw.step >= 1 && raw.step <= layout.stepCount ? raw : null;
      case "participant":
        // Against the RENDERED participants, not the parsed ones: collapsing
        // can take a focused participant off the canvas, and a focus on
        // something not drawn dims the whole diagram around nothing.
        return layout.participants.some((p) => p.id === raw.id) ? raw : null;
      case "fragment": {
        const fragment = fragmentById.get(raw.id);
        if (fragment === undefined) return null;
        return raw.branch === null || raw.branch < fragment.branches.length
          ? raw
          : null;
      }
    }
  })();

  /* ---- focus ------------------------------------------------------------- */

  /**
   * Toggling one handle. Collapsing announces WHAT went away by name: the
   * diagram visibly shrinks, and a change that large with no explanation reads
   * as a bug rather than a fold.
   */
  const handleToggleCollapse = useCallback(
    (id: string) => {
      // Folding renumbers the steps — the layout numbers what it draws — so a
      // held message focus would silently come to mean a DIFFERENT message.
      // Dropping it is the honest outcome; the alternative is a selection that
      // quietly moved.
      setRawFocus(null);
      const next = new Set(collapsed);
      if (next.has(id)) {
        next.delete(id);
        const names = [...dependenciesOf(file, id)]
          .map((dep) => nameById.get(dep) ?? dep)
          .join(", ");
        onAnnounce(`${nameById.get(id) ?? id} expanded — showing ${names}.`);
      } else {
        next.add(id);
        const deps = [...hiddenParticipants(file, new Set([...collapsed, id]))]
          .map((dep) => nameById.get(dep) ?? dep)
          .join(", ");
        onAnnounce(`${nameById.get(id) ?? id} collapsed — hiding ${deps}.`);
      }
      setCollapsed(next);
    },
    [collapsed, file, nameById, onAnnounce],
  );

  /** The one way back out of every fold at once. */
  const handleShowAll = useCallback(() => {
    setRawFocus(null);
    setCollapsed(new Set());
    onAnnounce("Every participant is showing again.");
  }, [onAnnounce]);

  /**
   * Which participants are worth offering a control on, and how many each
   * would fold. Computed from the FULL file so the number on a collapsed card
   * still says how many are behind it.
   */
  const dependencyCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const participant of file.participants) {
      const size = dependenciesOf(file, participant.id).size;
      if (size > 0) counts.set(participant.id, size);
    }
    return counts;
  }, [file]);

  /* ---- the tour ------------------------------------------------------------ */

  const tour = useTour(SEQUENCE_TOUR_KEY);
  // The fold step rides the same condition as the hint bar's fold clause: the
  // `−` glyph only exists on cards with private dependencies, and a tour step
  // naming a control that is not on screen sends the reader hunting.
  const tourSteps = useMemo<readonly TourStep[]>(
    () => [
      FOCUS_TOUR_STEP,
      ...(dependencyCount.size > 0 ? [FOLD_TOUR_STEP] : []),
      ...(edit !== undefined ? [EDIT_TOUR_STEP] : []),
      ZOOM_TOUR_STEP,
      ...(extraTourSteps ?? []),
    ],
    [dependencyCount, extraTourSteps, edit],
  );

  const handleFocusMessage = useCallback(
    (focusedStep: number) => {
      setRawFocus((prev) => ({
        focus: { kind: "message", step: focusedStep },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const message = layout.messages.find((m) => m.step === focusedStep);
      if (message !== undefined) {
        onAnnounce(
          `Message ${focusedStep} of ${layout.stepCount}: ${nameById.get(message.from) ?? message.from} to ${nameById.get(message.to) ?? message.to} — ${message.label}.` +
            /* The `desc` is READ OUT here, not merely pointed at: the dock is
               an unfocused region, so a sighted reader sees the detail
               appear and a screen-reader user would otherwise have to go
               hunting for it. This is the one place the full text belongs —
               the hit target's name deliberately only says it exists. */
            (message.description !== undefined
              ? /* Authored line breaks become sentence breaks: a screen
                   reader runs a bare newline into the next word, so
                   "…/orders body { cartId }" would arrive as one phrase. */
                ` Details: ${message.description.split("\n").join(". ")}.`
              : "") +
            " Details open beside the diagram; Escape clears focus.",
        );
      }
    },
    [layout, nameById, onAnnounce],
  );

  const handleFocusParticipant = useCallback(
    (id: string) => {
      setRawFocus((prev) => ({
        focus: { kind: "participant", id },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const steps = layout.messages
        .filter((m) => m.from === id || m.to === id)
        .map((m) => m.step);
      onAnnounce(
        `Focused participant ${nameById.get(id) ?? id} — takes part in ${steps.length} of ${layout.stepCount} messages${steps.length > 0 ? ` (steps ${steps.join(", ")})` : ""}. Escape clears focus.`,
      );
    },
    [layout, nameById, onAnnounce],
  );

  const handleFocusFragment = useCallback(
    (id: string, branch: number | null) => {
      setRawFocus((prev) => ({
        focus: { kind: "fragment", id, branch },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const fragment = layout.fragments.find((f) => f.id === id);
      if (fragment === undefined) return;
      const steps =
        branch === null
          ? fragment.steps
          : (fragment.branches[branch]?.steps ?? []);
      const guard =
        branch === null ? undefined : fragment.branches[branch]?.label;
      onAnnounce(
        `Focused ${fragment.kind} fragment${guard !== undefined ? ` branch [${guard}]` : ""} — ${steps.length} of ${layout.stepCount} messages${steps.length > 0 ? ` (steps ${steps.join(", ")})` : ""}. Details open beside the diagram; Escape clears focus.`,
      );
    },
    [layout, onAnnounce],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) onAnnounce("Focus cleared.");
    setRawFocus(null);
  }, [focus, onAnnounce]);

  /**
   * Closing the dock with its close BUTTON needs one extra step Escape does
   * not: the button unmounts along with the dock, and keyboard focus would
   * strand on <body>. Re-home it on the diagram region — tabbable, and the
   * owner of the arrow-key shortcuts, so "close details, keep exploring"
   * stays a pure keyboard flow. Escape needs no re-homing because the key
   * never moved DOM focus into the dock in the first place. (Opening the
   * dock deliberately does NOT move DOM focus either — stealing it would
   * break exactly the click-around exploration the dock exists to serve.)
   */
  const diagramRegionRef = useRef<HTMLDivElement>(null);
  const handleCloseDock = useCallback(() => {
    handleClearFocus();
    diagramRegionRef.current?.focus();
  }, [handleClearFocus]);

  /**
   * THE BACKDROP: the whole diagram pane, not a rect inside the SVG.
   *
   * Clicking empty canvas is the mouse equivalent of Escape, and it used to
   * miss most of the empty canvas. The old backdrop was a `<rect>` sized to
   * the viewBox, which is not the same region as "the part of the pane with no
   * diagram in it": in fit mode `preserveAspectRatio="meet"` letterboxes the
   * drawing, leaving a wide margin either side of a tall flow (on the bundled
   * example, ~170px per side) that belonged to the SVG element but to no rect;
   * and at a small zoom — the scale clamps down to 0.1 — the drawing is a
   * postage stamp in a pane that is almost entirely gutter. Clicks anywhere in
   * that space hit the pane and did nothing, so the diagram looked stuck in a
   * focused state until the user found Escape or the dock's close button.
   *
   * Moving it to the pane covers all of it, including the pane's own padding,
   * and needs no hit geometry to be maintained. What makes it safe is that
   * every interactive element inside the SVG stops propagation on click —
   * messages, participant headers, footer cards, fragment chips and guards —
   * so a click that reaches here is one that landed on nothing.
   *
   * The guard is for SCROLLBARS. A click on a scroll gutter targets the
   * scrolling element itself, so without this, dragging the scrollbar of a
   * zoomed diagram would clear focus on release — the user asked to pan, not to
   * deselect. `clientWidth`/`clientHeight` exclude the scrollbars while the
   * bounding rect includes them, and the difference is exactly the gutter.
   */
  /**
   * Drag-to-pan's state, declared before the handlers that read it: the click
   * handler consults `panSuppressesClick`, the pointer handlers write it, and
   * declaring the refs after their first reader trips the compiler's
   * immutability rule. See the drag-to-pan block below for the design.
   */
  const panState = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const panSuppressesClick = useRef(false);
  const [panning, setPanning] = useState(false);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // A drag that panned the view ends in a click; that click means "I
      // finished panning", not "clear focus". See handlePointerUp.
      if (panSuppressesClick.current) {
        panSuppressesClick.current = false;
        return;
      }
      const pane = event.currentTarget;
      const rect = pane.getBoundingClientRect();
      if (
        event.clientX - rect.left > pane.clientWidth ||
        event.clientY - rect.top > pane.clientHeight
      ) {
        return;
      }
      handleClearFocus();
    },
    [handleClearFocus],
  );

  /* ---- drag to pan ----------------------------------------------------------
   * Past fit, the pane is a window onto a bigger drawing, and reaching for a
   * scrollbar to move a canvas is the wrong gesture — every map and every node
   * editor lets you grab the thing and move it. The pane is a real scroll
   * container, so this drives `scrollLeft`/`scrollTop` rather than inventing a
   * transform layer: wheel, trackpad, scrollbars, keyboard and this all stay
   * one coordinate system, and the focus-follows-scroll nudge keeps working
   * without knowing panning exists.
   *
   * Four deliberate limits:
   *   - MOUSE ONLY. Touch already pans natively and far better; capturing
   *     pointers there would fight the platform and break pinch-zoom.
   *   - PRIMARY BUTTON on EMPTY CANVAS. A drag starting on a message or a
   *     participant is left alone so those clicks stay exactly as precise as
   *     they were — the interactive elements own their own gestures.
   *   - ONLY WHEN THERE IS SOMEWHERE TO GO, tested against real overflow at
   *     pointer-down. In fit mode, and at a zoom small enough that the drawing
   *     fits anyway, a drag must do nothing rather than fake resistance.
   *   - A MOVED drag swallows its trailing click, so panning away from a
   *     focused message does not also clear the focus. The threshold comes from
   *     `CANVAS_DRAG_THRESHOLD` rather than a literal, because the reorder drag
   *     in `sequence-diagram.tsx` has to draw the same line between a sloppy
   *     click and a deliberate drag — see the constant for what two numbers
   *     would cost.
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      // Interactive targets keep their own behaviour — see the limits above.
      if ((event.target as Element).closest?.(".af-seq-chrome-hit") != null)
        return;
      const pane = event.currentTarget;
      const scrollable =
        pane.scrollWidth > pane.clientWidth ||
        pane.scrollHeight > pane.clientHeight;
      if (!scrollable) return;
      panState.current = {
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop,
        moved: false,
      };
      setPanning(true);
      // Capture so a fast drag that leaves the pane keeps panning, and so the
      // gesture always ends with a pointerup we hear.
      pane.setPointerCapture(event.pointerId);
      // Stops the browser starting its own drag of the SVG.
      event.preventDefault();
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (state === null) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.abs(dx) + Math.abs(dy) > CANVAS_DRAG_THRESHOLD) {
        state.moved = true;
      }
      const pane = event.currentTarget;
      // Inverted: the content follows the hand, so dragging left reveals what
      // is to the right — grabbing the canvas, not dragging a scrollbar.
      pane.scrollLeft = state.left - dx;
      pane.scrollTop = state.top - dy;
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (state === null) return;
      panState.current = null;
      setPanning(false);
      if (state.moved) panSuppressesClick.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  /* ---- zoom -----------------------------------------------------------------
   * The hand-rolled equivalent of the C4 viewer's camera: `"fit"` (default —
   * the WHOLE flow inside the pane, the sequence answer to fitView) or a
   * numeric scale where 1 = one SVG user unit per CSS pixel. Fit is a MODE,
   * not a stored number, so it keeps holding through resizes and re-parses
   * for free; the number only exists once the user reaches for detail.
   */
  const [zoom, setZoom] = useState<number | "fit">("fit");

  /** The scale fit mode is currently rendering at — measured, because it
   * depends on the pane's live size. Used only as the base for the first
   * +/− step out of fit, so stepping feels continuous rather than jumping
   * to an unrelated absolute scale. */
  const measureFitScale = useCallback((): number => {
    const pane = diagramRegionRef.current;
    if (pane === null) return 1;
    // p-3 padding (12px per side) is outside the wrapper's content box.
    const width = pane.clientWidth - 24;
    const height = pane.clientHeight - 24;
    if (width <= 0 || height <= 0) return 1;
    return Math.min(width / layout.width, height / layout.height);
  }, [layout]);

  /**
   * WHAT THE VIEW WAS CENTRED ON when a zoom started, as a fraction of the
   * scrollable content on each axis. Applied again after the re-render, so a
   * zoom keeps looking at what it was looking at instead of snapping to the
   * top-left corner.
   *
   * Fractions rather than diagram coordinates, because the two zoom states
   * measure differently — in fit mode the drawing is letterboxed inside an
   * SVG that fills the pane, while at a numeric scale the SVG *is* the
   * drawing — and a fraction is the same quantity in both. It also gives the
   * fit → zoom step the right answer for free: fit has no overflow, so its
   * centre fraction is exactly 0.5, and staying at 0.5 after the zoom is what
   * "keep it centred" means.
   */
  const zoomAnchor = useRef<{
    cx: number;
    cy: number;
    /** Where in the PANE that content point should still sit afterwards.
     * Defaults to the pane's centre; a pinch passes the pointer instead, so
     * the diagram grows around the fingers rather than around the middle. */
    vx: number;
    vy: number;
  } | null>(null);

  const applyZoom = useCallback(
    (
      next: number,
      options: { at?: { x: number; y: number }; announce?: boolean } = {},
    ) => {
      const pane = diagramRegionRef.current;
      if (pane !== null && pane.scrollWidth > 0 && pane.scrollHeight > 0) {
        const vx = options.at?.x ?? pane.clientWidth / 2;
        const vy = options.at?.y ?? pane.clientHeight / 2;
        zoomAnchor.current = {
          cx: (pane.scrollLeft + vx) / pane.scrollWidth,
          cy: (pane.scrollTop + vy) / pane.scrollHeight,
          vx,
          vy,
        };
      }
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      setZoom(clamped);
      if (options.announce !== false) {
        onAnnounce(
          `Zoom ${Math.round(clamped * 100)} percent. Drag or scroll the diagram pane to pan.`,
        );
      }
      return clamped;
    },
    [onAnnounce],
  );

  /**
   * Re-centre on the anchored point once the new scale has laid out. A DOM
   * scroll write in an effect, not state — the same shape as the
   * focus-follows-scroll effect above, and for the same reason: the value
   * depends on geometry that only exists after the commit. Assigning past the
   * scrollable range is safe; the browser clamps, which is exactly right when
   * the new scale leaves an axis with nothing to scroll.
   *
   * Not `useLayoutEffect`, which is the usual reach for "position before paint":
   * every zoom here originates in a click, and React flushes passive effects
   * from a discrete event before yielding to the browser, so there is no frame
   * painted at the stale offset to avoid — while a layout effect would warn on
   * every server render of this client component for nothing.
   */
  useEffect(() => {
    const anchor = zoomAnchor.current;
    if (anchor === null) return;
    zoomAnchor.current = null;
    const pane = diagramRegionRef.current;
    if (pane === null) return;
    pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
    pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
  }, [zoom]);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const current = zoom === "fit" ? measureFitScale() : zoom;
      applyZoom(current * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP));
    },
    [zoom, measureFitScale, applyZoom],
  );

  const applyFit = useCallback(() => {
    setZoom("fit");
    onAnnounce("Diagram fitted to view — the whole flow is on screen.");
  }, [onAnnounce]);

  /* ---- trackpad pinch (two fingers) -----------------------------------------
   * A pinch on a trackpad is delivered as a `wheel` event with `ctrlKey` set —
   * the platform convention every browser follows, and the same signal a mouse
   * sends for ctrl+wheel. Unhandled, the browser applies it to the WHOLE PAGE:
   * the nav, the source pane and the diagram all scaled together, past any
   * limit this view believes in, and a reader who pinched to inspect one arrow
   * had to hunt for the browser's own reset. So the gesture is claimed here and
   * CLAMPED to the same ZOOM_MIN/ZOOM_MAX the pill obeys.
   *
   * A NATIVE listener with `{ passive: false }`, not React's `onWheel`, because
   * preventDefault is the entire point and React attaches wheel handlers
   * passively (where preventDefault does nothing but warn).
   *
   * Only `ctrlKey` is intercepted. A plain two-finger scroll stays the pane's
   * own scrolling, which is how panning already works — the whole zoom model
   * rests on this being a real scroll container.
   *
   * COALESCED PER FRAME. A pinch delivers wheel events far faster than this
   * SVG can re-render, and calling setZoom on each one queues a render per
   * event; the target accumulates in a ref and one rAF commits it, so the
   * scale still tracks the fingers exactly while the DOM is written once a
   * frame. The pending target is also what the NEXT event reads, so a burst
   * inside one frame compounds correctly instead of each event stepping from
   * the same stale base.
   *
   * Announcing is deferred to the END of the gesture (250ms of quiet): a live
   * region fired per frame is unusable, and "Zoom 180 percent" is only news
   * once the fingers stop.
   */
  const pinchTarget = useRef<number | null>(null);
  const pinchFrame = useRef<number | null>(null);
  const pinchIdle = useRef<number | null>(null);

  useEffect(() => {
    const pane = diagramRegionRef.current;
    if (pane === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const base =
        pinchTarget.current ?? (zoom === "fit" ? measureFitScale() : zoom);
      /* Exponential, so a pinch feels the same at 0.2 as at 2 — a linear step
         crawls when zoomed out and lurches when zoomed in. The 0.01 factor is
         tuned to macOS trackpad deltas; the per-event cap keeps a coarse mouse
         wheel (deltaY of ±100 in one tick) from jumping the whole range. */
      const factor = Math.exp(
        -Math.max(-40, Math.min(40, event.deltaY)) * 0.01,
      );
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base * factor));
      pinchTarget.current = next;

      const rect = pane.getBoundingClientRect();
      const at = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      if (pinchFrame.current === null) {
        pinchFrame.current = window.requestAnimationFrame(() => {
          pinchFrame.current = null;
          const target = pinchTarget.current;
          if (target === null) return;
          applyZoom(target, { at, announce: false });
        });
      }

      if (pinchIdle.current !== null) window.clearTimeout(pinchIdle.current);
      pinchIdle.current = window.setTimeout(() => {
        pinchIdle.current = null;
        const settled = pinchTarget.current;
        pinchTarget.current = null;
        if (settled === null) return;
        const atLimit =
          settled <= ZOOM_MIN + 0.001
            ? " Minimum zoom."
            : settled >= ZOOM_MAX - 0.001
              ? " Maximum zoom."
              : "";
        onAnnounce(`Zoom ${Math.round(settled * 100)} percent.${atLimit}`);
      }, 250);
    };

    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pane.removeEventListener("wheel", onWheel);
      if (pinchFrame.current !== null) {
        window.cancelAnimationFrame(pinchFrame.current);
        pinchFrame.current = null;
      }
      if (pinchIdle.current !== null) {
        window.clearTimeout(pinchIdle.current);
        pinchIdle.current = null;
      }
    };
  }, [zoom, measureFitScale, applyZoom, onAnnounce]);

  const handleToggleIdle = useCallback(() => {
    const next = !readIdleMotion();
    writeIdleMotion(next);
    onAnnounce(
      next
        ? "Idle motion on — every message line marches toward its target."
        : "Idle motion off — the diagram holds still until you focus something.",
    );
  }, [onAnnounce]);

  /**
   * FOCUS FOLLOWS SCROLL: clicking a thing must never hide that thing. The
   * dock overlays the pane's right edge (its bottom edge below `md`), so
   * when a freshly focused message or participant sits in the covered
   * strip, nudge the pane's scroll by exactly the overlap. This bites when
   * the pane genuinely scrolls — a numeric zoom, where the SVG is wider than
   * the pane. In fit mode the SVG is exactly pane-sized, so there is nothing
   * to scroll and this is a no-op by arithmetic rather than by a guard (the
   * scrollBy simply has nowhere to go), which is the correct outcome: fit
   * mode must not scroll, because scrolling implies content off-screen and
   * fit's whole promise is that there is none.
   * Runs per focus GESTURE (`rawFocus` includes the nonce, so re-clicks
   * count) in an effect AFTER the commit that mounted the dock, measuring
   * the real dock rect rather than assuming a breakpoint. DOM scrolling
   * only — no state, so the no-setState-in-effects rule holds.
   */
  const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (rawFocus === null) return;
    const pane = diagramRegionRef.current;
    const dock = dockRef.current;
    if (pane === null || dock === null) return;
    const raw = rawFocus.focus;
    let target: Element | null = null;
    if (raw.kind === "message") {
      target = pane.querySelector('.af-seq-msg[data-focused="true"]');
    } else if (raw.kind === "participant") {
      const name = nameById.get(raw.id) ?? raw.id;
      target =
        [
          ...pane.querySelectorAll(".af-seq-participant .af-seq-chrome-hit"),
        ].find(
          (el) => el.getAttribute("aria-label") === `Focus participant ${name}`,
        ) ?? null;
    }
    if (target === null) return;
    const rect = target.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    // Side dock spans the pane's full height; anything shorter is the sheet.
    const isSideDock = dockRect.height >= paneRect.height - 2;
    if (isSideDock) {
      const overlap = rect.right - dockRect.left;
      if (overlap > 0) pane.scrollLeft += overlap + 16;
    } else {
      const overlap = rect.bottom - dockRect.top;
      if (overlap > 0) pane.scrollTop += overlap + 16;
    }
  }, [rawFocus, nameById]);

  /* ---- keyboard ----------------------------------------------------------- */

  /**
   * ESCAPE — rung 2 of the PAGE's ladder (rung 1 is native fullscreen, owned
   * by the browser; rung 3, leaving immersive mode, belongs to the
   * playground shell around this viewer). A WINDOW listener rather than the
   * wrapper's onKeyDown because the rung must fire wherever DOM focus sits —
   * e.g. on the shell's immersive toggle button, which is outside this
   * component — or one press would skip straight to rung 3 with a focus
   * still held.
   *
   * Registered ONCE (empty deps; the changing values are read through refs):
   * a re-registered window listener moves to the BACK of the window's
   * listener order, behind the shell's rung-3 listener, and the ladder would
   * run bottom-up. Child effects run before parent effects, so registering
   * once here guarantees this listener always runs first. preventDefault is
   * the "consumed" signal the shell checks before exiting immersive mode.
   *
   * Form fields are exempt: Escape inside the source textarea belongs to its
   * Tab-escape-hatch (see sequence-playground.tsx), not to diagram focus.
   */
  /**
   * The armed two-click gesture: `null` when disarmed, `from: null` while the
   * sender click is owed, `from: id` while the receiver click is owed.
   *
   * A BUTTON THEN TWO CLICKS, not a drag. A drag from lifeline to lifeline was
   * the obvious alternative and is unavailable: the canvas already owns
   * primary-button drag for panning (four deliberate limits on it in
   * `handlePointerDown`), so a second meaning for the same gesture would make
   * both ambiguous. The modal arm is also the only shape that is reachable
   * from the keyboard, since the lifeline targets become tab stops.
   *
   * TWO PURPOSES, ONE MACHINE. `"repoint"` carries the ADDRESS of the message
   * being moved, captured when the gesture was armed rather than re-read from
   * `focus` when the second click lands. Focus is not frozen while the picker
   * is up — the reader can click bare canvas, which clears it — so a repoint
   * that re-read it would find `null` and silently do nothing, having taken two
   * deliberate clicks. Capturing the address at arm time means the gesture
   * finishes what the reader started or is refused with a reason, never
   * quietly abandoned.
   */
  const [arming, setArming] = useState<Arming | null>(null);

  const disarm = useCallback(
    (announcement: string | null) => {
      setArming(null);
      if (announcement !== null) onAnnounce(announcement);
    },
    [onAnnounce],
  );

  const focusRef = useRef<SequenceFocus>(null);
  const clearFocusRef = useRef(handleClearFocus);
  /* ARMING IS A NEW RUNG, above clearing focus. Escape means "back out of the
     thing I am in the middle of", and while the insert gesture is armed that
     thing is the gesture, not the selection — cancelling both at once would
     lose the step the insert was anchored to along with the mode. */
  const disarmRef = useRef<(() => void) | null>(null);
  // The "latest ref" update lives in an effect (not in render — the
  // react-hooks/refs rule forbids that), which is still always ahead of any
  // keydown: effects flush before the user can press another key.
  useEffect(() => {
    focusRef.current = focus;
    clearFocusRef.current = handleClearFocus;
    disarmRef.current =
      arming === null ? null : () => disarm(armingCancelled(arming.purpose));
  }, [focus, handleClearFocus, arming, disarm]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // rung 1 — browser's turn
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (disarmRef.current !== null) {
        event.preventDefault();
        disarmRef.current();
        return;
      }
      if (focusRef.current === null) return; // nothing to clear — rung 3 may act
      event.preventDefault();
      clearFocusRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- editing ------------------------------------------------------------- */

  /**
   * The MODEL ADDRESS of the focused message, or `null` when it has none.
   *
   * `null` is a real state and the dock renders it as a refusal rather than
   * hiding the form: a fold can leave a drawn message whose object the
   * unfiltered tree no longer holds (see `lib/address.ts`), and a reader who
   * clicked an arrow and got no editor with no explanation would reasonably
   * conclude editing is broken.
   */
  const focusedMessagePath = useMemo(
    () =>
      focus?.kind === "message"
        ? messagePathForStep(file, shown, focus.step)
        : null,
    [file, shown, focus],
  );

  /**
   * WHAT THIS CANVAS WILL LET A DRAG MOVE, or `null` for "nothing".
   *
   * TWO GATES, and the second is the interesting one.
   *
   *   - `edit === undefined` is a read-only or locked canvas; the same gate
   *     every other gesture here rides.
   *   - `shown !== file` is A FOLD IN EFFECT, and reordering must refuse then.
   *     `collapseSequence` renumbers 1..n over the VISIBLE subset, so step 4 of
   *     a folded view and step 4 of the file are different messages, and the
   *     COLUMN indices diverge outright — a hidden lifeline is simply not in
   *     `shown.participants`, so column 2 on screen is column 3 in the
   *     document. `messagePathForStep` rescues a message address by object
   *     identity, but there is no equivalent rescue for a column index, and one
   *     rule for both axes beats two. So the affordance disappears entirely
   *     rather than being offered and refused — which is the same verdict
   *     `focusedMessagePath` reaches for the edit form, said with a control
   *     rather than a sentence.
   *
   *     `shown === file` is the exact predicate rather than a count of hidden
   *     participants, because `collapseSequence` returns its ARGUMENT
   *     UNCHANGED when nothing is folded — the identity IS the fold state, and
   *     a second reading of it could disagree.
   */
  const reorder = useMemo<SequenceReorder | null>(() => {
    if (edit === undefined || shown !== file) return null;
    return {
      messageRange: (step) => {
        const path = messagePathForStep(file, shown, step);
        if (path === null) return null;
        const range = messageReorderStepRange(file, path);
        return range === null ? null : { min: range.min, max: range.max };
      },
      participantRange: (id) => {
        const range = participantReorderRange(file, id);
        return range === null ? null : { min: range.min, max: range.max };
      },
      onDropMessage: (step, toStep) => {
        const path = messagePathForStep(file, shown, step);
        if (path === null) return;
        /* THE ONE CONVERSION from a drawn row to a slot in the model, and it
           lives beside the range the drag was offered so a drop can only ever
           name a slot that range contained. */
        const slot = messageSlotForStep(file, path, toStep);
        if (slot === null) return;
        edit.onReorderMessage(path, slot);
      },
      onDropParticipant: (id, toIndex) => {
        edit.onReorderParticipant(id, toIndex);
      },
    };
  }, [edit, file, shown]);

  /**
   * `⌥` + an arrow, on whatever is focused: up/down moves a MESSAGE in time,
   * left/right moves a LIFELINE'S COLUMN. One slot per press.
   *
   * ONE SLOT AND NOT A JUMP, because that is what makes this the precise route.
   * A drag is aimed and lands wherever the pointer is nearest; a press is
   * counted. Both go through the same handler with a target INDEX, so there is
   * one operation with two ways in rather than two implementations.
   *
   * AT THE END OF THE RUN IT SAYS SO. Pressing up on the first legal slot could
   * do nothing silently, and a key that silently does nothing is
   * indistinguishable from a key that is not wired up — which is the exact
   * report this canvas has already had twice. The sentence names the boundary
   * the reader has reached, and `messageReorderRange` is where "legal slot" is
   * defined, so it cannot disagree with what the drag offers.
   *
   * A FOLD REFUSES HERE, with the fold's own sentence, because `reorder` is
   * `null` then and the viewer is the side that knows why. Every OTHER refusal
   * — a note in the way, a `box` boundary, an activation flag — belongs to the
   * host, which owns the document and already speaks them for the delete and
   * the repoint. One authority per kind of refusal.
   */
  const handleReorderKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const axis =
        event.key === "ArrowUp" || event.key === "ArrowDown"
          ? "message"
          : event.key === "ArrowLeft" || event.key === "ArrowRight"
            ? "participant"
            : null;
      if (axis === null || edit === undefined) return;
      const delta =
        event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;

      if (axis === "message") {
        if (focus?.kind !== "message") return;
        event.preventDefault();
        if (reorder === null) {
          onAnnounce(FOLDED_REORDER_REFUSAL);
          return;
        }
        const path = messagePathForStep(file, shown, focus.step);
        const range = path === null ? null : messageReorderRange(file, path);
        if (path === null || range === null) {
          onAnnounce(
            "This step cannot be moved — its place in the file is ambiguous, or it carries an activation flag. The details panel says which.",
          );
          return;
        }
        const target = range.at + delta;
        if (target < range.min || target > range.max) {
          onAnnounce(
            delta < 0
              ? "This step is already as early as it can go — a note, a fragment or an activation flag is above it."
              : "This step is already as late as it can go — a note, a fragment or an activation flag is below it.",
          );
          return;
        }
        edit.onReorderMessage(path, target);
        return;
      }

      if (focus?.kind !== "participant") return;
      event.preventDefault();
      if (reorder === null) {
        onAnnounce(FOLDED_REORDER_REFUSAL);
        return;
      }
      const range = participantReorderRange(file, focus.id);
      if (range === null) return;
      const target = range.at + delta;
      if (target < range.min || target > range.max) {
        onAnnounce(
          "This lifeline is already at the edge of its box — a box brackets a run of neighbouring lifelines, so moving it further is an edit for the source text.",
        );
        return;
      }
      edit.onReorderParticipant(focus.id, target);
    },
    [edit, file, focus, onAnnounce, reorder, shown],
  );

  /**
   * Arrows walk focus through the messages in model order — the keyboard
   * equivalent of clicking each arrow in turn. From nothing (or from a
   * participant focus, which has no position in the story), both directions
   * land on the FIRST message: "start reading" is the only honest answer to
   * "previous" when there is no current position. (Escape is NOT handled
   * here — it lives on window, above, so the page's Escape ladder works
   * wherever DOM focus sits.)
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      /* ALT + ARROWS REORDER, and it is checked before the plain arrows for the
         obvious reason: the modifier changes what the key MEANS, so a switch
         that fell through to "walk focus" would move the selection instead of
         the step and the reader would never learn the gesture exists.
         Alt (⌥ on a Mac) rather than the platform mod key, deliberately:
         Cmd/Ctrl + Z is already the canvas undo, and Cmd + arrow is a
         line/document jump the OS and the browser both claim.

         THE PRECISE ROUTE, and the one the drag is derived FROM rather than an
         afterthought to it: one press is one slot, so a reader who knows
         exactly where a step belongs never has to aim. `check:sequence` asserts
         a drag of three rows is byte-identical to three presses. */
      if (event.altKey) {
        handleReorderKey(event);
        return;
      }
      if (layout.stepCount === 0) return;
      const current = focus?.kind === "message" ? focus.step : 0;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          handleFocusMessage(Math.min(current + 1, layout.stepCount));
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          handleFocusMessage(current === 0 ? 1 : Math.max(1, current - 1));
          break;
        default:
          break;
      }
    },
    [focus, layout.stepCount, handleFocusMessage, handleReorderKey],
  );

  /**
   * Which element the dock is currently EDITING rather than describing.
   *
   * Keyed by the target rather than a bare boolean so moving focus to another
   * message closes the form instead of pointing it at something new: an open
   * form holds the reader's half-typed text, and silently re-aiming it would
   * commit that text to a message they were not looking at.
   */
  const [editing, setEditing] = useState<
    | { kind: "message"; step: number }
    | { kind: "participant"; id: string }
    | null
  >(null);
  const editingMessage =
    editing?.kind === "message" &&
    focus?.kind === "message" &&
    focus.step === editing.step;
  const editingParticipant =
    editing?.kind === "participant" &&
    focus?.kind === "participant" &&
    focus.id === editing.id;

  /* THE ANNOUNCEMENT AND THE ON-SCREEN PROMPT ARE ONE SENTENCE, from
     `armingPrompt`. Writing it here as well as in the render is what left a
     mouse user with no instruction at all for a release — the module's header
     carries the whole story. The handlers cannot read the rendered value
     (`arming` is set in the same tick), so both call the same function. */
  const handleArmInsert = useCallback(() => {
    setArming({ purpose: "insert", from: null });
    onAnnounce(
      armingPrompt({
        purpose: "insert",
        step: focus?.kind === "message" ? focus.step : null,
        fromName: null,
      }),
    );
  }, [focus, onAnnounce]);

  /**
   * Arm the picker to MOVE the focused message's endpoints.
   *
   * Closes the edit form as it arms, deliberately. The two cannot both be the
   * reader's attention: the form's fields describe the message's wording and
   * the picker is about to change something the form does not show, so leaving
   * the form open would invite an Apply that submits stale wording over the
   * repointed line. Reopening it afterwards is one press of the pencil.
   */
  const handleArmRepoint = useCallback(() => {
    if (focus?.kind !== "message" || focusedMessagePath === null) return;
    setEditing(null);
    setArming({
      purpose: "repoint",
      from: null,
      path: focusedMessagePath,
      step: focus.step,
    });
    onAnnounce(
      armingPrompt({
        purpose: "repoint",
        step: focus.step,
        fromName: null,
      }),
    );
  }, [focus, focusedMessagePath, onAnnounce]);

  /**
   * Change one endpoint from the FORM, without arming anything.
   *
   * THE DISCOVERABLE HALF of the same gesture, and the reason it exists is that
   * the other half was not discoverable at all: the two-click picker is the
   * better gesture once you know it, and a mouse user had no way to find out it
   * was there. Two menus in the panel the reader already has open need no mode,
   * no prompt and no second click.
   *
   * IT ACTS IMMEDIATELY rather than on Apply, and that is not a shortcut — it
   * is what keeps "one text change per gesture" true. Apply submits the
   * message's WORDING through `onReviseMessage`; if endpoints rode along, one
   * press would be two patches, and the second would be computed against a
   * document the first had already replaced. Firing here leaves Apply meaning
   * exactly what it meant before, and the form is not remounted by a repoint
   * (its `key` is the step, which endpoints do not change), so half-typed text
   * in the fields survives.
   *
   * The selects show `message.from` / `message.to` and hold no state of their
   * own, so a refusal simply leaves them reading the document — the host says
   * why in the live region, as it does for the picker.
   */
  const handleRepointFromForm = useCallback(
    (from: string, to: string) => {
      if (edit === undefined || focusedMessagePath === null) return;
      edit.onRepointMessage(focusedMessagePath, from, to);
    },
    [edit, focusedMessagePath],
  );

  /**
   * One lifeline click, for either purpose. The first supplies the sender, the
   * second the receiver and fires the edit — a SELF-message when they are the
   * same lifeline, which is a legal and useful thing to draw, so it is not
   * refused for either gesture.
   *
   * For an INSERT the new message is FOCUSED and opened for editing, at the
   * step it will occupy once the host's re-parse arrives (`after + 1`, or the
   * end). Focus is validated at read time against the new layout, so pointing
   * at a step that does not exist yet costs nothing if the edit is refused — it
   * reads as no focus rather than as a wrong selection.
   */
  const handlePickEnd = useCallback(
    (participantId: string) => {
      if (edit === undefined || arming === null) return;
      if (arming.from === null) {
        setArming({ ...arming, from: participantId });
        onAnnounce(
          armingPrompt({
            purpose: arming.purpose,
            step: arming.purpose === "repoint" ? arming.step : null,
            fromName: nameById.get(participantId) ?? participantId,
          }),
        );
        return;
      }
      /* REPOINT COMPLETES HERE and returns: it has its own address from arm
         time, so none of the focus reasoning below applies to it. The message
         it moves keeps its step number — endpoints do not reorder anything —
         so the focus and the open dock stay pointed at the same step, and the
         reader watches the arrow move under a panel that is still describing
         it. */
      if (arming.purpose === "repoint") {
        const { path, from } = arming;
        setArming(null);
        edit.onRepointMessage(path, from, participantId);
        return;
      }
      /* A MESSAGE FOCUS WITH NO ADDRESS IS REFUSED, not quietly appended.
         `null` means both "nothing is focused" and "the focused step has no
         resolvable address" (a fold; see `focusedMessagePath`), and passing it
         through would put the message at the END of the flow while the reader
         watched an indicator drawn beside the step they had selected. */
      if (focus?.kind === "message" && focusedMessagePath === null) {
        setArming(null);
        onAnnounce(
          "The message was not inserted — the focused step's place in the file is ambiguous while lifelines are folded. Press “Show all”, then try again.",
        );
        return;
      }
      const after = focusedMessagePath;
      const nextStep =
        focus?.kind === "message" ? focus.step + 1 : layout.stepCount + 1;
      setArming(null);
      edit.onInsertMessage(after, arming.from, participantId);
      setRawFocus((prev) => ({
        focus: { kind: "message", step: nextStep },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      setEditing({ kind: "message", step: nextStep });
    },
    [
      arming,
      edit,
      focus,
      focusedMessagePath,
      layout.stepCount,
      nameById,
      onAnnounce,
    ],
  );

  /**
   * Y of the indicator, and the two purposes want different rows.
   *
   * An INSERT points at the midpoint of the gap the new row will open — the
   * space between two existing steps, because that is where the message goes. A
   * REPOINT points at the row of the message being moved, because nothing new
   * opens: the arrow the reader is about to redirect is already drawn there, and
   * a rule in the gap below it would say the wrong thing.
   *
   * Both read out of `layout.yByStep` rather than recomputing anything, so the
   * line the reader sees and the row the edit is about are one answer.
   */
  const indicatorY =
    arming?.purpose === "repoint"
      ? (layout.yByStep[arming.step - 1] ?? layout.lifelineTop)
      : focus?.kind === "message"
        ? ((layout.yByStep[focus.step - 1] ?? layout.lifelineTop) +
            (layout.yByStep[focus.step] ?? layout.lifelineBottom)) /
          2
        : ((layout.yByStep[layout.stepCount - 1] ?? layout.lifelineTop) +
            layout.lifelineBottom) /
          2;

  const lifelinePick: SequenceLifelinePick | null =
    arming === null
      ? null
      : {
          purpose: arming.purpose,
          from: arming.from,
          atY: indicatorY,
          onPick: handlePickEnd,
        };

  /**
   * The armed gesture's instruction, ON SCREEN. Non-null exactly when something
   * is armed, so the render needs no second condition.
   *
   * For an insert the step comes from `focus`, which is where the anchor comes
   * from too — the reader can clear focus mid-gesture and the prompt follows,
   * which is honest: the message really would go to the end of the flow.
   */
  const armingPromptText =
    arming === null
      ? null
      : armingPrompt({
          purpose: arming.purpose,
          step:
            arming.purpose === "repoint"
              ? arming.step
              : focus?.kind === "message"
                ? focus.step
                : null,
          fromName:
            arming.from === null
              ? null
              : (nameById.get(arming.from) ?? arming.from),
        });

  /** Whether the file numbers its steps — read once, used by the canvas and by
   * the control that writes it, so the glyph and the drawing cannot disagree. */
  const numbered = shown.autonumber === true;

  /* ---- render -------------------------------------------------------------- */

  // Motion vars recompute whenever the reduced-motion store flips, so
  // toggling the OS setting takes effect without a reload.
  const motionVars = useMemo(() => sequenceMotionVars(reduced), [reduced]);

  /**
   * The march gate, as an ATTRIBUTE rather than one of the vars above:
   * switching it off has to withdraw a dasharray as well as an animation, and
   * a custom property can change a value but not retract a declaration. See
   * `sequenceMarchState`.
   */
  const marchState = sequenceMarchState(reduced, idleMotion);

  const focusedMessage =
    focus?.kind === "message"
      ? (layout.messages.find((m) => m.step === focus.step) ?? null)
      : null;
  const focusedParticipant =
    focus?.kind === "participant"
      ? (shown.participants.find((p) => p.id === focus.id) ?? null)
      : null;
  const focusedParticipantMessages =
    focusedParticipant === null
      ? []
      : layout.messages.filter(
          (m) =>
            m.from === focusedParticipant.id || m.to === focusedParticipant.id,
        );

  // Fragment focus detail — the steps come from the SAME resolver the
  // diagram dims with, so the dock can never describe a different flow
  // than the one lit up.
  const focusedFragment =
    focus?.kind === "fragment" ? (fragmentById.get(focus.id) ?? null) : null;
  const focusedFragmentGuard =
    focus?.kind === "fragment" && focus.branch !== null
      ? focusedFragment?.branches[focus.branch]?.label
      : undefined;
  const focusedFragmentSteps =
    focusedFragment === null ? null : resolveFocusSteps(layout, focus);
  const focusedFragmentMessages =
    focusedFragmentSteps === null
      ? []
      : layout.messages.filter((m) => focusedFragmentSteps.has(m.step));
  const focusedFragmentParticipants =
    focusedFragmentSteps === null
      ? []
      : layout.participants
          .filter((p) =>
            layout.messages.some(
              (m) =>
                focusedFragmentSteps.has(m.step) &&
                (m.from === p.id || m.to === p.id),
            ),
          )
          .map((p) => p.name);

  /** A participant's name with its technology, for the dock's From/To. */
  const withTechnology = (id: string): string => {
    const name = nameById.get(id) ?? id;
    const technology = shown.participants.find((p) => p.id === id)?.technology;
    return technology === undefined ? name : `${name} [${technology}]`;
  };

  /**
   * The guard path of a step — which fragment branches enclose it, outermost
   * first: `alt [card accepted] › par [receipt]`. `layout.fragments` is
   * pre-order, so filtering to the fragments whose step set contains the
   * step yields the ancestor chain already in nesting order; the branch a
   * step sits in comes from the same layout-computed sets the diagram dims
   * with. Nothing here re-derives structure.
   */
  const guardPath = (step: number): string | null => {
    const parts: string[] = [];
    for (const fragment of layout.fragments) {
      if (!fragment.steps.includes(step)) continue;
      const branch = fragment.branches.find((b) => b.steps.includes(step));
      parts.push(
        branch?.label !== undefined
          ? `${fragment.kind} [${branch.label}]`
          : fragment.kind,
      );
    }
    return parts.length === 0 ? null : parts.join(" › ");
  };

  const dockOpen =
    focusedMessage !== null ||
    focusedParticipant !== null ||
    focusedFragment !== null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // Arrow keys live on the wrapper, not on window: a global listener
      // would steal them from the source pane below this viewer. (Escape is
      // the exception — see the ladder comment above handleKeyDown.)
      onKeyDown={handleKeyDown}
      style={motionVars}
      data-seq-march={marchState}
    >
      {/* No live region here — the hosting page owns the single polite
          region and focus announcements travel through `onAnnounce`. */}

      {/* ---- the restore bar ----
          Hiding a lifeline changes the diagram a LOT — columns vanish, rows
          renumber, the drawing compacts — and the previous design left no
          trace on screen that anything had been hidden at all. A reader who
          folded something, scrolled, and came back had a smaller diagram and
          no reason to believe it was still the whole story.

          So: while anything is hidden the fact is stated, the hidden things
          are NAMED (a count alone still leaves you guessing what you are
          missing), and one control brings all of them back. It sits above the
          diagram rather than floating over it because it is a statement about
          the document, not a control on the canvas — and a bar that overlays
          the drawing would hide part of what it is describing. */}
      {hiddenList.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-foreground">
          <EyeOff
            aria-hidden="true"
            className="size-3.5 shrink-0 text-accent"
          />
          <span>
            <span className="font-medium">
              {hiddenList.length === 1
                ? "1 participant folded away"
                : `${hiddenList.length} participants folded away`}
            </span>{" "}
            <span className="text-muted-foreground">
              — {hiddenList.join(", ")}
            </span>
          </span>
          <button
            type="button"
            onClick={handleShowAll}
            className="ml-auto rounded-md border border-border bg-card px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Show all
          </button>
        </div>
      ) : null}
      {/* Relative wrapper: the details dock ANCHORS here so it can overlay
          the diagram pane instead of resizing it — see the aside below. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={diagramRegionRef}
          className={cn(
            "h-full overflow-auto bg-canvas p-3",
            // Flex ONLY at a numeric scale, so the wrapper's `m-auto` can
            // centre the drawing on both axes when it is smaller than the
            // pane. Fit mode is left as plain block layout: its child already
            // fills the pane and the SVG's own `xMidYMid` does the centring, so
            // there is nothing to gain and a working layout to risk.
            zoom !== "fit" && "flex",
            // `grab` whenever the view is past fit, which is where panning is
            // possible. At a zoom small enough that the drawing still fits it
            // over-promises by a cursor — the pointer-down guard measures real
            // overflow, so the gesture itself never lies, and the alternative
            // (a resize observer to keep a cursor honest) is not worth it.
            zoom !== "fit" && "cursor-grab",
            panning && "cursor-grabbing",
          )}
          onClick={handleBackdropClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          tabIndex={0}
          role="application"
          /* Spelled out rather than symbolic: a screen reader announces "⌘"
             as "command" or as nothing at all depending on the voice, and a
             name that sometimes vanishes is worse than one that is slightly
             long. `mod` is still the reader's own key. */
          aria-label={`Sequence diagram. Arrow keys move focus between messages, Escape clears focus. Pinch or hold ${mod === "⌘" ? "Command" : "Control"} and scroll to zoom between 10 and 400 percent. Messages, participants and fragment chips are buttons — Tab reaches them.`}
        >
          {/* Sized to the pane in fit mode, hugging the SVG when zoomed.
              Nothing is reserved for the dock, and that is the fix for a
              two-part bug rather than a simplification.

              What used to be here: a `box-content` wrapper with right padding
              equal to the dock's width, meant to give a pane-fitted SVG some
              overflow to scroll so the strip under the dock stayed reachable.
              It cost more than it bought. Extending the border box past 100%
              gave the pane a permanent horizontal SCROLLBAR the moment
              anything was focused, and that scrollbar consumed pane height,
              which made "meet" re-fit the whole diagram a few percent SMALLER
              — so clicking a message both grew a scrollbar and quietly
              rescaled the drawing, which is precisely the reflow-jump the
              overlay was chosen to avoid.

              It was also usually reserving nothing: fit scales by
              `min(paneW/vbW, paneH/vbH)`, and a tall flow is height-bound, so
              the drawing sits centred with horizontal slack on both sides and
              the dock overlays empty canvas. Reserving a dock's width of
              scroll room for a strip that is not covered is pure cost.

              The trade, stated plainly: when a diagram IS wide enough to run
              under the dock, that strip is now covered until the dock is
              closed (Escape, its close button, or clicking the canvas) or the
              view is zoomed, where the pane scrolls naturally and the
              focus-follows nudge above pulls the focused element clear. That
              is ordinary inspector-over-canvas behaviour, and it beats
              rescaling the diagram every time someone clicks. */}
          {/* `m-auto` and not `justify-center`/`items-center`: auto margins
              centre a flex item that is SMALLER than the container, and
              collapse to zero when it is bigger, so the overflow stays in the
              scrollable direction. Centring with justify/align instead
              overflows in BOTH directions and makes the leading half
              unreachable — a scroll container cannot scroll to negative
              offsets. This is the documented workaround for exactly that, and
              it is why zooming in past the pane still lets you reach the top
              and left of the diagram. */}
          <div className={zoom === "fit" ? "h-full w-full" : "m-auto w-max"}>
            <SequenceDiagram
              layout={layout}
              title={shown.metadata.title}
              autonumber={numbered}
              focus={focus}
              focusNonce={rawFocus?.nonce ?? 0}
              zoom={zoom}
              onFocusMessage={handleFocusMessage}
              onFocusParticipant={handleFocusParticipant}
              onFocusFragment={handleFocusFragment}
              collapsed={collapsed}
              dependencyCount={dependencyCount}
              onToggleCollapse={handleToggleCollapse}
              pick={lifelinePick}
              reorder={reorder}
            />
          </div>
        </div>

        {/* ---- the armed gesture's prompt, ON SCREEN ----
            THE BUG THIS FIXES: pressing “Repoint on the canvas” closed the edit
            form, drew a dashed rule, and said what to do next only into the
            playground's `sr-only` live region. A mouse user saw a panel vanish
            and concluded the feature was broken — which is what was reported.
            The announcement stays; this is an addition, and both come from
            `armingPrompt` so they cannot drift into saying different things.

            TOP CENTRE, over the canvas, not in the pill that armed it: the
            reader's next action is a click on a lifeline HEADER, and those run
            along the top of the drawing. Absolutely positioned so it cannot
            reflow the pane — in fit mode a bar that took layout height would
            re-fit and rescale the whole diagram the instant a gesture armed.
            `pointer-events-none` because it sits over the very lifelines it is
            telling the reader to click.

            NO ANIMATION, deliberately: appearing is a state change, and
            `check:sequence-motion` keeps entrance motion to one rule on the
            drawing root. It is also outside the `<svg>` the exporter clones, so
            it cannot reach an SVG, PNG or GIF frame; it carries the chrome
            class anyway — see `ARMING_PROMPT_CLASS`. */}
        {armingPromptText === null ? null : (
          <p
            className={cn(
              "pointer-events-none absolute top-3 left-1/2 z-20 max-w-[min(32rem,90%)]",
              "-translate-x-1/2 rounded-full border border-primary/50 bg-card/95 px-3 py-1.5",
              "text-center text-xs font-medium text-foreground shadow-lg backdrop-blur-sm",
              ARMING_PROMPT_CLASS,
            )}
          >
            {armingPromptText}
          </p>
        )}

        {/* ---- zoom controls (bottom-left, the C4 viewer's pill pattern) ----
            The hand-rolled fitView/zoomTo: FIT is the default and the reset
            (the whole flow visible at once); the percent button jumps to
            actual size; +/− step by a fixed factor from whatever is on
            screen. Panning past fit is the pane's own scrolling — wheel,
            trackpad, scrollbars — not a drag layer, because dragging would
            fight the click-to-focus surface this diagram IS. Zoom changes
            are state, not motion (the SVG re-renders at the new size), so
            reduced motion needs no branch here; announcements go through
            the page's one live region. */}
        <div className={cn("absolute bottom-3 left-3 z-10", ZOOM_PILL_CLASSES)}>
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            aria-label="Zoom out"
            title={ZOOM_OUT_TITLE}
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          {/* The only canvas of the three with a REAL fitted state — the two
              C4 canvases fit by moving a viewport, so their readout is always
              a number, while "Fit" here is a mode the SVG is sized in. */}
          <ZoomMenu
            percent={zoom === "fit" ? 100 : Math.round(zoom * 100)}
            isFit={zoom === "fit"}
            maxZoom={ZOOM_MAX}
            onFit={applyFit}
            onZoomTo={(scale) => applyZoom(scale)}
            title="Choose a zoom level"
          />
          <button
            type="button"
            onClick={() => stepZoom(1)}
            aria-label="Zoom in"
            title={ZOOM_IN_TITLE}
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={applyFit}
            aria-label="Fit the whole diagram in view"
            title="Fit to view"
            className={ZOOM_BUTTON_CLASSES}
          >
            <Scan aria-hidden="true" className="size-4" />
          </button>
          {/* A hairline before the view-level toggles: everything above
              changes how much of the diagram you see, everything below
              changes how it is drawn, and without the rule the icon and
              motion toggles read as further zoom steps. */}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
          <IconStyleToggle />
          {/* Idle-motion toggle — it lives in this pill because the strip
              is where view-level controls already are. Under reduced motion
              the button DISABLES rather than pretending: the OS preference
              wins outright, and a toggle that claims to enable motion it
              cannot run would be lying (aria-pressed reads false there for
              the same honesty). The preference persists in localStorage —
              see useIdleMotion. */}
          <button
            type="button"
            onClick={handleToggleIdle}
            disabled={reduced}
            aria-pressed={!reduced && idleMotion}
            aria-label={
              reduced
                ? "Idle motion unavailable — your system prefers reduced motion"
                : idleMotion
                  ? "Turn idle motion off"
                  : "Turn idle motion on"
            }
            title={
              reduced
                ? "Reduced motion is on"
                : idleMotion
                  ? "Idle motion: on"
                  : "Idle motion: off"
            }
            className={`${ZOOM_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:text-foreground`}
          >
            <Waves aria-hidden="true" className="size-4" />
          </button>
          {/* The tour's replay button lives in this pill for the same reason
              the idle-motion toggle does: the strip is where view-level
              controls already are, and the card it opens is anchored just
              above it, so the control and its effect share a corner. Gone
              entirely when the host opted out — a button that teaches this
              view's controls has no business on a page that embeds the view
              as a preview of something else. */}
          {/* ---- insert a message ----
              In the view-level strip beside zoom and idle motion, because that
              is where controls that change the whole view already live, and
              because the arming state it enters is view-level too.

              Rendered only when the host passed handlers — i.e. editing is on
              right now. Not disabled-when-locked: a permanently dead control
              is a promise the page cannot keep, and the lock's own affordance
              already says why editing is off. */}
          {edit === undefined ? null : (
            <button
              type="button"
              onClick={
                arming === null
                  ? handleArmInsert
                  : () => disarm(armingCancelled(arming.purpose))
              }
              aria-pressed={arming !== null}
              aria-label={
                arming === null
                  ? "Insert a message"
                  : "Cancel inserting a message"
              }
              title={
                arming === null
                  ? focus?.kind === "message"
                    ? `Insert a message after step ${focus.step}`
                    : "Insert a message at the end of the flow"
                  : arming.from === null
                    ? "Click the sending lifeline — Escape cancels"
                    : "Click the receiving lifeline — Escape cancels"
              }
              className={`${ZOOM_BUTTON_CLASSES} aria-pressed:text-primary`}
            >
              <Plus aria-hidden="true" className="size-4" />
            </button>
          )}
          {/* ---- add a lifeline ----
              BESIDE the insert-message control, in the same strip, on the same
              "editing is on right now" condition — the two are the canvas's
              only CREATE gestures and a reader looking for one will look where
              the other is.

              NO ARMING, unlike its neighbour, and the asymmetry is the honest
              one: an inserted message needs two lifelines named before it can
              exist, while a lifeline needs nothing but a place, and its place
              is decided (the end of the order — and once it is there, its
              column is dragged or Alt-arrowed into position, so this control
              has nothing to ask about placement either). Arming a gesture that
              has nothing to ask would be a modal state with one legal
              answer. */}
          {edit === undefined ? null : (
            <button
              type="button"
              onClick={edit.onInsertParticipant}
              aria-label="Add a lifeline"
              title="Add a lifeline at the end of the flow"
              className={ZOOM_BUTTON_CLASSES}
            >
              <UserPlus aria-hidden="true" className="size-4" />
            </button>
          )}
          {/* ---- number the steps ----
              THE FLAG HAD NO CONTROL AT ALL. `autonumber` has been in the
              format, the serializer and the renderer since 1.0.0, and the only
              way to reach it was to type the word into the source pane — which
              a reader who came to the canvas to read a diagram has no reason to
              know about. It was asked for as a missing feature; it was a missing
              button.

              IN THIS STRIP because it is the one editing gesture that changes
              how the WHOLE diagram is drawn rather than what one element says,
              which is exactly what the toggles above it do (icon style, idle
              motion). A pressed state rather than two glyphs, matching the
              idle-motion toggle beside it.

              Gated on `edit` like its neighbours: it writes a line into the
              document, so on a locked or read-only canvas it is not a control
              that should be disabled — it is one that has nothing to write. */}
          {edit === undefined ? null : (
            <button
              type="button"
              onClick={edit.onToggleAutonumber}
              aria-pressed={numbered}
              aria-label={
                numbered ? "Turn off step numbers" : "Number every step"
              }
              title={numbered ? "Step numbers: on" : "Step numbers: off"}
              className={`${ZOOM_BUTTON_CLASSES} aria-pressed:text-foreground`}
            >
              <ListOrdered aria-hidden="true" className="size-4" />
            </button>
          )}
          {tourEnabled ? (
            <button
              type="button"
              onClick={tour.start}
              aria-label="Show the feature tour"
              title="Tour the controls"
              className={ZOOM_BUTTON_CLASSES}
            >
              <HelpCircle aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        {/* First visit it opens itself (remembered per browser — see
            components/ui/tour.tsx for the persistence verdicts); the pill
            button replays it. Anchored above the pill, z-20 so it clears the
            pill and the dock (both z-10); the dock sits on the RIGHT edge, so
            the two never cover each other. */}
        {tourEnabled ? (
          <Tour
            steps={tourSteps}
            handle={tour}
            label="Sequence viewer tour"
            className="absolute bottom-14 left-3 z-20"
          />
        ) : null}

        {/* THE HOST'S LOCK, at the pane's top right. It YIELDS to the dock
            rather than fighting it for the corner: the dock owns the whole
            right edge while open (`md:right-0 md:w-72`), so a fixed-corner
            lock would either sit under it — invisible exactly when the reader
            is mid-edit and most likely to want to lock — or float over the
            dock's own header buttons. Sliding to just left of the dock keeps
            the lock visible in both states for the price of one position
            change. Below `md` the dock is a bottom sheet, so the corner is
            never contested there. */}
        {lockSlot !== undefined ? (
          <div
            className={cn(
              "absolute top-3 z-10",
              dockOpen ? "right-3 md:right-[18.75rem]" : "right-3",
            )}
          >
            {lockSlot}
          </div>
        ) : null}
        {/* ---- the details dock ----
            A docked, NON-BLOCKING side panel — deliberately not a modal
            dialog (see the header comment; do not "fix" this into one): the
            diagram behind it stays fully clickable while it is open.

            It OVERLAYS the diagram pane (absolute, in the relative wrapper
            above) instead of sitting beside it as a flex sibling, because
            the SVG is pane-fitted: a sibling would narrow the pane and
            rescale/shift every lifeline the instant something is clicked —
            a reflow-jump that undoes the point of clicking. Overlaying
            keeps the diagram's geometry byte-identical ("fit" means fit the
            pane, never re-fit around the dock), and nothing in the pane
            reserves room for it — see the wrapper above for why the spacer
            that used to do so was worse than the problem it solved. The
            aside UNMOUNTS when nothing is focused, so it costs nothing when
            closed.

            Below `md` a side dock would cover most of the diagram, so it
            becomes a bottom SHEET (same overlay reasoning, other edge) — and
            since it lives inside the diagram section it always sits ABOVE the
            source pane. Appearing is a state change, not motion: no
            animation, so nothing new to park under reduced motion. */}
        {dockOpen ? (
          <aside
            ref={dockRef}
            aria-label="Focus details"
            className={
              "absolute z-10 flex flex-col border-border bg-card/95 shadow-lg backdrop-blur-sm " +
              "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-72 max-md:rounded-t-xl max-md:border-t " +
              "md:top-0 md:right-0 md:bottom-0 md:w-72 md:border-l"
            }
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                {focusedMessage !== null
                  ? "Message details"
                  : focusedParticipant !== null
                    ? "Participant details"
                    : "Fragment details"}
              </h2>
              {/* ---- the edit toggle ----
                  IN THE DOCK, not on the canvas. The dock is already the one
                  place that shows every field a message has, including the
                  `desc` that is deliberately not drawn on the wire — so it is
                  the only surface where "edit this" can mean "edit all of it".
                  A pencil on the arrow itself would have to open something,
                  and that something is this panel.

                  Absent for a fragment focus: a fragment's own wording is its
                  guard labels and its kind, which are branch-level lines this
                  gesture does not address (see `SequenceSpans` — fragments
                  carry no line span). Offering a disabled pencil there would
                  advertise an editor that does not exist. */}
              {edit !== undefined &&
              !editingMessage &&
              !editingParticipant &&
              (focusedMessage !== null || focusedParticipant !== null) ? (
                <button
                  type="button"
                  onClick={() =>
                    setEditing(
                      focusedMessage !== null && focus?.kind === "message"
                        ? { kind: "message", step: focus.step }
                        : focusedParticipant !== null
                          ? { kind: "participant", id: focusedParticipant.id }
                          : null,
                    )
                  }
                  aria-label={
                    focusedMessage !== null
                      ? "Edit this message"
                      : "Edit this participant"
                  }
                  className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleCloseDock}
                aria-label="Close details and clear focus"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {focusedMessage !== null && editingMessage ? (
                focusedMessagePath === null ? (
                  /* The one case the form cannot serve, stated rather than
                     hidden — see `focusedMessagePath`. */
                  <p className="text-sm text-muted-foreground">
                    This message cannot be edited while lifelines are folded:
                    its place in the file is ambiguous. Press “Show all”, then
                    try again.
                  </p>
                ) : (
                  <MessageForm
                    key={`msg-form-${focusedMessage.step}`}
                    message={focusedMessage}
                    /* THE DRAWN participants, not the parsed ones, and the
                       same set the two-click picker can reach: a folded-away
                       lifeline has no column to point at, so offering it in a
                       menu would let the reader send an arrow somewhere they
                       cannot see it arrive. One rule for both halves of the
                       gesture. */
                    participants={shown.participants}
                    onRepoint={handleArmRepoint}
                    onRepointTo={handleRepointFromForm}
                    onCancel={() => setEditing(null)}
                    onSubmit={(revision) => {
                      setEditing(null);
                      edit?.onReviseMessage(focusedMessagePath, revision);
                    }}
                  />
                )
              ) : null}

              {focusedMessage !== null && !editingMessage ? (
                <dl className="flex flex-col gap-2.5">
                  <DockRow
                    term="Message"
                    value={`${focusedMessage.step} of ${layout.stepCount}`}
                    mono
                  />
                  <DockRow
                    term="From"
                    value={withTechnology(focusedMessage.from)}
                  />
                  <DockRow
                    term="To"
                    value={withTechnology(focusedMessage.to)}
                  />
                  <DockRow term="Label" value={focusedMessage.label} />
                  {/* THE REASON THE DOCK EXISTS, for a message that carries a
                      `desc`: the arrow shows the title, this shows what the
                      title is short for. Directly under Label — it elaborates
                      that row, and separating them with Technology would read
                      as two unrelated facts. */}
                  {focusedMessage.description !== undefined ? (
                    <DockCodeRow
                      term="Details"
                      value={focusedMessage.description}
                    />
                  ) : null}
                  {focusedMessage.technology !== undefined ? (
                    <DockRow
                      term="Technology"
                      value={focusedMessage.technology}
                      mono
                    />
                  ) : null}
                  <DockRow
                    term="Arrow"
                    value={
                      focusedMessage.self
                        ? `${sequenceArrowPhrase(focusedMessage)} (self-message)`
                        : sequenceArrowPhrase(focusedMessage)
                    }
                    mono
                  />
                  {/* WHERE the message sits: the chain of fragment branches
                      around it, outermost first. Omitted (not "none") for a
                      top-level message — absence of a frame is not a fact
                      worth a row. */}
                  {guardPath(focusedMessage.step) !== null ? (
                    <DockRow
                      term="Inside"
                      value={guardPath(focusedMessage.step) ?? ""}
                      mono
                    />
                  ) : null}
                </dl>
              ) : null}

              {/* ---- remove this message ----
                  BELOW the facts, not beside the pencil in the header. The
                  header already holds Close, and a destructive control one
                  misclick from "put this panel away" is a trap; down here it is
                  the last thing in the panel and reads as the end of the list
                  of things you can do to a message.

                  Gated on the message having an ADDRESS. A drawn message whose
                  object the unfiltered tree no longer holds (a fold; see
                  `focusedMessagePath`) has nothing to delete BY, and the same
                  fold already replaces the edit form with the sentence
                  explaining it — so the reader is told why, once, rather than
                  offered a second control that would refuse. */}
              {edit !== undefined &&
              focusedMessage !== null &&
              !editingMessage &&
              focusedMessagePath !== null ? (
                <DockRemoveButton
                  label="Remove this message"
                  onRemove={() => edit.onDeleteMessage(focusedMessagePath)}
                />
              ) : null}

              {focusedParticipant !== null && editingParticipant ? (
                <ParticipantForm
                  key={`p-form-${focusedParticipant.id}`}
                  participant={focusedParticipant}
                  onCancel={() => setEditing(null)}
                  onSubmit={(revision) => {
                    setEditing(null);
                    edit?.onReviseParticipant(focusedParticipant.id, revision);
                  }}
                />
              ) : null}

              {focusedParticipant !== null && !editingParticipant ? (
                <>
                  <dl className="flex flex-col gap-2.5">
                    <DockRow
                      term="Participant"
                      value={focusedParticipant.name}
                    />
                    <DockRow
                      term="Kind"
                      value={focusedParticipant.kind ?? "participant"}
                      mono
                    />
                    {focusedParticipant.technology !== undefined ? (
                      <DockRow
                        term="Technology"
                        value={focusedParticipant.technology}
                        mono
                      />
                    ) : null}
                    {focusedParticipant.description !== undefined ? (
                      <DockRow
                        term="Description"
                        value={focusedParticipant.description}
                      />
                    ) : null}
                  </dl>
                  <DockMessageList
                    heading={`Messages — ${focusedParticipantMessages.length} of ${layout.stepCount}`}
                    messages={focusedParticipantMessages}
                    nameById={nameById}
                    onFocusMessage={handleFocusMessage}
                  />
                  {/* Directly under the message list, which is the panel's own
                      answer to why a removal may be refused: the count in that
                      heading is the same count the refusal will quote back. */}
                  {edit !== undefined ? (
                    <DockRemoveButton
                      label="Remove this lifeline"
                      onRemove={() =>
                        edit.onDeleteParticipant(focusedParticipant.id)
                      }
                    />
                  ) : null}
                </>
              ) : null}

              {focusedFragment !== null ? (
                <>
                  <dl className="flex flex-col gap-2.5">
                    <DockRow
                      term="Fragment"
                      value={focusedFragment.kind}
                      mono
                    />
                    {focusedFragmentGuard !== undefined ? (
                      <DockRow
                        term="Branch"
                        value={`[${focusedFragmentGuard}]`}
                      />
                    ) : (
                      <DockRow
                        term="Branches"
                        value={`${focusedFragment.branches.length} (all focused)`}
                      />
                    )}
                    <DockRow
                      term="Participants"
                      value={
                        focusedFragmentParticipants.length === 0
                          ? "none"
                          : focusedFragmentParticipants.join(", ")
                      }
                    />
                  </dl>
                  <DockMessageList
                    heading={`Messages — ${focusedFragmentMessages.length} of ${layout.stepCount}`}
                    messages={focusedFragmentMessages}
                    nameById={nameById}
                    onFocusMessage={handleFocusMessage}
                  />
                </>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* The keyboard hint that used to live in the control strip — the
          controls are gone, the affordances are not.

          The FOLD clause is conditional, and that is the point: the `−` glyph
          only exists on cards with private dependencies (lib/collapse.ts), so
          on a flow where nothing folds, naming the control would send a reader
          hunting for a glyph that is not on screen. Where it does exist it was
          the least discoverable thing in the viewer — a 10px minus in a card
          corner, explained only by the accessible name of a control a mouse
          user never hears. */}
      <p className="hidden border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground sm:block">
        Click a message, participant, or fragment chip to focus it · a{" "}
        <span aria-hidden="true">•</span> after a label means that message
        carries details · ← → move between messages ·{" "}
        <span className="font-medium text-foreground">{mod} + scroll</span> or
        pinch to zoom · Esc clears focus
        {dependencyCount.size > 0 ? (
          <>
            {" · "}
            <span aria-hidden="true">−</span> on a card folds away the services
            only it uses
          </>
        ) : null}
      </p>

      {/* ---- the editing affordances ----
          A SECOND ROW, only while editing is on, and the reason it is a row of
          its own rather than more clauses on the one above: the bar above is
          about READING the diagram and applies to every reader, while this is
          the list of things a reader can CHANGE, which most hosts of this
          viewer cannot offer at all.

          IT USED TO BE A PARAGRAPH, and it was reported as too much to read —
          one sentence naming eight gestures plus a caveat, a paragraph doing a
          toolbar's job. What a reader scanning it actually wants is the GLYPH,
          because the glyph is what they have to find on screen; the sentence is
          what they want once they are lost. So the glyph leads, two or three
          words name the effect, and the full mouse path is the item's
          accessible name and its hover text. Nothing was cut: the same
          sentences, assembled by the same module, are read out in full by the
          tour card, which is the surface a reader opens to be TAUGHT rather
          than reminded.

          NOT BUTTONS, deliberately. Half of these gestures need something
          focused before they mean anything, and a chip that armed the insert or
          opened the pencil would be a SECOND control for a gesture that already
          has one — a second authority on arming, free to disagree with the
          pill. These are a legend: they show the glyph the real control
          carries, and `check:canvas-edit` pins each name to the table below so
          the legend cannot show a glyph the canvas does not.

          The entries come from `lib/mouse-guide.ts`, which derives them from
          `SequenceEditHandlers` — so a gesture added to the canvas cannot ship
          without an entry, an icon and a name. Twice on this branch a correct,
          shipped gesture was reported as broken because no surface named it. */}
      {/* ---- THE LEGEND'S HEIGHT IS FIXED, and that is the whole point ----

          The drawing is PANE-FITTED: `fit` scales by
          `min(paneW/vbW, paneH/vbH)`, so anything that changes this strip's
          height re-fits the entire diagram at a different scale. The dock is an
          overlay for exactly that reason, and its comment names the failure —
          "precisely the reflow-jump the overlay was chosen to avoid". This
          strip was a layout sibling and reintroduced it twice over:

            - `flex-wrap` let the row count follow the pane width, so the
              caveat's `basis-full` took a second row at some widths and not
              others. Resizing the window rescaled the drawing.
            - It rendered only while editing was ON, so once the canvas started
              LOCKED by default, pressing Edit both revealed the legend and
              quietly shrank the diagram — the reader's first act on the canvas
              resized it.

          So: one row that never wraps, scrolling sideways when the glyphs do
          not fit, and PRESENT WHETHER OR NOT EDITING IS ON. `h-7` is stated
          rather than left to the content because a fixed height is the property
          being defended; `check:sequence-layout` pins all three.

          A read-only canvas gets the one sentence that is true of it instead of
          a legend of gestures it does not offer — same row, same height, so the
          toggle changes what the strip SAYS and never what it occupies. */}
      <div className="hidden h-7 shrink-0 items-center gap-x-3 overflow-x-auto border-t border-border bg-card px-4 text-xs whitespace-nowrap text-muted-foreground sm:flex">
        {edit === undefined ? (
          <span>{SEQUENCE_READ_ONLY_HINT}</span>
        ) : (
          <>
            {SEQUENCE_MOUSE_GESTURES.map((gesture) => {
              const Glyph = GUIDE_GLYPH[gesture.icon];
              return (
                <span
                  key={gesture.handler}
                  /* The full path on hover for a mouse user, and as the item's
                     accessible name for everyone else — the long half is
                     demoted, never dropped. */
                  title={gesture.mouse}
                  className="inline-flex shrink-0 items-center gap-1"
                >
                  <Glyph aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{gesture.label}</span>
                  <span className="sr-only">— {gesture.mouse}</span>
                </span>
              );
            })}
            {/* THE CAVEAT STAYS, and stays last — it is the only entry about
                what dragging does NOT do, so it has no glyph to lead with, and
                it is what a reader arriving from a drawing tool needs before
                their first drag. It rides the same scroll rather than taking a
                row of its own, which is what used to make the strip two lines
                tall at some widths; the tour card still reads it out in full to
                a reader who opens it to be taught. */}
            <span className="shrink-0 text-muted-foreground/80">
              {SEQUENCE_MOUSE_GUIDE_CAVEAT}
            </span>
          </>
        )}
      </div>

      {/* Text alternative: the whole story as an ordered list, for readers
          the SVG serves poorly — with playback gone this is the only LINEAR
          reading of the diagram. Kept in sync for free — it reads the same
          layout the diagram does. */}
      <ol className="sr-only">
        {layout.messages.map((message) => (
          <li key={message.step}>
            {nameById.get(message.from) ?? message.from} to{" "}
            {nameById.get(message.to) ?? message.to} (
            {sequenceArrowPhrase(message)}
            {message.self ? ", self-message" : ""}): {message.label}
            {message.technology !== undefined ? ` [${message.technology}]` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * THE ZOOM RANGE, and the only place it is written down. Every entry point —
 * the pill's +/− buttons and the trackpad pinch — clamps to these, so no
 * gesture can reach a scale another gesture cannot undo.
 *
 * 0.1 is where a wide flow still reads as a shape; 4 is enough to inspect a
 * hairline. Past either end the pill's button and the pinch both simply stop.
 * Module scope rather than the component body: an effect depends on them, and
 * a per-render constant in a dependency list is a lie about what can change.
 */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/* -------------------------------------------------------------------------- */
/* The tour                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Versioned so a rewritten tour can re-show itself: bump `v1` and every
 * browser that dismissed the old one sees the new one once.
 */
/**
 * The guide's icon names, resolved to the glyphs the real controls carry.
 *
 * A TOTAL `Record<SequenceGuideIcon, LucideIcon>`, which is the load-bearing
 * half: a new gesture in `mouse-guide.ts` needing a glyph this table does not
 * have is a MISSING PROPERTY here — a type error before it is a failing check.
 * The names live there rather than the components because that module is loaded
 * by `check:canvas-edit` through Node's type stripping, which cannot have a
 * React package on its path.
 *
 * EVERY GLYPH IS ONE THE CANVAS ALREADY RENDERS on the control it describes
 * (`Plus` on the insert button, `ListOrdered` on the numbering toggle,
 * `Trash2` in the dock's remove row, and so on). A legend showing a glyph the
 * screen does not carry is worse than no legend — it is a control the reader
 * will hunt for and never find.
 */
const GUIDE_GLYPH: Record<SequenceGuideIcon, LucideIcon> = {
  pencil: Pencil,
  "arrow-left-right": ArrowLeftRight,
  "arrow-up-down": ArrowUpDown,
  columns: Columns3,
  trash: Trash2,
  "user-minus": UserMinus,
  plus: Plus,
  "user-plus": UserPlus,
  "list-ordered": ListOrdered,
};

/**
 * Why a reorder is unavailable while a lifeline is folded, in one sentence with
 * the fix in it.
 *
 * A CONSTANT because both keyboard routes say it and both must say the SAME
 * thing — a message reorder and a column reorder are refused by the identical
 * condition (`shown !== file`), so two wordings would be two accounts of one
 * fact. It ends with the control that clears the fold, for the same reason the
 * insert's fold refusal does: "Show all" is the next thing to press, and a
 * refusal that does not say so is a dead end.
 */
const FOLDED_REORDER_REFUSAL =
  "Nothing can be reordered while lifelines are folded — the rows and columns on screen are renumbered over what is visible, so a move would land somewhere else in the file. Press “Show all”, then try again.";

const SEQUENCE_TOUR_KEY = "arch-lab:tour:sequence:v1";

/*
 * The controls readers were not finding, one step each. These strings are
 * user-facing contracts: each names a control by the label or glyph actually
 * rendered (the `−`/`+n` fold control, the pill's readout menu), so a change
 * to a control means rewording its step, not just its aria-label. The fold
 * step is separate from the focus step deliberately — it is the single
 * most-missed control in the viewer, and burying it in a list is how it got
 * missed on the canvas.
 */
const FOCUS_TOUR_STEP: TourStep = {
  title: "Focus anything",
  body:
    "Click any message, participant, or fragment chip to spotlight it — " +
    "its details open beside the diagram, and ← → walk the messages in " +
    "order. Escape, or a click on empty canvas, clears the focus.",
  icon: MousePointerClick,
};
/* Offered only when the host passed edit handlers, on the same condition the
   fold step rides: a tour step naming a control that is not on screen sends the
   reader hunting for it. */
/* THE BODY IS DERIVED, not written here, and that is the point: it is the same
   `lib/mouse-guide.ts` list the hint bar under the canvas renders. Two hand-kept
   copies of "how to edit this" is how the endpoint gesture came to be mentioned
   in one place, in the past tense of a control that had moved, while a reader
   hunted for it — and how the numbering flag was mentioned in neither. */
/**
 * THE LONG PROSE'S HOME, now that the strip under the canvas leads with glyphs
 * instead. The tour is where a reader goes to be taught, so it gets every
 * sentence in full; the strip is where they go to be reminded, so it gets the
 * icon. Both read `lib/mouse-guide.ts` — writing either one by hand is how the
 * tour came to describe the endpoint gesture in words the panel no longer used.
 */
const EDIT_TOUR_STEP: TourStep = {
  title: "Edit the flow on the canvas",
  body:
    `With a mouse alone: ${SEQUENCE_MOUSE_GUIDE}. ` +
    `${SEQUENCE_MOUSE_GUIDE_CAVEAT} Hold Alt with the arrow keys to move the ` +
    "focused step or lifeline one slot at a time, which is the precise route. " +
    "Every change is written into the source " +
    "text beside the diagram, one line at a time, and Cmd or Ctrl + Z undoes it.",
  icon: Pencil,
};

const FOLD_TOUR_STEP: TourStep = {
  title: "Fold a card's helpers",
  body:
    "The − in a participant card's corner folds away the services only " +
    "that card uses. The card then reads +n — press it, or the bar above " +
    "the diagram, to bring them back.",
  icon: SquareMinus,
};
const ZOOM_TOUR_STEP: TourStep = {
  title: "Zoom the flow",
  body:
    "In the bottom-left pill, − and + step the zoom, the readout opens " +
    "presets (Fit, 50–400%), and the frame icon refits the whole flow. " +
    "Pinch, or hold ⌘/Ctrl and scroll, zooms at the pointer.",
  icon: ZoomIn,
};

/* -------------------------------------------------------------------------- */
/* Dock building blocks                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A term whose value is a CODE BLOCK: a bordered, tinted, monospace panel that
 * honours the newlines in the value.
 *
 * WHY THE MESSAGE DETAIL GETS THIS AND THE OTHER ROWS DO NOT. A `desc` on a
 * message is where endpoints, payloads and status codes go — the one field in
 * the dock whose content is usually literal text a reader will copy. Set as
 * prose it reads as a paragraph that happens to contain a path, so
 * `POST /api/v1/orders — body { cartId, addressId }. 201 …` arrives as one
 * grey wall and the reader has to parse it back into fields. Monospace and
 * pre-wrap give the author a way to lay it out (a `desc` may contain `\n`)
 * and stop the proportional font from making `{ cartId, addressId }` look
 * like a sentence.
 *
 * Wrapping is deliberate on both axes: `whitespace-pre-wrap` keeps authored
 * newlines AND still wraps a long line, so the dock never grows a horizontal
 * scrollbar for prose; `break-words` is what keeps an unbroken 80-character
 * URL inside the panel rather than pushing it wider than the dock.
 */
function DockCodeRow({
  term,
  value,
}: {
  term: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      {/* The button OVERLAYS the block's top-right corner rather than sitting
          in a header bar like `/syntax`'s CodeBlock: the dock is 18rem wide,
          and a second chrome row would cost a line of the detail itself. It is
          always visible, never hover-only — a hover-reveal control does not
          exist for touch, and the dock is the mobile bottom sheet too.

          `pr-9` on the <pre> is what keeps a long first line from running
          under the button. */}
      <dd className="relative mt-1">
        <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 py-2 pr-9 pl-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
          {value}
        </pre>
        <CopyButton
          text={value}
          label={`Copy the ${term.toLowerCase()}`}
          iconOnly
          className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The dock's edit forms                                                       */
/* -------------------------------------------------------------------------- */

/*
 * TWO FORMS, NOT ONE GENERIC ONE. They share three of their four fields, and
 * merging them was tried on paper and rejected: the shared part is the
 * PRESENTATION (a label, an input, the same classes), which is what
 * `DockField` below carries, while the differences are the fields' meanings —
 * a message has a `kind` with three values and a title drawn on the wire, a
 * participant has a `kind` with three STATES including "unstated" and a
 * display name. A generic form would take a schema describing all of that,
 * which is more code than both forms and harder to read than either.
 *
 * THEY ARE PLAIN <form> ELEMENTS so Enter submits and the browser's own focus
 * order applies. The dock is deliberately not a modal (see the file header),
 * so nothing traps focus here either: Tab leaves the form and reaches the
 * diagram, which is the click-around-while-reading behaviour the dock exists
 * for.
 *
 * EMPTY MEANS ABSENT. A cleared technology or detail field submits
 * `undefined`, not `""` — `.alab` can spell an empty string, and a document
 * carrying `[""]` or `desc ""` would render a blank field the reader cannot
 * tell from a missing one. The one exception is the message LABEL, which the
 * model requires: an empty label submits as the empty string it already
 * permits, and the arrow simply draws without one.
 */

const FIELD_CLASSES =
  "mt-1 w-full rounded-md border border-border bg-card px-2 py-1 text-sm " +
  "text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:outline-none";

/** One labelled control. The <label> WRAPS its control rather than using
 * `htmlFor`: the dock renders several of these and an id would have to be
 * unique per focused element, which is a name to keep in step for nothing. */
function DockField({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{term}</span>
      {children}
    </label>
  );
}

/**
 * The dock's one destructive control.
 *
 * NO CONFIRMATION DIALOG, deliberately, and undo is the reason: every canvas
 * edit lands on the playground's 50-deep ring, so Cmd/Ctrl + Z with the diagram
 * focused puts a deleted element back — text, wording, continuation lines and
 * all. A confirm step would tax every deletion to protect against one, and the
 * page already says so in the announcement it makes. This is the same trade the
 * C4 canvas's Delete key takes.
 *
 * IT MAY ALSO REFUSE. Both removals can be declined with a reason (an
 * activation flag, a lifeline still referred to), and the host says that reason
 * in the live region rather than this button greying itself out —
 * `SequenceEditHandlers` argues why the predicate stays on one side.
 */
function DockRemoveButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {label}
      </button>
    </div>
  );
}

/** Apply / Cancel, in that order — the primary action nearest the fields. */
function DockFormActions({
  onCancel,
}: {
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Check aria-hidden="true" className="size-3.5" />
        Apply
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * The message editor. `key`ed on the step by its caller, so focusing a
 * different message REMOUNTS it — which is how the fields start from the new
 * message's values rather than from an effect that syncs them (the same
 * no-setState-in-an-effect rule this file's header states).
 */
function MessageForm({
  message,
  participants,
  onRepoint,
  onRepointTo,
  onSubmit,
  onCancel,
}: {
  message: LaidMessage;
  /** The lifelines an endpoint may name — the drawn ones; the caller says why. */
  participants: readonly { id: string; name: string }[];
  onRepoint: () => void;
  /** Both endpoints, whole, for whichever menu the reader just changed. */
  onRepointTo: (from: string, to: string) => void;
  onSubmit: (revision: SequenceMessageRevision) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(message.label);
  /* TWO MENUS, because an arrow is two independent axes and a single menu of
     ten would ask the reader to find "dotted line with a cross" in a list
     rather than set the two facts they are holding. */
  const [lineStyle, setLineStyle] = useState<SequenceLineStyle>(
    message.lineStyle,
  );
  const [headStyle, setHeadStyle] = useState<SequenceHeadStyle>(
    message.headStyle,
  );
  const [technology, setTechnology] = useState(message.technology ?? "");
  const [description, setDescription] = useState(message.description ?? "");

  /* The label takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags and which cannot be scoped to "this remount". It also
     completes the insert gesture: press +, click, click, type. */
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    labelRef.current?.select();
  }, []);

  /**
   * The form's state as a whole revision, with an override for the field that
   * just changed.
   *
   * WHY A SELECT COMMITS ON CHANGE AND TEXT WAITS FOR APPLY. This panel had
   * both semantics and no way to tell which was which: the From and To menus
   * fired `onRepointTo` immediately, while the arrow menu only called its own
   * setter. So a reader changed the arrow's style, watched the diagram not
   * change, and reported that the style could not be changed at all. It could —
   * `revisedMessageEdit` writes every token correctly — but nothing said an
   * Apply was owed, and the menu beside it needed none.
   *
   * A select is a decision, complete the moment it is made; a text field is
   * mid-thought until its author says otherwise. So every menu here now acts at
   * once and Apply belongs to the typing — which is also the rule the endpoint
   * menus were already following.
   *
   * NOTHING TYPED IS LOST, because `SequenceMessageRevision` is a WHOLE value:
   * committing the arrow kind carries the label and detail currently in the
   * fields along with it. That is what makes acting immediately safe here,
   * where a partial patch would have made it a way to discard an edit in
   * progress.
   */
  const revisionWith = (
    over: Partial<SequenceMessageRevision>,
  ): SequenceMessageRevision => ({
    label,
    lineStyle,
    headStyle,
    technology: orAbsent(technology),
    description: orAbsent(description),
    ...over,
  });

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(revisionWith({}));
      }}
    >
      <DockField term="Label">
        <input
          ref={labelRef}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={FIELD_CLASSES}
        />
      </DockField>
      {/* ---- the endpoints ----
          TWO MENUS AND A CANVAS GESTURE, and it took both to make this
          reachable. The row used to STATE the endpoints and offer only
          “Repoint on the canvas”, on the reasoning that an endpoint is pointed
          at rather than typed — a typo in a hand-spelled participant id is a
          document the parser refuses. That reasoning was right about typing and
          wrong about the conclusion: a MENU cannot be mistyped, it lists the
          document's own lifelines by display name, and the two-click picker it
          replaced as the first thing a reader finds was invisible to anyone who
          could not hear the live region. "I cannot change from and to" is what
          that cost.

          So the menus are the discoverable route and the canvas picker stays
          for the reader who now knows it is there — it is the better gesture at
          the far end of a long flow, where the lifeline is easier to point at
          than to find in a list.

          THE MENUS FIRE ON CHANGE, not on Apply; `handleRepointFromForm` is
          where that is argued. They are `DockField`s because a select IS this
          form's input in the ordinary sense, unlike the button below them,
          which leaves the form (see `handleArmRepoint`) so a stale Apply cannot
          land on top of the repointed line. */}
      <div className="rounded-md border border-border bg-secondary/40 px-2 py-1.5">
        <span className="block text-xs font-medium text-muted-foreground">
          Endpoints
        </span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <DockField term="From">
            <select
              value={message.from}
              onChange={(event) => onRepointTo(event.target.value, message.to)}
              className={FIELD_CLASSES}
            >
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name}
                </option>
              ))}
            </select>
          </DockField>
          <DockField term="To">
            <select
              value={message.to}
              onChange={(event) =>
                onRepointTo(message.from, event.target.value)
              }
              className={FIELD_CLASSES}
            >
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name}
                </option>
              ))}
            </select>
          </DockField>
        </div>
        <button
          type="button"
          onClick={onRepoint}
          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeftRight aria-hidden="true" className="size-3.5" />
          Repoint on the canvas
        </button>
      </div>
      {/* THE TWO AXES, one menu each. Both option lists are built from the
          axis arrays rather than typed out, so a style added to the model
          appears here without an edit — the alternative is a menu that offers
          four of five heads, which reads as the fifth being unsupported. */}
      <DockField term="Line">
        <select
          value={lineStyle}
          onChange={(event) => {
            const next = event.target.value as SequenceLineStyle;
            setLineStyle(next);
            // Acts at once, like the endpoint menus beside it — see
            // `revisionWith` for why a select does and a text field does not.
            onSubmit(revisionWith({ lineStyle: next }));
          }}
          className={FIELD_CLASSES}
        >
          {SEQUENCE_LINE_STYLES.map((style) => (
            <option key={style} value={style}>
              {style} — {SEQUENCE_LINE_STYLE_MEANING[style]}
            </option>
          ))}
        </select>
      </DockField>
      <DockField term="Head">
        <select
          value={headStyle}
          onChange={(event) => {
            const next = event.target.value as SequenceHeadStyle;
            setHeadStyle(next);
            // Acts at once — see `revisionWith`.
            onSubmit(revisionWith({ headStyle: next }));
          }}
          className={FIELD_CLASSES}
        >
          {SEQUENCE_HEAD_STYLES.map((style) => (
            <option key={style} value={style}>
              {style} — {SEQUENCE_HEAD_STYLE_MEANING[style]}
            </option>
          ))}
        </select>
      </DockField>
      <DockField term="Technology">
        <input
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          placeholder="HTTPS, gRPC — blank to remove"
          className={FIELD_CLASSES}
        />
      </DockField>
      {/* A TEXTAREA, because this field is the one that may hold newlines and
          viewers must honour them (`SequenceMessage.description`). A single
          input would silently make multi-line detail unenterable in the only
          place it is editable. */}
      <DockField term="Details">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="Endpoint, payload, failure modes — blank to remove"
          className={`${FIELD_CLASSES} font-mono text-xs`}
        />
      </DockField>
      <DockFormActions onCancel={onCancel} />
    </form>
  );
}

/** The participant editor. Remounted per participant for the same reason. */
function ParticipantForm({
  participant,
  onSubmit,
  onCancel,
}: {
  participant: {
    name: string;
    kind?: SequenceParticipantKind;
    technology?: string;
    description?: string;
  };
  onSubmit: (revision: SequenceParticipantRevision) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(participant.name);
  /* THREE STATES, not two. Absent, `participant` and `actor` are distinct and
     all three round-trip (`SequenceParticipantKind`), so the select carries an
     explicit "unstated" option rather than defaulting the empty case to
     `participant` — which would rewrite a document that never said either. */
  const [kind, setKind] = useState<SequenceParticipantKind | "">(
    participant.kind ?? "",
  );
  const [technology, setTechnology] = useState(participant.technology ?? "");
  const [description, setDescription] = useState(participant.description ?? "");

  /** The same rule the message form follows, for the same reason: a menu is a
   * decision and acts at once, typing waits for Apply. `revisionWith` in that
   * form carries the argument; the participant kind had the identical defect —
   * a reader chose "actor" and nothing on the canvas moved. */
  const revisionWith = (
    over: Partial<SequenceParticipantRevision>,
  ): SequenceParticipantRevision => ({
    name,
    kind: kind === "" ? undefined : kind,
    technology: orAbsent(technology),
    description: orAbsent(description),
    ...over,
  });

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.select();
  }, []);

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(revisionWith({}));
      }}
    >
      <DockField term="Name">
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD_CLASSES}
        />
      </DockField>
      <DockField term="Kind">
        <select
          value={kind}
          onChange={(event) => {
            const next = event.target.value as SequenceParticipantKind | "";
            setKind(next);
            // Acts at once — see `revisionWith`.
            onSubmit(revisionWith({ kind: next === "" ? undefined : next }));
          }}
          className={FIELD_CLASSES}
        >
          <option value="">unstated — drawn as a box</option>
          <option value="participant">participant — a box</option>
          <option value="actor">actor — a stick figure</option>
        </select>
      </DockField>
      <DockField term="Technology">
        <input
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          placeholder="Next.js, PostgreSQL 16 — blank to remove"
          className={FIELD_CLASSES}
        />
      </DockField>
      <DockField term="Description">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Blank to remove"
          className={FIELD_CLASSES}
        />
      </DockField>
      <DockFormActions onCancel={onCancel} />
    </form>
  );
}

/** One stacked term/value row — the dock has vertical room, so it uses it. */
function DockRow({
  term,
  value,
  mono = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd
        className={
          mono ? "font-mono text-xs text-foreground" : "text-sm text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The dock's message list: REAL buttons, one per message, each re-focusing
 * its step — the dock is not just a description of the focus, it is a way
 * to walk the flow message by message without hunting for thin arrows.
 */
function DockMessageList({
  heading,
  messages,
  nameById,
  onFocusMessage,
}: {
  heading: string;
  messages: LaidMessage[];
  nameById: Map<string, string>;
  onFocusMessage: (step: number) => void;
}): React.JSX.Element {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-medium text-muted-foreground">{heading}</h3>
      {messages.length === 0 ? (
        <p className="mt-1 text-sm text-foreground">none</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {messages.map((message) => (
            <li key={message.step}>
              <button
                type="button"
                onClick={() => onFocusMessage(message.step)}
                className="w-full rounded-md px-2 py-1 text-left hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="block text-xs text-foreground">
                  <span className="font-mono text-muted-foreground">
                    {message.step}.
                  </span>{" "}
                  {message.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {nameById.get(message.from) ?? message.from} →{" "}
                  {nameById.get(message.to) ?? message.to}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
