/**
 * Flowchart-canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The third sibling of `canvas-edit.ts` (C4) and `sequence-edit.ts`. The same
 * three rules hold, and they are why this is a third file rather than a flag
 * in one of the other two:
 *
 *   - THE ONE MODEL RULE. The page holds exactly one authority for what is on
 *     screen — the `ViewDocument` from the last good parse — and the source
 *     pane is its text. Nothing here mutates: a gesture derives NEW source
 *     text, re-parses it, and hands both back through the path a keystroke
 *     already takes. No React, no state.
 *   - AN EDIT IS A LINE PATCH. `line-patch.ts` carries the bug that bought
 *     that rule and the splice that keeps it.
 *   - PURITY IS LOAD-BEARING. `check:canvas-edit` loads this through Node's
 *     type stripping, which cannot read `.tsx` at all. Keep new imports
 *     pointed at pure modules.
 *
 * WHAT IS DIFFERENT HERE, and why it is not one file with the sequence one:
 *
 *   1. AN EDGE HAS NO ID, so it is addressed by its INDEX in `file.edges`.
 *      Not by a `from`/`to` pair: two edges between the same nodes are legal
 *      text — a retry and a fallback can both run `a -> b` — so a pair is not
 *      a key. `FlowchartSpans.edges` is an index-aligned array for exactly
 *      that reason, and it is the whole argument for this addressing.
 *   2. A POSITION IS OPTIONAL, AND ABSENT IS THE NORMAL CASE. `FlowchartNode`
 *      grew a `position` (ADR 0002, superseding ADR 0001, which had refused
 *      one): a node with no `(x,y)` is solved from the arrows as it always
 *      was, and `movedFlowNodeEdit` PINS one that has been dragged. So a move
 *      here is not the C4 move — it opts a single node out of the solver
 *      rather than placing it on a grid where everything is placed.
 *   3. THERE IS NO RE-EMIT FALLBACK, as on the sequence side and for the same
 *      reason: a flowchart document has no JSON pane, so every case a patch
 *      cannot be made is a case where re-emitting would eat the reader's
 *      comments for nothing. Every gesture returns `path: "patch"` or `null`.
 *
 * ONE HAZARD THIS FILE OWNS. A flowchart is a GRAPH, and three of these
 * gestures change its shape rather than its wording. Each states its own
 * verdict at the gesture — `connectedFlowEdgeEdit` says what it refuses to
 * author, `insertedFlowStepEdit` says which half of a split keeps the guard
 * label, and `deletedFlowEdgeEdit` says what it leaves behind — because "a
 * removal is not the inverse of an insert" is the rule `canvas-editing.md`
 * spends a paragraph on and the one this notation is most able to break.
 */

import type {
  FlowchartEdge,
  FlowchartLabFile,
  FlowchartNode,
  FlowchartNodeShape,
} from "@/types";

import {
  canonicalFlowEdgeBlock,
  canonicalFlowNodeBlock,
  FLOWCHART_GROUP_KEYWORD,
  parseFlowchartTextWithSpans,
  serializeFlowchartText,
  type FlowchartSpans,
  type LineSpan,
} from "@/features/archtext";
// A deep import, but a PURE one — `input/parse.ts` in that feature exports no
// component, so this module stays loadable by the check script's type
// stripping. The barrel would not be.
import { parseFlowchartInput } from "@/features/flowchart/input/parse";

import { canvasEditability } from "./canvas-edit";
import {
  applyPatches,
  indentOf,
  type CanvasEdit,
  type LinePatch,
} from "./line-patch";
import type { ViewDocument } from "./parse";

type FlowchartDocument = Extract<ViewDocument, { kind: "flowchart" }>;

/** The fields a selected node's dock may rewrite.
 *
 * `shape` IS ABSENT, and that is the whole content of this type. Turning a
 * step into a decision changes what its outgoing edges MEAN — they become
 * guarded branches — so it is a graph edit wearing a field edit's clothes, and
 * a dock that offered it beside the label would let a reader change the
 * document's logic while believing they were retyping a caption. */
export interface FlowNodeRevision {
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
}

/** The one field an arrow carries. On an edge leaving a `decision` this is the
 *  GUARD, which is why it is worth a gesture of its own: it is the only place
 *  the text says why a branch is taken. */
