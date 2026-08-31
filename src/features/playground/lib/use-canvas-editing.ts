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
  connectedNewNodeEdit,
  connectedNodesEdit,
  createdNodeEdit,
  createdNodeName,
  createdRefEdit,
  deletedEdgeEdit,
  deletedFrameEdit,
  deletedNodeEdit,
  groupedNodesEdit,
  movedNodeEdit,
  nestedNodeEdit,
  ownsChildDiagram,
  renamedFrameEdit,
  revisedEdgeEdit,
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

/**
 * How many canvas edits back the diagram-side undo reaches. Deep enough to
 * cover a run of drags, shallow enough that the ring cannot grow unbounded on
 * a long session.
 */
const CANVAS_UNDO_DEPTH = 50;

/** What the hook needs from the page that owns the document. */
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
  setText,
  setPending,
  setAnnouncement,
  adoptDocument,
  applyEdit,
}: CanvasEditingHost): {
  canvasEdit: CanvasEditHandlers | undefined;
  sequenceEdit: SequenceEditHandlers | undefined;
  flowchartEdit: FlowchartEditHandlers | undefined;
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

  return { canvasEdit, sequenceEdit, flowchartEdit };
}
