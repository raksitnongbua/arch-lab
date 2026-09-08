/**
 * Every canvas gesture, in one place.
 *
 * These 24 handlers were inline in `ViewPlayground`, which was a 2,371-line
 * function — and they were 763 of those lines. They came out as a unit because
 * they already WERE one: 30 declarations, of which only `canvasEdit` and
 * `sequenceEdit` were read by anything else. The other 28 talk exclusively to
 * each other through `applyCanvasEdit`, which is the single funnel every
 * gesture goes through.
 *
 * WHAT THIS IS NOT: a new abstraction. Nothing here was redesigned, renamed or
 * merged — the bodies, the comments and the dependency arrays are the ones that
 * shipped, moved verbatim. The only additions are the parameter object below
 * and the return at the bottom. A split that also rewrites is a split nobody
 * can review, and this file is guarded by `check:canvas-edit`, which pins the
 * gestures rather than the structure.
 *
 * THE HOST CONTRACT IS DELIBERATELY NARROWER THAN THE PAGE'S. `adoptDocument`
 * and `applyEdit` are typed to accept only `"source"`, because that is the only
 * pane a canvas edit ever writes — the page's wider functions satisfy it, and
 * the narrowing documents the rule that made comment preservation work: the
 * pane being written is never rewritten again from the model.
 */

import { useCallback, useMemo, useRef } from "react";

import type { SequenceEditHandlers } from "@/features/sequence";
import type { FlowchartEditHandlers } from "@/features/flowchart";
/* PAST THE BARREL, as `input/sequence-edit.ts` does and for the reason its
   comment gives: the refusals a reorder can hit are the sequence feature's own
   (a note in the way, a `box` boundary), and these handlers are the one surface
   that speaks them. */
import {
  messageReorderRefusal,
  participantReorderRefusal,
} from "@/features/sequence/lib/reorder";
import type { CanvasEditHandlers, NodeMoveHandler } from "@/features/viewer";
import {
  sequenceItemKey,
  sequenceMessagePaths,
  type C4EdgeRevision,
  type C4NodeFrameChoice,
  type C4NodeRevision,
  type C4NodeType,
  type ExternalRef,
  type SequenceItemPath,
  type SequenceMessageRevision,
  type SequenceParticipantRevision,
} from "@/types";

import {
  canvasEditability,
  connectedNewNodeEdit,
  connectedNodesEdit,
  createdNodeEdit,
  createdNodeName,
  createdRefEdit,
  deletedEdgeEdit,
  deletedFrameEdit,
  deletedNodeEdit,
  directionInertWarning,
  groupedNodesEdit,
  layerPlacement,
  movedNodeEdit,
  nestedNodeEdit,
  ownsChildDiagram,
  renamedFrameEdit,
  resetLayerPositionsEdit,
  resetNodePositionEdit,
  revisedEdgeEdit,
  revisedDirectionEdit,
  revisedFileDirectionEdit,
  revisedNodeEdit,
  unnestedNodeEdit,
  type CanvasEdit,
} from "../input/canvas-edit";
import type { ViewDocument } from "../input/parse";
import {
  activationRefusal,
  deletedMessageEdit,
  deletedParticipantEdit,
  insertedMessageEdit,
  insertedParticipantEdit,
  participantRemovalRefusal,
  reorderedMessageEdit,
  reorderedParticipantEdit,
  repointedMessageEdit,
  revisedMessageEdit,
  revisedParticipantEdit,
  toggledAutonumberEdit,
  INSERTED_PARTICIPANT_NAME,
} from "../input/sequence-edit";
import {
  connectedFlowEdgeEdit,
  deletedFlowEdgeEdit,
  flowConnectRefusal,
  flowGroupRefusal,
  groupedFlowNodesEdit,
  insertedFlowStepEdit,
  movedFlowNodeEdit,
  revisedFlowEdgeEdit,
  revisedFlowNodeEdit,
  type FlowEdgeRevision,
  type FlowNodeRevision,
} from "../input/flowchart-edit";
import {
  movedErEntityEdit,
  pinnedErEntityEdit,
  resetErEntityPositionEdit,
  resetErPositionsEdit,
  revisedErEntityEdit,
  type ErEntityRevision,
} from "../input/er-edit";
import {
  movedUseCaseElementEdit,
  revisedUseCaseElementEdit,
  type UseCaseElementRevision,
  pinnedUseCaseElementEdit,
  resetUseCaseElementPositionEdit,
  resetUseCasePositionsEdit,
} from "../input/usecase-edit";
import { retitledEdit, type RetitleFields } from "../input/retitle-edit";
import {
  dictReorderRefusal,
  reorderedDictFieldEdit,
  reorderedDictSectionEdit,
} from "../input/dict-edit";

/**
 * How many canvas edits back the diagram-side undo reaches. Deep enough to
 * cover a run of drags, shallow enough that the ring cannot grow unbounded on
 * a long session.
 */
const CANVAS_UNDO_DEPTH = 50;

/** What the hook needs from the page that owns the document. */
/**
 * What a PLACEMENT canvas needs from the host — the ER and use-case canvases,
 * whose only ability is `move`.
 *
 * ONE TYPE FOR BOTH, and that is the model being right rather than a
 * shortcut: an ER entity and a use-case element are addressed by id, placed by
 * a point, pinned by a flag and released the same way, so the two canvases
 * differ in what they DRAW and in nothing this interface can see. A second
 * identical interface would be the copy `dry.md` asks about — and asked what
 * they would have to do differently in future, the answer is nothing, because
 * both are opting one element out of a solver.
 *
 * `onReleaseAll` IS THE SWEEP, and it is the only consumer of `pin`. A pinned
 * element is skipped by it and by nothing else; if this handler ever goes
 * away, `pinned` becomes a field no reader reads, which is what
 * `C4Node.pinned` was for two releases.
 */
export interface PlacementEditHandlers {
  /** A drag that ended: the element's new top-left, in layout units. */
  onMove: (id: string, position: { x: number; y: number }) => void;
  /** Keep or stop keeping this element's coordinates through the sweep. */
  onPin: (id: string, pinned: boolean) => void;
  /** Hand ONE element back to the layout — a direct request, so it releases a
   *  pinned element too. The pin exempts from the sweep, not from the author. */
  onRelease: (id: string) => void;
  /** Hand the whole diagram back, skipping pinned elements. */
  onReleaseAll: () => void;
}

/**
 * The ER canvas's placement gestures PLUS the one wording gesture its detail
 * panel offers.
 *
 * A SEPARATE INTERFACE RATHER THAN AN OPTIONAL MEMBER ON
 * `PlacementEditHandlers`, for the reason that interface's own note gives
 * about the dictionary: an optional half that means "this canvas is the other
 * kind" makes one type answer two questions. `revise` and `move` are separate
 * cells in `CANVAS_EDIT_OFFERS`, answered separately per notation and per pane
 * language, and the use-case canvas next door shares the placement half
 * without sharing this one.
 */
export interface ErEditHandlerSet extends PlacementEditHandlers {
  /**
   * Rewrite one entity's own wording. Which fields that admits — and which it
   * refuses, `id` and the columns among them — is `ErEntityRevision`'s
   * verdict, stated at the gesture.
   *
   * ABSENT WHEN THE GRID DOES NOT OFFER `revise` for this document and this
   * pane, which the placement members have no need to spell because they are
   * the offer `erEditable` already carries. Absence is what keeps the panel
   * from drawing fields whose Apply the gesture would decline.
   */
  onRevise?: (entityId: string, revision: ErEntityRevision) => void;
}