export interface FlowEdgeRevision {
  label?: string;
}

/* -------------------------------------------------------------------------- */
/* Revise                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one node's own fields rewritten, or `null` when the edit cannot
 * apply.
 *
 * DESTRUCTURE AND OVERWRITE, matching both siblings: an explicit `undefined`
 * in the revision is what REMOVES a field, so a dock that clears the
 * technology box drops the `[…]` from the line rather than leaving the old
 * value behind. Spreading the current node and overlaying the revision would
 * make a cleared field indistinguishable from an untouched one.
 */
export function revisedFlowNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  nodeId: string,
  revision: FlowNodeRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "flowchart") {
    return null;
  }
  const current = doc.file.nodes.find((node) => node.id === nodeId);
  if (current === undefined) return null;

  const { label, technology, tags, description } = revision;
  // An empty label is a document the parser refuses ("the node label must not
  // be empty"), so the reader would press once and be left with an error over
  // a diagram they could no longer edit.
  if (label === "") return null;

  const revised: FlowchartNode = {
    id: current.id,
    // Carried, never revised — see `FlowNodeRevision`.
    shape: current.shape as FlowchartNodeShape,
    label,
    ...(technology === undefined ? {} : { technology }),
    ...(tags === undefined || tags.length === 0 ? {} : { tags }),
    ...(description === undefined ? {} : { description }),
  };
  const edited: FlowchartLabFile = {
    ...doc.file,
    nodes: doc.file.nodes.map((node) => (node.id === nodeId ? revised : node)),
  };
  return patchBlock(doc, sourceText, (spans, pad) => ({
    span: spans.nodes.get(nodeId),
    lines: canonicalFlowNodeBlock(edited, nodeId, pad),
  }));
}

/**
 * `doc` with one arrow's label rewritten, or `null` when the edit cannot
 * apply.
 *
 * BY INDEX, for the reason this file's header gives: a pair of node ids does
 * not identify an edge, and a lookup by one would rewrite whichever of two
 * parallel arrows it found first — silently, and a screen away from where the
 * reader was looking.
 */
export function revisedFlowEdgeEdit(
  doc: ViewDocument,
  sourceText: string,
  index: number,
  revision: FlowEdgeRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "flowchart") {
    return null;
  }
  const current = doc.file.edges[index];
  if (current === undefined) return null;

  const { label } = revision;
  const revised: FlowchartEdge = {
    from: current.from,
    to: current.to,
    /* An EMPTY label is dropped rather than written. `: ""` round-trips out of
       the Mermaid pane as no label at all (`MERMAID_FLOWCHART_EXPORT_CAVEAT`
       names it), so keeping the two apart here would preserve a distinction
       one of this document's own panes cannot hold. */
    ...(label === undefined || label === "" ? {} : { label }),
  };
  const edited: FlowchartLabFile = {
    ...doc.file,
    edges: doc.file.edges.map((edge, at) => (at === index ? revised : edge)),
  };
  return patchBlock(doc, sourceText, (spans, pad) => ({
    span: spans.edges[index],
    lines: canonicalFlowEdgeBlock(edited, index, pad),
  }));
}

/* -------------------------------------------------------------------------- */
/* Move                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one node PINNED at `position`, or `null` when the edit cannot
 * apply.
 *
 * THIS GESTURE DID NOT EXIST FOR A RELEASE, and the refusal it replaces is
 * worth knowing about: this grammar had no coordinate, so a drag was undone by
 * the next parse and the cell refused `move` on `"grammar"` grounds. ADR 0002
 * records the decision to add the field and supersedes ADR 0001, which
 * recorded the decision not to. Do not re-derive that argument from this
 * function; read the ADRs.
 *
 * PINNING IS ONE-WAY HERE. There is no "unpin" gesture, because dragging is
 * how a reader pins and nothing on the canvas is shaped like "give this node
 * back to the solver" — deleting the `(x,y)` in the source pane is. That is a
 * real gap rather than a decision, and the first person to want it should add
 * it as its own gesture with its own announcement, not as a magic drop target.
 *
 * COORDINATES ARE ROUNDED, because a drag produces sub-pixel floats and a
 * `.alab` file is something a human reads and diffs. `240.00000000000003` in
 * an author's text is noise the gesture created, and the layout cannot tell
 * the difference.
 */
