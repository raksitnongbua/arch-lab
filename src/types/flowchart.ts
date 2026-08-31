/**
 * TypeScript model of the arch-lab FLOWCHART document — the third document
 * type next to the C4 model in `./c4.ts` and the sequence model in
 * `./sequence.ts`. Same conventions as both: stable human-readable ids,
 * deterministic key order on write, no per-element timestamps, and forward
 * tolerance for unknown fields from newer minor versions.
 *
 * Two structural rules, both inherited from the sequence model:
 *
 *   - **Order is data.** `nodes` is the declaration order (which is the
 *     reading order a renderer should prefer when layout has no stronger
 *     opinion) and `edges` is the author's narration order — a decision's
 *     branches are read in the order its outgoing edges appear. Nothing is
 *     sorted on write; reordering an array is a real model change and must
 *     show up in a diff as one.
 *
 *   - **Branches are edges, not a nested block.** A decision node has no
 *     `branches` array: its branches ARE its outgoing edges, each carrying
 *     the guard as the edge `label` ("yes", "no", "timeout"). The
 *     alternative — a branch tree like the sequence model's fragments — was
 *     rejected because a flowchart is a GRAPH, not a containment tree:
 *     branches re-merge, jump backwards into loops and share targets, and a
 *     tree would either forbid those shapes or store the same edge twice.
 *
 * Nothing here is validated at runtime; the `.alab` flowchart parser
 * (`src/features/archtext/lib/flowchart/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The six classic flowchart symbols:
 *
 *   - `start` / `end` — terminators (stadium shape).
 *   - `step`          — a process box, the default working shape.
 *   - `decision`      — a diamond; its outgoing edges are the branches.
 *   - `io`            — input/output (parallelogram).
 *   - `call`          — a predefined process / subroutine (double-struck box).
 *
 * REQUIRED, unlike a sequence participant's optional `kind`: a participant
 * without a kind still draws as the obvious default, but a flowchart node's
 * shape is the statement the node makes — "unstated" would just be a second
 * spelling of `step`, and two spellings of one meaning is what this format
 * exists to avoid.
 */
export type FlowchartNodeShape =
  "start" | "end" | "step" | "decision" | "io" | "call";

/** One symbol. Array position in `FlowchartLabFile.nodes` is the declaration
 * order — there is no separate `order` field to drift out of step with it. */
export interface FlowchartNode {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  shape: FlowchartNodeShape;
  /** Required — an unlabelled symbol says nothing; the text drawn inside it. */
  label: string;
  /** Free text, e.g. "Go 1.22", "PostgreSQL 16". */
  technology?: string;
  /** Same `#tag` vocabulary as a C4 node — a step and the container that runs
   * it are the same system drawn twice, so they share one tag namespace. */
  tags?: string[];
  /**
   * WHERE THIS NODE IS PINNED, when the author has pinned it — the one field
   * in this model that overrides the layout rather than feeding it.
   *
   * OPTIONAL, AND THAT IS THE WHOLE DESIGN. Absent is the normal case and
   * means "solve my place from the arrows", which is what every flowchart did
   * before this field existed and what every flowchart on disk still says. A
   * document with no pinned node lays out byte-identically to how it did
   * before, which is why adding this was not a breaking change.
   *
   * WHAT IT OVERRIDES, PRECISELY: the drawn box's top-left corner. It does
   * NOT override the node's RANK — rank is which arrows reach it, the arrows
   * are unchanged, and the routing channels are still built from it. So a
   * pinned node keeps its place in the flow's logic while sitting somewhere
   * else on the page.
   *
   * THE COST IS REAL AND WAS ACCEPTED (ADR 0002, superseding ADR 0001, which
   * refused this field): a pinned node can overlap a solved one, and an arrow
   * into it can run backwards up the page. The engine has no opinion about
   * either. `purpose.md` calls correct-and-ugly a bug here, so a pin is a
   * tool for an author who wants a specific picture, not a default anybody
   * falls into.
   *
   * Same `(x,y)` spelling as a C4 node's geometry, minus the size — a
   * flowchart node's size is measured from its label and is not the author's
   * to set. One vocabulary across the kinds, as `[technology]` and `#tag`
   * already are.
   */
  position?: FlowchartPoint;
  /** <= 500 chars, same budget as `C4Node.description`: the detail behind the
   * label, revealed on focus, never drawn inside the symbol. */
  description?: string;
}

/** A pinned node's top-left corner, in the same user units the layout works
 *  in. Its own interface rather than an inline shape so the parser, the
 *  serializer and the canvas all name one thing. */
export interface FlowchartPoint {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One arrow. `label` is optional — most flow arrows say nothing — and on an
 * edge leaving a `decision` it is the guard, which makes that edge a branch.
 * There is no `kind` field: a flowchart draws one arrow, and the semantic
 * weight lives on the SHAPES it connects, not on the line style.
 */
export interface FlowchartEdge {
  /** Node id. */
  from: string;
  /** Node id. `to === from` is a legal self-loop (a retry drawn onto itself). */
  to: string;
  /** The guard / annotation ("yes", "declined"). Absent = an unlabelled arrow. */
  label?: string;
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A labelled cluster over a CONTIGUOUS run of nodes — "these four are the
 * payment leg", a lane, a subsystem boundary. The flowchart counterpart of
 * `SequenceBox`, with the same two design calls for the same reasons: a
 * separate list rather than a `group` field on each node (the cluster is a
 * thing with its own label and colour, not a value repeated on every member),
 * and contiguity as a rule — the `.alab` grammar makes a non-contiguous
 * group unspellable, because members are nested inside the group block and
 * nesting IS the membership.
 */
export interface FlowchartGroup {
  /** Required — an unlabelled cluster says nothing a reader can use. */
  label: string;
  /** Normalised lowercase `#rrggbb`, drawn as a wash — same one-spelling rule
   * and same treatment as `SequenceFragment.tint`. */
  tint?: string;
  /** Node ids, in declaration order. At least one. */
  nodes: string[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved flowchart document: one file, self-contained.
 *
 * `kind: "flowchart"` is the JSON-level discriminant against `ArchLabFile`
 * (no `kind` key) and `SequenceLabFile` (`kind: "sequence"`), placed right
 * after `version` — the same first-line rule the `.alab` text header follows.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write. Same index
 * signature escape hatch as the other two file types, for the same reason.
 */
export interface FlowchartLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"flowchart"`. */
  kind: "flowchart";
  /** Reused, not redeclared: a flowchart file carries the same title /
   * ownership / timestamp story as the other two document types. */
  metadata: ArchLabMetadata;
  /** Ordered: declaration order. Never sorted. */
  nodes: FlowchartNode[];
  /** Labelled clusters over contiguous runs of `nodes`. Absent when the
   * document groups nothing — an empty array is not written. */
  groups?: FlowchartGroup[];
  /** Ordered: the author's narration order; a decision's branch order. */
  edges: FlowchartEdge[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}