/**
 * What the use-case canvas needs from the host — the placement four plus the
 * wording gesture.
 *
 * ITS OWN INTERFACE, SYMMETRIC WITH `ErEditHandlerSet`, rather than an
 * optional `onRevise` on `PlacementEditHandlers`. Both canvases answer `move`
 * and `revise` as SEPARATE cells, per notation and per pane, so a shared
 * optional member would be a field whose absence means two different things
 * depending on which canvas read it. The revision TYPES differ too — a
 * use-case element has a `kind` its revision refuses, an ER entity has
 * columns — so the two could not share the signature even if the shape
 * matched.
 */
export interface UseCaseEditHandlerSet extends PlacementEditHandlers {
  /**
   * Rewrite one element's own wording. Which fields that admits — and why
   * `id` and `kind` are refused — is `UseCaseElementRevision`'s verdict,
   * stated at the gesture.
   *
   * Absent when the grid does not offer `revise` for this document and this
   * pane; absence is what keeps the dock from drawing fields whose Apply the
   * gesture would decline.
   */
  onRevise?: (elementId: string, revision: UseCaseElementRevision) => void;
}

/**
 * What a canvas that draws the document's heading needs from the host.
 *
 * ONE CALLBACK TAKING BOTH FIELDS, not one per field: the two lines are typed
 * in one place and submitted together, so taking them separately would make
 * "retype the title and clear the description" two undo entries for one thing
 * the reader did once.
 *
 * NOT PART OF ANY NOTATION'S BUNDLE, and that is the fifth ability's shape
 * rather than an oversight — the heading is not an element, so it belongs to
 * the document rather than to whatever the canvas draws. One handler serves
 * every canvas that offers `retitle`, and each viewer takes it as an optional
 * member of its own bundle.
 *
 * `RetitleFields` DISTINGUISHES ABSENT FROM EMPTY — `undefined` leaves the
 * line alone, `""` removes it. That distinction has to survive the trip
 * through here, which is why this is the gesture module's own type and not a
 * pair of strings.
 */
export interface RetitleEditHandlers {
  onRetitle: (fields: RetitleFields) => void;
}

/**
 * What the dictionary canvas needs from the host.
 *
 * NOT `PlacementEditHandlers`, and the difference is the whole point: a
 * dictionary drag writes an ORDER, not a position. There is no point to place
 * and nothing to pin, because the order it writes IS the text — so the two
 * interfaces stay separate rather than one growing optional halves that mean
 * "this canvas is the other kind".
 */
export interface DictEditHandlers {
  onReorderSection: (label: string, direction: "earlier" | "later") => void;
  onReorderField: (
    sectionLabel: string,
    fieldName: string,
    direction: "earlier" | "later",
  ) => void;
  /** Why a handle is unavailable, so the canvas can grey it BEFORE the drag
   *  rather than swallowing one. */
  reorderRefusal: typeof dictReorderRefusal;
}

export interface CanvasEditingHost {
  doc: ViewDocument;
  /** The source pane's current text — every edit is a patch of these bytes. */
  text: string;
  /** Whether C4 canvas gestures are offered at all. */
  canvasEditable: boolean;
  /** Whether sequence dock gestures are offered at all. */
  sequenceEditable: boolean;
  /** Whether flowchart dock and connect gestures are offered at all. */
  flowchartEditable: boolean;
  /** Whether ER canvas gestures are offered at all. */
  erEditable: boolean;
  /** Whether use-case canvas gestures are offered at all. */
  usecaseEditable: boolean;
  /** Whether dictionary reorder gestures are offered at all. */
  dictEditable: boolean;
  /** Whether the document's own heading may be retyped on this canvas. */
  retitleEditable: boolean;
  setText: (value: string) => void;
  /** Drops a queued keystroke that would otherwise land after the edit. */
  setPending: (pending: null) => void;
  setAnnouncement: (message: string) => void;
  adoptDocument: (next: ViewDocument, editedPane: "source") => void;
  applyEdit: (pane: "source", value: string) => void;
}