export function movedFlowNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  nodeId: string,
  position: { x: number; y: number },
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "flowchart") {
    return null;
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const current = doc.file.nodes.find((node) => node.id === nodeId);
  if (current === undefined) return null;

  /* ROUNDED, AND DELIBERATELY NOT CLAMPED. A negative coordinate is normal
     here: `layout.ts` builds every row around axis 0, so the solved space this
     position lives in is centred on zero and the drawn canvas is that space
     shifted right by `layout.offset`. Clamping at the origin was tried and was
     wrong — it made the entire left half of the canvas undroppable, because a
     drop there maps to a stored x below zero by design.

     Rounding stays: a drag produces sub-pixel floats, and
     `240.00000000000003` in an author's text is noise this gesture created. */
  const at = { x: Math.round(position.x), y: Math.round(position.y) };
  const revised: FlowchartNode = { ...current, position: at };
  const edited: FlowchartLabFile = {
    ...doc.file,
    nodes: doc.file.nodes.map((node) => (node.id === nodeId ? revised : node)),
  };
  /* `patchBlock` returns `null` when the patched text equals the source, which
     is exactly what a drag that landed where it started should cost: no text
     change, no undo entry, no re-render. */
  return patchBlock(doc, sourceText, (spans, pad) => ({
    span: spans.nodes.get(nodeId),
    lines: canonicalFlowNodeBlock(edited, nodeId, pad),
  }));
}

/* -------------------------------------------------------------------------- */
/* Connect                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why a connect gesture declined, or `null` when it would be accepted — the
 * verdict this file's header requires an insert to state.
 *
 * ALL THREE SHAPES BELOW ARE LEGAL `.alab`, and they stay legal: the PARSER is
 * not tightened, because tightening it would invalidate documents people
 * already hold on disk. A gesture may decline to author what the grammar
 * tolerates; that asymmetry is deliberate and is the whole reason this
 * function exists separately from the parser.
 *
 * Exported so the canvas can refuse a drag at the grip — with the sentence —
 * rather than letting it complete and quietly changing nothing.
 */
export function flowConnectRefusal(
  file: FlowchartLabFile,
  from: string,
  to: string,
): string | null {
  const byId = new Map(file.nodes.map((node) => [node.id, node]));
  const source = byId.get(from);
  const target = byId.get(to);
  /* An endpoint that is not a declared node makes a document the parser
     refuses ("does not resolve to a node"). No sentence for this one: it is
     unreachable from a drag between two drawn symbols, and a refusal a reader
     cannot provoke is a refusal nobody should have to read. */
  if (source === undefined || target === undefined) return null;

  if (from === to) {
    return "A step cannot follow itself — point the arrow at the next step instead.";
  }
  if (file.edges.some((edge) => edge.from === from && edge.to === to)) {
    return "These two steps are already connected.";
  }
  /* THE TERMINATORS, and this pair is one rule read from both ends: a flow
     that leaves an `end` has not ended, and a flow that arrives at a `start`
     did not start there. Both draw as a diagram that reads as broken, which
     `purpose.md` calls a bug in this codebase rather than a matter of taste. */
  if (source.shape === "end") {
    return "An end terminator is where the flow stops, so nothing leaves it.";
  }
  if (target.shape === "start") {
    return "A start terminator is where the flow begins, so nothing arrives at it.";
  }
  return null;
}

/**
 * `doc` with one arrow added between two existing nodes, or `null` when the
 * edit cannot apply — including every case `flowConnectRefusal` names.
 *
 * WHERE THE LINE LANDS: appended to the END of the edges block. The
 * alternative — inserting after the source node's last outgoing edge — would
 * keep a decision's branches contiguous, which `src/types/flowchart.ts` says
 * is meaningful (`edges` is "the author's narration order", and a decision's
 * branches "are read in the order its outgoing edges appear"). Appending
 * therefore trades narration order for a smaller diff, KNOWINGLY: ADR 0001
 * records the choice so the next reader does not take it for an oversight. If
 * contiguity later matters more, the fix is a separate tidy action rather than
 * a change here.
 *
 * THE ANCHOR IS A SPAN, NEVER A SCAN of the text for the last `->`. A second
 * reading of the document's shape, free to disagree with the parser's, is the
 * "two halves, each self-consistent, that disagree" failure `codebase.md`
 * names as the most expensive class in this repo.
 *
 * EXACTLY ONE LINE IS ADDED. The new edge carries no `!` escapes, so its
 * canonical block is one line by construction rather than by a rule this
 * function has to remember.
 */
export function connectedFlowEdgeEdit(
  doc: ViewDocument,
  sourceText: string,
  from: string,
  to: string,
  label?: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "connect").editable || doc.kind !== "flowchart") {
    return null;
  }
  if (flowConnectRefusal(doc.file, from, to) !== null) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;

  const edge: FlowchartEdge = {
    from,
    to,
    ...(label === undefined || label === "" ? {} : { label }),
  };
  const edited: FlowchartLabFile = {
    ...doc.file,
    edges: [...doc.file.edges, edge],
  };
  const index = edited.edges.length - 1;

  /* The anchor: the last existing edge's block, or — for a document that
     declares nodes and no edges yet — the last node's. Both are spans from the
     parse above. A flowchart with no nodes at all cannot take an edge, and
     could not have been drawn on to begin with. */
  const lines = sourceText.split("\n");
  const lastEdge = patchable.spans.edges.at(-1);
  const anchorEnd =
    lastEdge?.end ??
    Math.max(0, ...[...patchable.spans.nodes.values()].map((s) => s.end));
  if (anchorEnd === 0) return null;

  /* The pad comes off the anchor LINE, as every patch in this family does.
     For an edge that is always two spaces — the grammar forbids an edge inside
     a `group` — but reading it beats asserting it, and a node anchor may sit
     at four. */
  const pad = lastEdge === undefined ? "  " : indentOf(lines[anchorEnd - 1]);
  const written = canonicalFlowEdgeBlock(edited, index, pad);
  if (written === null) return null;

  const patch: LinePatch = {
    // The empty-span insert form `applyPatches` documents: nothing consumed,
    // the new lines land after `anchorEnd`.
    span: { start: anchorEnd + 1, end: anchorEnd },
    lines: written,
  };
  return adopt(doc, applyPatches(sourceText, [patch]));
}

/* -------------------------------------------------------------------------- */
/* Create — by splitting an arrow                                             */
/* -------------------------------------------------------------------------- */

/** The label a step gets when the canvas mints it. Named rather than inlined
 *  because the announcement quotes it, and two spellings of the new step's
 *  name is how the reader is told to look for something that is not there. */
export const INSERTED_FLOW_STEP_LABEL = "New step";

/**
 * `doc` with a new step inserted INTO an existing arrow — `a -> b` becomes
 * `a -> new` and `new -> b` — or `null` when the edit cannot apply.
 *
 * WHY SPLITTING AN ARROW IS THE CREATE GESTURE THIS NOTATION GETS, and why it
 * needed no new grammar even before positions existed: the hard question for
 * `create` on a solved-layout notation is always "where does the new element
 * GO", and every answer used to be "nowhere the text can say". Splitting an
 * arrow answers it structurally instead — the new step's place is *between
 * these two steps*, which is exactly what two edges spell. The reader points
 * at the arrow and the position falls out of the flow rather than out of a
 * coordinate.
 *
 * IT IS DELIBERATELY UNPINNED. The new step carries no `(x,y)`, so it is
 * solved from the arrows like any other — a created node that arrived
 * pre-pinned would hand the reader a node they must drag before the layout
 * behaves, which is the opposite of the gesture's point.
 *
 * THE GUARD LABEL TRAVELS WITH THE FIRST HALF. `fresh -> reprice : "no"` split
 * becomes `fresh -> new : "no"` and `new -> reprice`, because the label on an
 * edge out of a decision IS the branch condition — moving it to the second
 * half would silently reword which branch the reader is on, and dropping it
 * would delete a condition nobody asked to delete.
 *
 * TWO PATCHES, ONE SPLICE. The node declaration lands at the end of the node
 * block and the edge line becomes two; `applyPatches` sorts and applies both,
 * so the text is only ever read once and the two edits cannot disagree about
 * line numbers.
 */