export function useCanvasEditing({
  doc,
  text,
  canvasEditable,
  sequenceEditable,
  flowchartEditable,
  erEditable,
  usecaseEditable,
  dictEditable,
  retitleEditable,
  setText,
  setPending,
  setAnnouncement,
  adoptDocument,
  applyEdit,
}: CanvasEditingHost): {
  canvasEdit: CanvasEditHandlers | undefined;
  sequenceEdit: SequenceEditHandlers | undefined;
  flowchartEdit: FlowchartEditHandlers | undefined;
  erEdit: ErEditHandlerSet | undefined;
  usecaseEdit: UseCaseEditHandlerSet | undefined;
  dictEdit: DictEditHandlers | undefined;
  retitleEdit: RetitleEditHandlers | undefined;
  /**
   * Apply or clear a layout direction, at the diagram's scope or the file's.
   * Beside the handler sets rather than inside `canvasEdit`, because the
   * control that invokes them is rendered by the playground in the canvas's
   * lock slot — not by the canvas.
   */
  applyDirection: (
    diagramId: string,
    scope: "layer" | "file",
    direction: "tb" | "lr",
  ) => void;
  clearDirection: (diagramId: string, scope: "layer" | "file") => void;
  /**
   * Hand one layer's hand-written coordinates back to the layout. Beside the
   * handler sets for `applyDirection`'s reason — it is pressed in the same
   * menu, which the playground renders in the lock slot.
   */
  resetLayerPositions: (diagramId: string) => void;
} {
  /**
   * Previous source texts, newest last — the undo history for CANVAS edits.
   *
   * THE TEXT IS THE UNDO UNIT, which is what lets this be a ring of strings
   * rather than a command stack. Every canvas edit is defined by the text it
   * produces (`canvas-edit.ts` re-parses to make that literally true), so
   * "undo" is "put the previous text back and parse it" — there is no inverse
   * operation to implement per edit type, and a future edit kind inherits undo
   * for free.
   *
   * SEPARATE FROM THE TEXTAREA'S OWN UNDO, deliberately, and the two must not
   * be merged. Typing in the pane keeps the browser's native undo, which knows
   * about carets and selections and word boundaries in a way nothing here
   * could reproduce; a canvas drag never enters that history because it is not
   * a user edit to the field. Binding one ⌘Z to both would mean either
   * hijacking the textarea (losing caret-accurate undo while typing) or
   * replaying canvas edits through it as text mutations (losing the caret
   * anyway, and fighting React's controlled value). So: focus in the pane
   * undoes typing, focus on the canvas undoes canvas edits — see the focus
   * guard in `viewer-canvas.tsx`, which is the one place that decides.
   *
   * A ref, not state: nothing renders from it, and re-rendering the page on
   * every push would be a render per drag for no visible reason.
   */
  const canvasUndoRef = useRef<string[]>([]);
  /**
   * What the numbering toggle's OFF position should write: the spelling this
   * document used before the toggle turned numbering on. See the capture in
   * `handleToggleAutonumber` for why it is taken on the way on, and
   * `toggledAutonumberEdit`'s header for why the answer cannot come from the
   * text once the flag reads `autonumber`.
   *
   * A ref, not state: nothing renders from it, and it is read only inside the
   * handler that writes it.
   */
  const autonumberOffSpellingRef = useRef<"absent" | "false" | null>(null);

  /**
   * Apply one canvas edit: remember the text being replaced, put the edited
   * text in the pane, adopt the document it parsed to, say what happened.
   *
   * ONE MODEL, and this is where it holds. The gesture is resolved into TEXT by
   * `canvas-edit.ts`, and the document adopted here is that text's own parse —
   * so there is no canvas-side copy of the geometry to fall out of step with
   * the pane. React Flow holds the position for the length of the gesture and
   * hands it over on release; nothing keeps it afterwards.
   *
   * THE EDITED PANE IS `"source"`, not `null`, and the distinction is the whole
   * comment-preservation fix — see the inline note below. The rule that
   * argument enforces is unchanged: whichever pane's text was just written is
   * never rewritten again from the model, which is what structurally rules out
   * echo loops between the source pane and its JSON twin.
   *
   * The pending debounce is dropped first, exactly as `loadStarter` and
   * `convertPane` drop it: a queued keystroke landing after this would parse
   * text that predates the edit and undo it invisibly.
   */
  const applyCanvasEdit = useCallback(
    (edit: CanvasEdit, announcement: string) => {
      const ring = canvasUndoRef.current;
      ring.push(text);
      if (ring.length > CANVAS_UNDO_DEPTH) ring.shift();
      setPending(null);
      setText(edit.text);
      // `"source"` — NOT `null`, and this is the line that keeps comments. The
      // text is already set above, as a PATCH of the author's own bytes; letting
      // `adoptDocument` regenerate the source pane from the model would put the
      // whole-document re-emit — and the comment loss with it — straight back.
      // The rule it enforces is unchanged: the pane being written is never
      // rewritten again from the model. The JSON twin still follows, because a
      // canvas edit is the one case where the caret is in neither pane.
      adoptDocument(edit.doc, "source");
      setAnnouncement(announcement);
    },
    [text, adoptDocument, setText, setPending, setAnnouncement],
  );

  const handleNodeMove = useCallback<NodeMoveHandler>(
    (diagramId, nodeId, position) => {
      const next = movedNodeEdit(doc, text, diagramId, nodeId, position);
      // null covers "landed where it started" as well as "cannot be edited",
      // so a press that moves nothing costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Moved ${nodeId} to ${position.x}, ${position.y} — the source text follows.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeDelete = useCallback(
    (diagramId: string, nodeId: string) => {
      /* A node owning a child diagram is refused, and the refusal is SAID.
         Cascading would take a whole level of the model out on one keystroke;
         going quiet would look like a broken key. */
      if (ownsChildDiagram(doc, diagramId, nodeId)) {
        setAnnouncement(
          `${nodeId} cannot be deleted here — it opens a diagram of its own. Remove that level in the source text first.`,
        );
        return;
      }
      const next = deletedNodeEdit(doc, text, diagramId, nodeId);
      if (next === null) return;
      /* The undo key is NAMED here and nowhere else, because a delete is the
         one canvas edit with nothing left on screen to put back by hand — a
         move can always be dragged the other way. */
      applyCanvasEdit(
        next,
        `Deleted ${nodeId} and every relationship touching it — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodeRevise = useCallback(
    (diagramId: string, nodeId: string, revision: C4NodeRevision) => {
      const next = revisedNodeEdit(doc, text, diagramId, nodeId, revision);
      // null covers "nothing changed" as well as every refusal, so submitting
      // an untouched form costs no text change and no undo entry — the same
      // contract the two sequence revise handlers state.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${nodeId} updated to “${revision.name}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  /**
   * Hand one element's hand-written coordinates back to the layout, from the
   * details panel.
   *
   * SAID, not swallowed, on a refusal — the Add strip's rule: the panel only
   * renders the button beside an element whose line carries coordinates, so
   * the one refusal a reader can cause is the pane lagging the canvas.
   */
  const handleNodeResetPosition = useCallback(
    (diagramId: string, nodeId: string) => {
      const next = resetNodePositionEdit(doc, text, diagramId, nodeId);
      if (next === null) {
        setAnnouncement(
          "The element was not released — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `${nodeId} handed back to the layout — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  /**
   * Hand a whole layer's hand-written coordinates back to the layout, from the
   * direction menu's own row.
   *
   * The announcement NAMES THE UNDO KEY for the node delete's reason: this is
   * the edit with nothing left on screen to put back by hand — coordinates
   * that took a reader a dozen drags to arrange leave the file in one press,
   * and dragging them back is not an option they have. It is also the one
   * announcement that has to say the count, because the row's whole promise is
   * that the direction control will work afterwards.
   */
  const resetLayerPositions = useCallback(
    (diagramId: string) => {
      const placement = layerPlacement(doc, diagramId);
      const next = resetLayerPositionsEdit(doc, text, diagramId);
      if (next === null) {
        setAnnouncement(
          "Nothing was released — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      const released = placement?.placed ?? 0;
      const kept = placement?.pinned ?? 0;
      applyCanvasEdit(
        next,
        `${released} ${released === 1 ? "element" : "elements"} handed back to the layout${kept > 0 ? `, and ${kept} pinned ${kept === 1 ? "element kept its" : "elements kept their"} place` : ""} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  /**
   * Apply a direction at one scope, or clear it there.
   *
   * TWO GESTURES BEHIND ONE PAIR OF CALLBACKS, because the two scopes write
   * different lines: the diagram's own head line, or the file's `direction`
   * header line. The control chooses the scope; this only routes.
   *
   * The announcement names the SHAPE and the SCOPE rather than the keyword,
   * because "lr" is the text that gets written and "this layer now runs left
   * to right" is what happened to the picture — a reader reached for this
   * because the diagram was the wrong shape, not because they wanted a
   * particular word in their file.
   *
   * AND IT SAYS WHEN THE PICTURE DID NOT CHANGE, IN THIS ANNOUNCEMENT.
   * Geometry beats the direction per element, so on a diagram somebody has
   * arranged by hand this gesture writes a line and moves nothing — and a
   * control that does nothing and says nothing is the whole bug this feature
   * exists to end.
   *
   * A TOAST HELD THAT SENTENCE FOR ONE ROUND AND WAS REJECTED. It rendered in
   * a screen corner, a whole canvas away from the row that had just been
   * pressed, so it read as a notification about the app rather than as the
   * answer to the press. The menu now stays open instead and says it in its
   * own note, one line above the release row — see
   * `layout-direction-menu.tsx`, which owns that decision and the roles that
   * make it idiomatic.
   *
   * WHICH IS WHY THE PLACEMENT PROSE IS BACK IN THIS ANNOUNCEMENT. While the
   * toast held the fact, this sentence deliberately did NOT carry it:
   * `<Toaster />` is itself a polite live region with a `role="status"` per
   * entry, so saying it here as well would have told a screen-reader user the
   * same thing twice. The menu's note is a plain `<p>` and announces nothing,
   * so with the toast gone this live region is the ONLY channel a screen
   * reader has — and leaving the prose out would have left exactly those
   * readers told nothing about a press that did nothing, which is the original
   * defect aimed at the people who had it first. It carries the release row's
   * LABEL too, so the remedy is named rather than left to be found.
   *
   * The announcement still switches from "runs left to right" to "now says
   * left to right" when the shape did not follow: a live region claiming the
   * layer turned, followed by a sentence saying nothing moved, is worse than
   * either half alone.
   *
   * Counted BEFORE the edit, from the document being edited, the way the
   * boundary removal counts its members: afterwards the released elements are
   * indistinguishable from ones that were never placed.
   *
   * Counted for the ACTIVE LAYER in both scopes, and `directionInertWarning`
   * is worded as such — so the file-wide press, which does change what every
   * other diagram inherits, warns about the one diagram on screen and offers a
   * release that touches exactly that. There is deliberately no file-wide
   * release to offer: relaying out diagrams the reader cannot see is the
   * surprise `revisedFileDirectionEdit` refuses to cause.
   */
  const applyDirection = useCallback(
    (diagramId: string, scope: "layer" | "file", direction: "tb" | "lr") => {
      const placement = layerPlacement(doc, diagramId);
      const next =
        scope === "layer"
          ? revisedDirectionEdit(doc, text, diagramId, direction)
          : revisedFileDirectionEdit(doc, text, direction);
      // null covers "nothing changed" as well as every refusal, so choosing
      // what is already in force costs no text change and no undo entry — and
      // says nothing, which is what keeps a repeated press from repeating the
      // sentence below.
      if (next === null) return;
      const where =
        scope === "layer" ? "This layer" : "Every diagram in the file";
      const inert = directionInertWarning(placement);
      if (inert === null) {
        applyCanvasEdit(
          next,
          `${where} ${direction === "lr" ? "runs left to right, folding a long flow into bands" : "runs top to bottom"} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
        );
        return;
      }
      /* The release is NAMED, not merely implied — the menu is still open with
         that row in it, and a reader who cannot see it needs the label to know
         what to look for. Silent when every placed element is pinned, because
         then there is no row: `directionInertWarning` returns `null` there
         rather than let anything point at a control that is not rendered. */
      const remedy =
        inert.releaseLabel === null
          ? ""
          : ` The direction menu is still open, with “${inert.releaseLabel}” in it.`;
      applyCanvasEdit(
        next,
        `${where} now says ${direction === "lr" ? "left to right" : "top to bottom"}. ${inert.message}${remedy} The source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  /**
   * Clear the direction at one scope.
   *
   * NO PLACEMENT WARNING HERE, and that is a decision rather than an
   * omission. The one beside `applyDirection` exists because a reader asked
   * for a SHAPE and the picture refused it — there is an expectation to
   * falsify. Clearing asks for no shape: it takes a line out of the document,
   * which is exactly what happens, and what the diagram falls back to is the
   * file's default the reader has no picture of in advance. So this closes the
   * menu like any other row, and the menu's own state answers it — the tick
   * moves and the clearing row leaves. Warning here as well would put the
   * sentence on a press that did what it said, and a warning that appears on
   * every direction press is one nobody reads on the press that matters.
   */
  const clearDirection = useCallback(
    (diagramId: string, scope: "layer" | "file") => {
      const next =
        scope === "layer"
          ? revisedDirectionEdit(doc, text, diagramId, "inherit")
          : revisedFileDirectionEdit(doc, text, "none");
      if (next === null) return;
      applyCanvasEdit(
        next,
        scope === "layer"
          ? "This layer follows the file's direction again — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
          : "The file no longer sets a direction — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleEdgeRevise = useCallback(
    (diagramId: string, edgeId: string, revision: C4EdgeRevision) => {
      const next = revisedEdgeEdit(doc, text, diagramId, edgeId, revision);
      // null covers "nothing changed" as well as every refusal, so submitting
      // an untouched form costs no text change and no undo entry — the node
      // revise's own contract.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Relationship ${edgeId} updated — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleEdgeDelete = useCallback(
    (diagramId: string, edgeId: string) => {
      const next = deletedEdgeEdit(doc, text, diagramId, edgeId);
      /* SAID, not swallowed, unlike the node delete's null: this arrives from
         a card button as well as the key, and a pressed bin that changes
         nothing reads as a broken control. The one refusal a reader can
         cause is the pane lagging the canvas. */
      if (next === null) {
        setAnnouncement(
          "The relationship was not deleted — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* The undo key is NAMED, the node delete's rule: a delete is the edit
         with nothing left on screen to put back by hand. "Its elements stay"
         is the removal's verdict said to the reader — the gesture takes one
         line, never an endpoint. */
      applyCanvasEdit(
        next,
        `Relationship ${edgeId} deleted — its elements stay. The source text follows; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleFrameRename = useCallback(
    (diagramId: string, frameId: string, label: string) => {
      const next = renamedFrameEdit(doc, text, diagramId, frameId, label);
      // null covers "nothing changed" as well as every refusal, so submitting
      // the label the boundary already has costs no text change and no undo
      // entry — the node revise's own contract.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Boundary renamed to “${label.trim()}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleFrameDelete = useCallback(
    (diagramId: string, frameId: string) => {
      /* Counted BEFORE the edit, from the same document it edits, because the
         announcement's one job is to say what happened to the members — the
         removal's whole design question — and after the edit they are
         indistinguishable from nodes that were never in the boundary. */
      const held =
        doc.kind === "c4"
          ? (doc.synced.file.diagrams
              .find((diagram) => diagram.id === diagramId)
              ?.nodes.filter((node) => node.frameId === frameId).length ?? 0)
          : 0;
      const next = deletedFrameEdit(doc, text, diagramId, frameId);
      /* SAID, not swallowed — the Add strip's rule: a pressed Remove that
         changes nothing reads as a broken button. The one refusal a reader
         can cause is a stale selection while the pane lags the canvas. */
      if (next === null) {
        setAnnouncement(
          "The boundary was not removed — the source pane and the diagram do not match yet.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        held > 0
          ? `Boundary removed — its ${held} ${held === 1 ? "element stays" : "elements stay"} on the canvas, one level out, and the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`
          : "Boundary removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodesGroup = useCallback(
    (
      diagramId: string,
      nodeIds: readonly string[],
      frame: C4NodeFrameChoice,
    ): boolean => {
      const next = groupedNodesEdit(doc, text, diagramId, nodeIds, frame);
      /* SAID, not swallowed — the Add strip's rule: a pressed Apply that
         changes nothing reads as a broken button. Two causes share the
         sentence honestly: the pane lagging the canvas, and a lasso whose
         members already have exactly this membership. The boolean tells the
         canvas whether to keep the lasso for a retry — see `onNodesGroup`. */
      if (next === null) {
        setAnnouncement(
          "The elements were not grouped — they may already be in that boundary, or the source pane and the diagram do not match yet.",
        );
        return false;
      }
      /* ONE applyCanvasEdit for the WHOLE grouping: N membership lines plus
         at most one minted `frame` line land as one text, so a single
         Cmd/Ctrl+Z takes the whole boundary back out. `check:canvas-edit`
         pins this call count — a second call here would be a second undo
         entry per gesture. */
      applyCanvasEdit(
        next,
        frame.kind === "none"
          ? `${nodeIds.length} elements removed from their boundaries — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`
          : `${nodeIds.length} elements grouped into one boundary — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo the whole grouping.`,
      );
      return true;
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodeCreate = useCallback(
    (diagramId: string, type: C4NodeType): string | null => {
      const next = createdNodeEdit(doc, text, diagramId, type);
      /* SAID, not swallowed, unlike a refused move: a no-op drag left the
         canvas looking exactly as the reader expects, but a pressed Add
         button that changes nothing looks like a broken button — the same
         verdict the sequence insert handlers reached. The one refusal a
         reader can actually cause here is the pane lagging the canvas. */
      if (next === null) {
        setAnnouncement(
          "The element was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return null;
      }
      applyCanvasEdit(
        next,
        /* "and selected", because the id returned below is what the canvas
           centres on and selects — the announcement describes the state the
           reader ARRIVES in, so it says "rename it" rather than the old
           "select it to rename it", which was an instruction the viewport
           did not help them follow. */
        `“${createdNodeName(type)}” added below the diagram and selected — the source text follows. Rename it in the details panel; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
      // The canvas owns the camera; the id is how it finds what to centre on.
      return next.createdNodeId ?? null;
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleRefCreate = useCallback(
    (diagramId: string, source: ExternalRef): string | null => {
      const next = createdRefEdit(doc, text, diagramId, source);
      /* Said for the Add strip's reason — this arrives from the same strip,
         and a menu choice that silently does nothing reads as broken. */
      if (next === null) {
        setAnnouncement(
          "The reference was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return null;
      }
      applyCanvasEdit(
        next,
        "Reference added below the diagram and selected — the source text follows. It mirrors an element from a level above and is read-only here; press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
      return next.createdNodeId ?? null;
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodeConnect = useCallback(
    (diagramId: string, sourceId: string, targetId: string) => {
      /* THE DUPLICATE CAUTION IS READ BEFORE THE EDIT, from the same
         unordered-pair fact the verdict model warns on: the module ALLOWS a
         second relationship (parallel edges are a feature), so the sentence
         is the only place the caution can land after the release. */
      const already =
        doc.kind === "c4" &&
        (
          doc.synced.file.diagrams.find((d) => d.id === diagramId)?.edges ?? []
        ).some(
          (e) =>
            (e.source === sourceId && e.target === targetId) ||
            (e.source === targetId && e.target === sourceId),
        );
      const next = connectedNodesEdit(doc, text, diagramId, sourceId, targetId);
      /* SAID, not swallowed — the Add strip's rule: a completed drag that
         changes nothing reads as a broken gesture. Two causes share the
         sentence honestly: the same element twice, and the pane lagging the
         canvas. */
      if (next === null) {
        setAnnouncement(
          "The relationship was not added — an element cannot connect to itself, or the source pane and the diagram do not match yet.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        already
          ? `A second relationship added from ${sourceId} to ${targetId} — they were already related, and the new line draws beside the old one. Press Cmd or Ctrl + Z with the diagram focused to undo.`
          : `Relationship added from ${sourceId} to ${targetId} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleConnectCreate = useCallback(
    (diagramId: string, sourceId: string, type: C4NodeType): string | null => {
      const next = connectedNewNodeEdit(doc, text, diagramId, sourceId, type);
      if (next === null) {
        setAnnouncement(
          "The element was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return null;
      }
      applyCanvasEdit(
        next,
        /* "one undo takes both back" is the gesture's whole contract said to
           the reader: the node and its relationship are ONE text edit
           (`connectedNewNodeEdit`), so the announcement must not read as two
           steps. */
        `“${createdNodeName(type)}” added below the diagram, connected from ${sourceId} and selected — the source text follows. Rename it in the details panel; one Cmd or Ctrl + Z with the diagram focused takes both back.`,
      );
      return next.createdNodeId ?? null;
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodeNest = useCallback(
    (diagramId: string, nodeId: string) => {
      const next = nestedNodeEdit(doc, text, diagramId, nodeId);
      if (next === null) {
        setAnnouncement(
          "The child diagram was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        "Child diagram added — the source text follows. Zoom into the element to fill it in; press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleNodeUnnest = useCallback(
    (diagramId: string, nodeId: string) => {
      const next = unnestedNodeEdit(doc, text, diagramId, nodeId);
      /* The one refusal a reader can cause here is a child that stopped being
         empty in the pane — worth saying, because the button was offered on
         the strength of it being empty. */
      if (next === null) {
        setAnnouncement(
          "The child diagram was not removed — it is no longer empty, or the source pane and the diagram do not match yet.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        "Empty child diagram removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  /* ---- the sequence canvas's own gestures --------------------------------
     Routed through `applyCanvasEdit` exactly as the C4 drag is, so both
     canvases share one undo ring, one "the pane just written is never rewritten
     from the model" rule and one announcement channel. A second pathway for
     the second canvas is the "two halves, each self-consistent" failure this
     module's neighbours already warn about. */

  const handleReviseMessage = useCallback(
    (path: SequenceItemPath, revision: SequenceMessageRevision) => {
      const next = revisedMessageEdit(doc, text, path, revision);
      // null covers "nothing changed" as well as every refusal, so submitting
      // an untouched form costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Message updated to “${revision.label}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReviseParticipant = useCallback(
    (participantId: string, revision: SequenceParticipantRevision) => {
      const next = revisedParticipantEdit(doc, text, participantId, revision);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${participantId} updated to “${revision.name}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleInsertMessage = useCallback(
    (after: SequenceItemPath | null, from: string, to: string) => {
      const next = insertedMessageEdit(doc, text, after, from, to);
      if (next === null) {
        /* SAID, not swallowed. The refusals here are all "the pane and the
           canvas disagree" (a keystroke not yet parsed, or text that does not
           parse at all), and a two-click gesture that silently does nothing
           reads as a broken control rather than as a busy moment. */
        setAnnouncement(
          "The message was not inserted — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Message inserted from ${from} to ${to} — the source text follows. Its wording is open for editing; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleRepointMessage = useCallback(
    (path: SequenceItemPath, from: string, to: string) => {
      /* The activation refusal is READ OUT before the edit is attempted, for
         the same reason `ownsChildDiagram` is on the C4 side: `null` from the
         gesture covers every refusal at once, and a two-click gesture that
         ends in silence reads as a broken control. This is the one refusal
         with a cause the reader can act on, so it gets its own sentence. */
      const blocked = activationRefusal(doc, path);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = repointedMessageEdit(doc, text, path, from, to);
      if (next === null) {
        setAnnouncement(
          "The message was not repointed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Message now runs from ${from} to ${to} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleDeleteMessage = useCallback(
    (path: SequenceItemPath) => {
      const blocked = activationRefusal(doc, path);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = deletedMessageEdit(doc, text, path);
      if (next === null) {
        setAnnouncement(
          "The message was not deleted — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* Undo is NAMED here for the reason the C4 delete names it: a delete is
         the one sequence edit with nothing left on screen to put back by hand.
         A revise can be retyped and a repoint re-clicked; a deleted message's
         wording is gone unless the ring gives it back. */
      applyCanvasEdit(
        next,
        "Message deleted — the source text follows, and later steps renumber. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleReorderMessage = useCallback(
    (path: SequenceItemPath, toIndex: number) => {
      /* THE ACTIVATION SENTENCE FIRST, exactly as the delete and the repoint do
         it, and from the same function: a flag on the dragged message is the
         one refusal with a cause the reader can act on, and it must not be
         reported as "the pane does not match yet". */
      const blocked =
        activationRefusal(doc, path) ??
        (doc.kind === "sequence"
          ? messageReorderRefusal(doc.file, path, toIndex)
          : null);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = reorderedMessageEdit(doc, text, path, toIndex);
      if (next === null) {
        setAnnouncement(
          "The step was not moved — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* THE NEW POSITION IS READ OFF THE RE-PARSED DOCUMENT for the same reason
         the numbering toggle reads its state back: a screen-reader user does
         not watch the arrow travel, so the sentence is the whole of the
         feedback and it has to be right about where the step ended up. */
      const landed =
        next.doc.kind === "sequence"
          ? sequenceMessagePaths(next.doc.file.items).findIndex(
              (candidate) =>
                sequenceItemKey(candidate) ===
                sequenceItemKey([...path.slice(0, -1), toIndex]),
            ) + 1
          : 0;
      applyCanvasEdit(
        next,
        `Step moved to position ${landed} — the source text follows, and numbered steps renumber. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleReorderParticipant = useCallback(
    (participantId: string, toIndex: number) => {
      const blocked =
        doc.kind === "sequence"
          ? participantReorderRefusal(doc.file, participantId, toIndex)
          : null;
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = reorderedParticipantEdit(doc, text, participantId, toIndex);
      if (next === null) {
        setAnnouncement(
          "The lifeline was not moved — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `${participantId} moved to column ${toIndex + 1} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleDeleteParticipant = useCallback(
    (participantId: string) => {
      /* SAID WITH A COUNT, never swallowed. Refusing to remove a lifeline is
         the most likely refusal on this canvas — a lifeline nothing points at
         is the exception — so the sentence has to tell the reader what is in
         the way and how much of it. */
      const blocked = participantRemovalRefusal(doc, participantId);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = deletedParticipantEdit(doc, text, participantId);
      if (next === null) {
        setAnnouncement(
          "The lifeline was not removed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `${participantId} removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleInsertParticipant = useCallback(() => {
    const next = insertedParticipantEdit(doc, text);
    if (next === null) {
      setAnnouncement(
        "The lifeline was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
      );
      return;
    }
    applyCanvasEdit(
      next,
      `“${INSERTED_PARTICIPANT_NAME}” added at the end of the lifeline order — the source text follows. Click its header to rename it; press Cmd or Ctrl + Z with the diagram focused to undo.`,
    );
  }, [doc, text, applyCanvasEdit, setAnnouncement]);

  const handleToggleAutonumber = useCallback(() => {
    /* CAPTURED HERE, on the way ON, because this is the last moment the answer
       is still in the file. `autonumber` and its absence render identically to
       `autonumber false`, so the off direction cannot tell from the text which
       of the two off spellings the author had — and always removing the line
       silently deleted an `autonumber false` somebody had written by hand.

       Captured PER TURN-ON rather than per document, which is what makes a ref
       safe here: there is no staleness to invalidate. Switching document,
       undoing, or retyping the pane cannot leave a wrong answer behind, because
       the next turn-on reads the file again. A file that arrives with numbering
       already on has nothing remembered and falls back to `"absent"`, which is
       the right reading of "the toggle removes what turns it on". */
    const numberedNow = doc.kind === "sequence" && doc.file.autonumber === true;
    if (!numberedNow) {
      autonumberOffSpellingRef.current =
        doc.kind === "sequence" && doc.file.autonumber === false
          ? "false"
          : "absent";
    }
    /* A FILE THAT ARRIVED ALREADY NUMBERED has no remembered off state, because
       it was never off — so the off position has to invent one, and the two
       candidates are not equally good. Removing the line loses WHERE the author
       put it: `autonumberAnchor` writes a new flag after the block's leading
       prose, so a flag written above an opening comment comes back below it.
       Writing `false` in place keeps the line exactly where they had it and
       makes off-then-on byte-identical. Both spellings render the same; only
       one leaves the rest of the file alone. */
    const next = toggledAutonumberEdit(
      doc,
      text,
      autonumberOffSpellingRef.current ?? "false",
    );
    if (next === null) {
      setAnnouncement(
        "The step numbering was not changed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
      );
      return;
    }
    /* THE NEW STATE IS READ OFF THE RE-PARSED DOCUMENT, not predicted from the
       old one. The gesture writes text and `adopt` reads it back, so this is
       the only reading that cannot be wrong about what the file now says — and
       the sentence a screen-reader user gets instead of watching the numbers
       appear has to be right about which way the toggle went. */
    const on =
      next.doc.kind === "sequence" && next.doc.file.autonumber === true;
    applyCanvasEdit(
      next,
      on
        ? "Every step is now numbered — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
        : "Step numbers are off — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
    );
  }, [doc, text, applyCanvasEdit, setAnnouncement]);

  /**
   * The handler bundle the sequence viewer takes — PRESENT only while editing
   * is on, absent otherwise. Presence is the signal: the viewer renders no
   * editing chrome without it, which is what keeps a locked canvas free of
   * controls rather than showing disabled ones.
   */
  const sequenceEdit = useMemo<SequenceEditHandlers | undefined>(
    () =>
      sequenceEditable
        ? {
            onReviseMessage: handleReviseMessage,
            onReviseParticipant: handleReviseParticipant,
            onInsertMessage: handleInsertMessage,
            onRepointMessage: handleRepointMessage,
            onDeleteMessage: handleDeleteMessage,
            onReorderMessage: handleReorderMessage,
            onReorderParticipant: handleReorderParticipant,
            onDeleteParticipant: handleDeleteParticipant,
            onInsertParticipant: handleInsertParticipant,
            onToggleAutonumber: handleToggleAutonumber,
          }
        : undefined,
    [
      sequenceEditable,
      handleReviseMessage,
      handleReviseParticipant,
      handleInsertMessage,
      handleRepointMessage,
      handleDeleteMessage,
      handleReorderMessage,
      handleReorderParticipant,
      handleDeleteParticipant,
      handleInsertParticipant,
      handleToggleAutonumber,
    ],
  );

  /* ---- flowchart ---------------------------------------------------------- */

  const handleMoveFlowNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const next = movedFlowNodeEdit(doc, text, nodeId, position);
      // null covers "landed where it started" as well as "cannot be edited",
      // so a press that moves nothing costs no text change and no undo entry.
      if (next === null) return;
      /* THE ANNOUNCEMENT SAYS PINNED, not moved, and that word is the whole
         point of it. A reader who drags a step has changed the document from
         "solve this node's place from the arrows" to "put it here" — a
         different kind of change from every other gesture on this canvas, and
         the only one with no gesture to undo it (ADR 0002). */
      applyCanvasEdit(
        next,
        `Pinned ${nodeId} at ${Math.round(position.x)}, ${Math.round(position.y)} — it no longer moves when the flow changes. The source text follows; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReviseFlowNode = useCallback(
    (nodeId: string, revision: FlowNodeRevision) => {
      const next = revisedFlowNodeEdit(doc, text, nodeId, revision);
      // null covers "the form was submitted unchanged" as well as "cannot be
      // edited", so a no-op press costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${nodeId} updated to “${revision.label}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReviseFlowEdge = useCallback(
    (index: number, revision: FlowEdgeRevision) => {
      const next = revisedFlowEdgeEdit(doc, text, index, revision);
      if (next === null) return;
      applyCanvasEdit(
        next,
        revision.label === undefined || revision.label === ""
          ? "Arrow label cleared — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
          : `Arrow labelled “${revision.label}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleConnectFlowNodes = useCallback(
    (from: string, to: string) => {
      const next = connectedFlowEdgeEdit(doc, text, from, to);
      if (next === null) {
        /* SAID, not swallowed. The viewer has already shown every refusal this
           gesture states for itself, so reaching here means the pane and the
           canvas disagree — a keystroke not yet parsed, or text that does not
           parse at all — and a completed drag that silently does nothing reads
           as a broken control rather than as a busy moment. */
        setAnnouncement(
          "The arrow was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Connected ${from} to ${to} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleDeleteFlowEdge = useCallback(
    (index: number) => {
      const edge = doc.kind === "flowchart" ? doc.file.edges[index] : undefined;
      const next = deletedFlowEdgeEdit(doc, text, index);
      if (next === null) {
        setAnnouncement(
          "The arrow was not removed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* THE VERDICT IS ANNOUNCED, not just performed. A removal that can leave
         a node unreachable has to say so at the moment it happens: the symbol
         is still on the canvas, so a reader who does not hear it has no signal
         that anything changed beyond one arrow. `deletedFlowEdgeEdit` states
         the same rule in prose. */
      const orphaned =
        edge !== undefined &&
        next.doc.kind === "flowchart" &&
        !next.doc.file.edges.some((candidate) => candidate.to === edge.to);
      applyCanvasEdit(
        next,
        edge === undefined
          ? "Arrow removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
          : `Arrow from ${edge.from} to ${edge.to} removed${orphaned ? `, leaving ${edge.to} with nothing pointing at it` : ""} — both steps are still declared and the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  /**
   * Why a connect would be declined, for the viewer to show DURING the drag.
   *
   * Delegated to the gesture module's own function rather than restated here,
   * because a second copy of the rules would be free to light a drop target
   * the gesture then refuses — the drag would promise something the release
   * takes away.
   */
  const handleInsertFlowStep = useCallback(
    (edgeIndex: number) => {
      const edge =
        doc.kind === "flowchart" ? doc.file.edges[edgeIndex] : undefined;
      const next = insertedFlowStepEdit(doc, text, edgeIndex);
      if (next === null) {
        setAnnouncement(
          "The step was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        edge === undefined
          ? "Step added — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
          : `Step added between ${edge.from} and ${edge.to} — its wording is open for editing, and the arrow is now two. The source text follows; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleGroupFlowNodes = useCallback(
    (nodeIds: readonly string[], label: string) => {
      const next = groupedFlowNodesEdit(doc, text, nodeIds, label);
      if (next === null) {
        /* The viewer greys the control and shows every refusal this gesture
           states for itself, so reaching here is the pane-and-canvas
           disagreement — see the connect handler's note. */
        setAnnouncement(
          "The group was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Grouped ${nodeIds.length} steps as “${label}” — nothing moved and no arrow changed; the frame is a bracket around steps already declared together. The source text follows; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  /** Why a grouping would be declined, for the viewer to show BEFORE the press.
   *  Delegated to the gesture module for the reason `flowchartConnectRefusal`
   *  gives: a second copy of the rules could enable a control the gesture then
   *  refuses. */
  const flowchartGroupRefusal = useCallback(
    (nodeIds: readonly string[]) =>
      doc.kind === "flowchart" ? flowGroupRefusal(doc.file, nodeIds) : null,
    [doc],
  );

  const flowchartConnectRefusal = useCallback(
    (from: string, to: string) =>
      doc.kind === "flowchart" ? flowConnectRefusal(doc.file, from, to) : null,
    [doc],
  );

  /**
   * The bundle the flowchart viewer takes — PRESENT only while editing is on.
   * Presence is the signal, as on the sequence canvas: no bundle, no grip, no
   * editable dock, no disabled controls.
   */
  /* ---------------------------------------------------------------------- */
  /* The placement canvases: ER and use case                                */
  /* ---------------------------------------------------------------------- */

  /* ONE SET OF HANDLERS PER NOTATION, not one shared pair branching on
     `doc.kind`. Each gesture module refuses a document of the wrong kind
     itself, so a shared handler would ask two modules and discard one answer;
     and the announcements differ in the noun a reader hears, which is the half
     of this that reaches a screen-reader user. */

  const handleMoveErEntity = useCallback(
    (entityId: string, position: { x: number; y: number }) => {
      const next = movedErEntityEdit(doc, text, entityId, position);
      // null covers "landed where it started" as well as "cannot be edited",
      // so a press that moves nothing costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Placed ${entityId} at ${Math.round(position.x)}, ${Math.round(position.y)} — the source text follows. The layout no longer decides where this entity sits.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handlePinErEntity = useCallback(
    (entityId: string, pinned: boolean) => {
      const next = pinnedErEntityEdit(doc, text, entityId, pinned);
      if (next === null) return;
      applyCanvasEdit(
        next,
        pinned
          ? `Pinned ${entityId} — a reset of this diagram's positions will now skip it.`
          : `Unpinned ${entityId} — a reset of this diagram's positions will hand it back to the layout.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReleaseErEntity = useCallback(
    (entityId: string) => {
      const next = resetErEntityPositionEdit(doc, text, entityId);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Handed ${entityId} back to the layout — its coordinates are gone from the source text and its column places it again.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReleaseErPositions = useCallback(() => {
    const next = resetErPositionsEdit(doc, text);
    /* SAID WHEN IT DOES NOTHING, unlike every gesture above. A sweep that
       finds only pinned entities is a button the reader pressed with a visible
       result they expected — silence there reads as a broken control, whereas
       a drag that moves nothing is self-evident. */
    if (next === null) {
      setAnnouncement(
        "Nothing to hand back — every entity placed by hand is pinned, so the reset skipped all of them. Unpin one to release it.",
      );
      return;
    }
    applyCanvasEdit(
      next,
      "Handed this diagram back to the layout — every entity that was not pinned lost its coordinates, and the schema places them again.",
    );
  }, [doc, text, applyCanvasEdit, setAnnouncement]);

  const handleReviseErEntity = useCallback(
    (entityId: string, revision: ErEntityRevision) => {
      const next = revisedErEntityEdit(doc, text, entityId, revision);
      // null covers "the form was submitted unchanged" as well as "cannot be
      // edited", so a no-op press costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${entityId} updated to “${revision.label}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleMoveUseCaseElement = useCallback(
    (elementId: string, position: { x: number; y: number }) => {
      const next = movedUseCaseElementEdit(doc, text, elementId, position);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Placed ${elementId} at ${Math.round(position.x)}, ${Math.round(position.y)} — the source text follows. The layout no longer decides where this element sits.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handlePinUseCaseElement = useCallback(
    (elementId: string, pinned: boolean) => {
      const next = pinnedUseCaseElementEdit(doc, text, elementId, pinned);
      if (next === null) return;
      applyCanvasEdit(
        next,
        pinned
          ? `Pinned ${elementId} — a reset of this diagram's positions will now skip it.`
          : `Unpinned ${elementId} — a reset of this diagram's positions will hand it back to the layout.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReleaseUseCaseElement = useCallback(
    (elementId: string) => {
      const next = resetUseCaseElementPositionEdit(doc, text, elementId);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Handed ${elementId} back to the layout — its coordinates are gone from the source text, and the boundary and its associations place it again.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReviseUseCaseElement = useCallback(
    (elementId: string, revision: UseCaseElementRevision) => {
      const next = revisedUseCaseElementEdit(doc, text, elementId, revision);
      /* SAID WHEN IT DOES NOTHING, unlike a drag: a reader who cleared the
         label and pressed Apply watched a field they typed into snap back, and
         silence there reads as a broken form. The gesture refuses an empty
         label because every grammar does. */
      if (next === null) {
        if (revision.label.trim() === "") {
          setAnnouncement(
            "An element needs a label — the wording was left as it was.",
          );
        }
        return;
      }
      applyCanvasEdit(next, `Reworded ${elementId} — the source text follows.`);
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const handleReleaseUseCasePositions = useCallback(() => {
    const next = resetUseCasePositionsEdit(doc, text);
    if (next === null) {
      setAnnouncement(
        "Nothing to hand back — every element placed by hand is pinned, so the reset skipped all of them. Unpin one to release it.",
      );
      return;
    }
    applyCanvasEdit(
      next,
      "Handed this diagram back to the layout — every element that was not pinned lost its coordinates, and the boundary places them again.",
    );
  }, [doc, text, applyCanvasEdit, setAnnouncement]);

  /* ---------------------------------------------------------------------- */
  /* The dictionary: an order, not a position                              */
  /* ---------------------------------------------------------------------- */

  const handleReorderDictSection = useCallback(
    (label: string, direction: "earlier" | "later") => {
      const next = reorderedDictSectionEdit(doc, text, label, direction);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Moved the ${label} section ${direction} — the section and every field in it moved together, and the source text follows.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReorderDictField = useCallback(
    (
      sectionLabel: string,
      fieldName: string,
      direction: "earlier" | "later",
    ) => {
      const next = reorderedDictFieldEdit(
        doc,
        text,
        sectionLabel,
        fieldName,
        direction,
      );
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Moved ${fieldName} ${direction} within ${sectionLabel} — the source text follows.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const erEdit = useMemo<ErEditHandlerSet | undefined>(
    () =>
      erEditable
        ? {
            onMove: handleMoveErEntity,
            onPin: handlePinErEntity,
            onRelease: handleReleaseErEntity,
            onReleaseAll: handleReleaseErPositions,
            /* ASKED OF THE GRID, not inherited from `erEditable`. That flag
               carries the `move` cell's answer plus the reader's lock, and
               `revise` is a cell of its own — a panel that offered fields the
               gesture would decline is the "control that cannot change
               anything" this canvas's placement buttons already refuse to be.
               The gesture asks again for itself; this is what stops the form
               from rendering at all. */
            onRevise: canvasEditability(doc, "revise").editable
              ? handleReviseErEntity
              : undefined,
          }
        : undefined,
    [
      doc,
      erEditable,
      handleMoveErEntity,
      handlePinErEntity,
      handleReleaseErEntity,
      handleReleaseErPositions,
      handleReviseErEntity,
    ],
  );

  const usecaseEdit = useMemo<UseCaseEditHandlerSet | undefined>(
    () =>
      usecaseEditable
        ? {
            onMove: handleMoveUseCaseElement,
            onPin: handlePinUseCaseElement,
            onRelease: handleReleaseUseCaseElement,
            /* ASKED PER ABILITY, not inherited from `usecaseEditable` above:
               that flag is the `move` offer, and this canvas can be given one
               without the other. Set only when the grid offers `revise` for
               this document AND this pane, so it self-heals if either
               changes. */
            onRevise: canvasEditability(doc, "revise").editable
              ? handleReviseUseCaseElement
              : undefined,
            onReleaseAll: handleReleaseUseCasePositions,
          }
        : undefined,
    [
      usecaseEditable,
      handleMoveUseCaseElement,
      handlePinUseCaseElement,
      handleReleaseUseCaseElement,
      handleReleaseUseCasePositions,
      doc,
      handleReviseUseCaseElement,
    ],
  );

  /* ---------------------------------------------------------------------- */
  /* The heading: the document's own title and description                  */
  /* ---------------------------------------------------------------------- */

  const handleRetitle = useCallback(
    (fields: RetitleFields) => {
      const next = retitledEdit(doc, text, fields);
      /* SAID WHEN IT REFUSES, unlike a drag. A reader who cleared the title
         and pressed Apply watched a field they typed into snap back, and
         silence there reads as a broken form — whereas a drag that moves
         nothing is self-evident. The field is `required`, so the browser
         catches this first; the announcement is what a screen-reader user
         gets if it ever reaches here another way. */
      if (next === null) {
        if (fields.title !== undefined && fields.title.trim() === "") {
          setAnnouncement(
            "A diagram needs a title — every .alab document requires one, so the heading was left as it was.",
          );
        }
        return;
      }
      const said = [
        fields.title === undefined ? null : `titled "${fields.title}"`,
        fields.description === undefined
          ? null
          : fields.description.trim() === ""
            ? "description removed"
            : "description rewritten",
      ].filter((part) => part !== null);
      applyCanvasEdit(
        next,
        `Heading updated — ${said.join(", ")}. The source text follows.`,
      );
    },
    [doc, text, applyCanvasEdit, setAnnouncement],
  );

  const retitleEdit = useMemo<RetitleEditHandlers | undefined>(
    () => (retitleEditable ? { onRetitle: handleRetitle } : undefined),
    [retitleEditable, handleRetitle],
  );

  const dictEdit = useMemo<DictEditHandlers | undefined>(
    () =>
      dictEditable
        ? {
            onReorderSection: handleReorderDictSection,
            onReorderField: handleReorderDictField,
            reorderRefusal: dictReorderRefusal,
          }
        : undefined,
    [dictEditable, handleReorderDictSection, handleReorderDictField],
  );

  const flowchartEdit = useMemo<FlowchartEditHandlers | undefined>(
    () =>
      flowchartEditable
        ? {
            onMoveNode: handleMoveFlowNode,
            onReviseNode: handleReviseFlowNode,
            onReviseEdge: handleReviseFlowEdge,
            onConnectNodes: handleConnectFlowNodes,
            onDeleteEdge: handleDeleteFlowEdge,
            onInsertStep: handleInsertFlowStep,
            onGroupNodes: handleGroupFlowNodes,
            connectRefusal: flowchartConnectRefusal,
            groupRefusal: flowchartGroupRefusal,
          }
        : undefined,
    [
      flowchartEditable,
      handleMoveFlowNode,
      handleReviseFlowNode,
      handleReviseFlowEdge,
      handleConnectFlowNodes,
      handleDeleteFlowEdge,
      handleInsertFlowStep,
      handleGroupFlowNodes,
      flowchartConnectRefusal,
      flowchartGroupRefusal,
    ],
  );

  /** Put the previous source text back and parse it — see `canvasUndoRef`. */
  const handleCanvasUndo = useCallback(() => {
    const previous = canvasUndoRef.current.pop();
    if (previous === undefined) {
      setAnnouncement("Nothing left to undo on the diagram.");
      return;
    }
    setPending(null);
    setText(previous);
    // `"source"` because the text is already set above: this parses it and
    // adopts the document without rewriting the pane it came from.
    applyEdit("source", previous);
    setAnnouncement("Undid the last change made on the diagram.");
  }, [applyEdit, setText, setPending, setAnnouncement]);

  /** The handlers together, so the canvas cannot be half-editable.
   *
   * Gated on `canvasEditable` — the `move` answer — even though the bundle now
   * also carries `revise`: for a C4 document the two cells refuse in exactly
   * the same case (a Mermaid pane), so one gate is the honest one and a second
   * would be a condition that can never differ, kept in step by hand. If the
   * cells ever diverge, `revisedNodeEdit` still asks `canvasEditability` for
   * itself — every gesture guards its own ability. */
  const canvasEdit = useMemo(
    () =>
      canvasEditable
        ? {
            onNodeMove: handleNodeMove,
            onNodeResetPosition: handleNodeResetPosition,
            onNodeRevise: handleNodeRevise,
            onNodeDelete: handleNodeDelete,
            onNodeCreate: handleNodeCreate,
            onRefCreate: handleRefCreate,
            onNodeNest: handleNodeNest,
            onNodeUnnest: handleNodeUnnest,
            onNodesGroup: handleNodesGroup,
            onFrameRename: handleFrameRename,
            onFrameDelete: handleFrameDelete,
            onEdgeRevise: handleEdgeRevise,
            onEdgeDelete: handleEdgeDelete,
            onNodeConnect: handleNodeConnect,
            onConnectCreate: handleConnectCreate,
            onUndo: handleCanvasUndo,
          }
        : undefined,
    [
      canvasEditable,
      handleNodeMove,
      handleNodeResetPosition,
      handleNodeRevise,
      handleNodeDelete,
      handleNodeCreate,
      handleRefCreate,
      handleNodeNest,
      handleNodeUnnest,
      handleNodesGroup,
      handleFrameRename,
      handleFrameDelete,
      handleEdgeRevise,
      handleEdgeDelete,
      handleNodeConnect,
      handleConnectCreate,
      handleCanvasUndo,
    ],
  );

  /* `changeDirection` is returned BESIDE `canvasEdit` rather than inside it.
     `CanvasEditHandlers` is the set of gestures the CANVAS invokes — a drag, a
     click on a node, a grip — and this one is invoked by a control the
     playground renders in the lock slot, at the canvas's top right. Putting it
     in that interface would say the canvas calls it, and nothing in the canvas
     does.

     `resetLayerPositions` rides beside it for exactly that reason and no
     other: it is pressed in the same menu. Its per-element twin
     (`handleNodeResetPosition`) IS in the bundle, because the details panel
     the canvas owns is what offers it — the same split the revise gesture
     already has. */
  return {
    canvasEdit,
    sequenceEdit,
    flowchartEdit,
    erEdit,
    usecaseEdit,
    dictEdit,
    retitleEdit,
    applyDirection,
    clearDirection,
    resetLayerPositions,
  };
}