export function insertedFlowStepEdit(
  doc: ViewDocument,
  sourceText: string,
  edgeIndex: number,
): CanvasEdit | null {
  /* GATED ON `create`, not on `revise` — this is the ability the grid names
     for adding an element, and asking the cell that actually answers for it is
     what keeps a gesture honest the day the cells diverge. */
  if (!canvasEditability(doc, "create").editable || doc.kind !== "flowchart") {
    return null;
  }
  const edge = doc.file.edges[edgeIndex];
  if (edge === undefined) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const edgeSpan = patchable.spans.edges[edgeIndex];
  if (edgeSpan === undefined) return null;

  /* A fresh id, minted against the ids the document already holds. `step2`
     rather than a hash or a uuid: the id is a token the author will read, type
     and rename, and `.alab` ids are human-readable by design. */
  const taken = new Set(doc.file.nodes.map((node) => node.id));
  let ordinal = taken.size + 1;
  while (taken.has(`step${ordinal}`)) ordinal += 1;
  const id = `step${ordinal}`;

  const created: FlowchartNode = {
    id,
    // A plain process box: the neutral shape, and the one whose meaning does
    // not depend on its outgoing edges the way a `decision`'s does.
    shape: "step",
    label: INSERTED_FLOW_STEP_LABEL,
  };
  const edited: FlowchartLabFile = {
    ...doc.file,
    nodes: [...doc.file.nodes, created],
    edges: doc.file.edges.flatMap((candidate, at) =>
      at !== edgeIndex
        ? [candidate]
        : [
            {
              from: candidate.from,
              to: id,
              ...(candidate.label === undefined
                ? {}
                : { label: candidate.label }),
            },
            { from: id, to: candidate.to },
          ],
    ),
  };

  /* The node lands after the LAST node's block. At the body's own indent, not
     the anchor's: a last node nested in a `group` sits at four spaces, and
     matching it would silently enrol the new step in that group. Two spaces
     dedents out of the group, which is where a step the reader created by
     pointing at an arrow belongs — the arrow was never inside the group
     (the grammar forbids that) so neither is the step that splits it. */
  const nodeSpans = [...patchable.spans.nodes.values()];
  const lastNodeEnd = Math.max(0, ...nodeSpans.map((span) => span.end));
  if (lastNodeEnd === 0) return null;
  const nodeLines = canonicalFlowNodeBlock(edited, id, "  ");
  if (nodeLines === null) return null;

  const lines = sourceText.split("\n");
  const edgePad = indentOf(lines[edgeSpan.start - 1]);
  const firstHalf = canonicalFlowEdgeBlock(edited, edgeIndex, edgePad);
  const secondHalf = canonicalFlowEdgeBlock(edited, edgeIndex + 1, edgePad);
  if (firstHalf === null || secondHalf === null) return null;

  const patched = applyPatches(sourceText, [
    { span: { start: lastNodeEnd + 1, end: lastNodeEnd }, lines: nodeLines },
    { span: edgeSpan, lines: [...firstHalf, ...secondHalf] },
  ]);
  const adopted = adopt(doc, patched);
  return adopted === null ? null : { ...adopted, createdNodeId: id };
}

/* -------------------------------------------------------------------------- */
/* Group — wrapping a run of steps in a frame                                 */
/* -------------------------------------------------------------------------- */

/** The label a group gets when the canvas mints one. */
export const GROUPED_FLOW_LABEL = "New group";

/**
 * Why these steps cannot be grouped, or `null` when they can.
 *
 * THE CONTIGUITY RULE IS THE WHOLE OF THIS FUNCTION, and it is a fact about
 * the format rather than a policy this gesture chose. A `group` in `.alab`
 * flowchart text has no member list: its members are the node lines NESTED
 * inside it, so the run of nodes it wraps is whatever sits between its opener
 * and the next dedent. A group over three scattered nodes is therefore not
 * merely disallowed — it is unspellable (`keywords.ts` states it), and the
 * serializer refuses such a model outright rather than writing something the
 * parser would read back differently.
 *
 * SO THE REFUSAL NAMES THE STEPS IN THE WAY. "These are not neighbours" tells
 * a reader they have done something wrong; naming what sits between them tells
 * them what to add to the selection, which is the difference between a dead
 * end and an instruction. `canvas-editing.md` requires the first and this is
 * the second.
 *
 * Exported so the canvas can grey the control and show the sentence BEFORE the
 * reader presses it, rather than after.
 */
export function flowGroupRefusal(
  file: FlowchartLabFile,
  nodeIds: readonly string[],
): string | null {
  const wanted = new Set(nodeIds);
  if (wanted.size < 2) {
    return "Select at least two steps to group them.";
  }
  const indices = file.nodes
    .map((node, at) => (wanted.has(node.id) ? at : -1))
    .filter((at) => at !== -1);
  if (indices.length !== wanted.size) {
    return "One of the selected steps is not in this diagram any more.";
  }
  /* ALREADY GROUPED: groups do not nest in this grammar, so a node that is
     already inside one cannot join a second. Checked before contiguity because
     it is the more specific answer — a reader whose selection is contiguous
     AND already grouped would otherwise be told the wrong thing. */
  const grouped = new Set((file.groups ?? []).flatMap((group) => group.nodes));
  const already = nodeIds.filter((id) => grouped.has(id));
  if (already.length > 0) {
    return `${already.join(" and ")} ${already.length === 1 ? "is" : "are"} already in a group, and groups cannot nest.`;
  }
  const first = indices[0];
  const last = indices[indices.length - 1];
  const between = file.nodes
    .slice(first, last + 1)
    .filter((node) => !wanted.has(node.id))
    .map((node) => node.id);
  if (between.length > 0) {
    return `These steps are not neighbours — ${between.join(", ")} ${between.length === 1 ? "sits" : "sit"} between them. A group wraps a run of steps declared together, so add ${between.length === 1 ? "it" : "them"} to the selection or pick a different run.`;
  }
  return null;
}

/**
 * `doc` with a `group` wrapped around a contiguous run of steps, or `null`
 * when the edit cannot apply — including every case `flowGroupRefusal` names.
 *
 * THE MEMBERS' OWN BYTES ARE RE-INDENTED, NOT RE-EMITTED, and that is the one
 * interesting decision here. Nesting a node means its line moves two spaces
 * right; asking the serializer for a canonical block at the new pad would also
 * quietly reorder any `!` escapes the author wrote and renormalise anything
 * canonical form omits. Prefixing the existing lines is the smaller and more
 * faithful edit: every byte of the member is the author's, two spaces further
 * in.
 *
 * A `//` COMMENT BETWEEN TWO MEMBERS SURVIVES WHERE IT SAT, at its old indent.
 * That is legal — the parser skips comment lines before it checks item indent
 * — and it is why this patches each member's block separately instead of
 * replacing the whole run in one go. A single-span replacement would have
 * swallowed the comment.
 */
export function groupedFlowNodesEdit(
  doc: ViewDocument,
  sourceText: string,
  nodeIds: readonly string[],
  label: string,
): CanvasEdit | null {
  /* `revise` rather than `create`: this adds no element to the flow. A group
     is a bracket around steps that already exist — nothing new can be reached,
     and no arrow changes — so it belongs with the ability that rewrites what
     is already there. */
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "flowchart") {
    return null;
  }
  if (label.trim() === "") return null;
  if (flowGroupRefusal(doc.file, nodeIds) !== null) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;

  const wanted = new Set(nodeIds);
  const members = doc.file.nodes.filter((node) => wanted.has(node.id));
  const spans = members.map((node) => patchable.spans.nodes.get(node.id));
  if (spans.some((span) => span === undefined)) return null;

  const lines = sourceText.split("\n");
  const firstSpan = spans[0];
  if (firstSpan === undefined) return null;
  const pad = indentOf(lines[firstSpan.start - 1]);

  const patches: LinePatch[] = [
    {
      // The opener goes where the first member starts, consuming nothing.
      span: { start: firstSpan.start, end: firstSpan.start - 1 },
      lines: [
        `${pad}${FLOWCHART_GROUP_KEYWORD} ${JSON.stringify(label.trim())}`,
      ],
    },
    ...spans.map((span) => ({
      span: span as LineSpan,
      lines: lines
        .slice((span as LineSpan).start - 1, (span as LineSpan).end)
        .map((line) => `  ${line}`),
    })),
  ];
  return adopt(doc, applyPatches(sourceText, patches));
}

/* -------------------------------------------------------------------------- */
/* Remove                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one arrow removed — and nothing else — or `null` when the edit
 * cannot apply.
 *
 * THE VERDICT, which every removal in this codebase owes its reader:
 *
 *   - It removes EXACTLY its own span: the edge line plus any `!`
 *     continuations the author hung under it. No other line is touched.
 *   - It leaves BOTH nodes declared. A node the removed arrow was the last
 *     route to is now unreachable, and that is the reader's to see and
 *     decide about — the gesture does not cascade, because a cascade would
 *     delete a symbol a screen away from where the reader pressed.
 *   - It renumbers nothing, because a flowchart has nothing numbered. The
 *     indices of every LATER edge shift down by one, which matters only to a
 *     caller holding one across the edit; the canvas re-derives its selection
 *     from the adopted document rather than carrying an index over it.
 *
 * NODE REMOVAL IS NOT HERE, deliberately. Its verdict would have to answer
 * what happens to a group left empty, to a decision left with a single branch,
 * and to a graph split in two — three questions with nothing to do with
 * removing an arrow, and each one able to change the drawing far from the
 * press. It is its own change.
 */
export function deletedFlowEdgeEdit(
  doc: ViewDocument,
  sourceText: string,
  index: number,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "flowchart") {
    return null;
  }
  if (doc.file.edges[index] === undefined) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.edges[index];
  if (span === undefined) return null;

  const patched = applyPatches(sourceText, [{ span, lines: [] }]);
  return adopt(doc, patched);
}

/* -------------------------------------------------------------------------- */
/* The shared machinery                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whether `sourceText` can be patched by line number for the document on
 * screen, and — when it can — the spans that parse produced.
 *
 * TWO THINGS FORCE A REFUSAL. A pane holding Mermaid has no `.alab` line
 * numbers to splice into at all. And THE PANE AND THE CANVAS CAN DISAGREE: an
 * edit is reachable while the pane holds text that does not parse — the canvas
 * keeps showing the last good version — and the keystroke debounce can leave a
 * change un-parsed for a moment. The pane's line numbers then describe a
 * different document, and splicing into it would corrupt the reader's file
 * rather than preserve it. Agreement is MEASURED, by re-serialising both sides
 * to the same canonical bytes, rather than read off a flag that could lie.
 */
function patchablePane(
  doc: FlowchartDocument,
  sourceText: string,
): { spans: FlowchartSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    const parsed = parseFlowchartTextWithSpans(sourceText);
    if (
      serializeFlowchartText(parsed.file) !== serializeFlowchartText(doc.file)
    ) {
      return null;
    }
    return { spans: parsed.spans };
  } catch {
    return null;
  }
}

/**
 * The shape both revise gestures share: find the element's span, ask the
 * serializer for its canonical block at that span's own indentation, splice.
 *
 * Returns `null` — never a re-emit — for every case that cannot be patched.
 */
function patchBlock(
  doc: FlowchartDocument,
  sourceText: string,
  resolve: (
    spans: FlowchartSpans,
    pad: string,
  ) => {
    span: { start: number; end: number } | undefined;
    lines: string[] | null;
  },
): CanvasEdit | null {
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const lines = sourceText.split("\n");

  /* Resolved twice on purpose, as on the sequence side: once with an empty pad
     to LOCATE the block, then again with the pad read off its first line to
     write it. Two calls beat threading the pad in from the caller, which would
     put the indentation rule in two places — and here it carries real weight,
     because a node inside a `group` sits two spaces deeper than one outside
     it, and a re-derived pad could move a node out of its group. */
  const located = resolve(patchable.spans, "");
  if (located.span === undefined) return null;
  const pad = indentOf(lines[located.span.start - 1]);
  const written = resolve(patchable.spans, pad);
  if (written.lines === null) return null;

  const patched = applyPatches(sourceText, [
    { span: located.span, lines: written.lines },
  ]);
  // A form submitted with nothing changed in it: no text change, no undo
  // entry, no re-render.
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/**
 * Read `patched` back through the REAL pane parser, so the adopted document's
 * model comes from the parser rather than from this module's idea of what the
 * edit did.
 *
 * The re-parse is the point, not overhead: it is what makes the text the
 * authority rather than a rendering of it. `null` when the result will not
 * parse — that is a bug in this module rather than input to explain, and
 * dropping the edit beats replacing the reader's document with an error they
 * cannot act on.
 */
function adopt(doc: FlowchartDocument, patched: string): CanvasEdit | null {
  const parsed = parseFlowchartInput(patched);
  if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
  return {
    doc: { kind: "flowchart", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
