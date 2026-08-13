/**
 * TypeScript model of the arch-lab SEQUENCE document — the second document
 * type next to the C4 model in `./c4.ts`. Follows the same conventions as
 * `docs/product/data-model.md`: stable human-readable ids, deterministic key
 * order on write, no per-element timestamps, and forward tolerance for
 * unknown fields from newer minor versions.
 *
 * Two structural rules differ from the C4 model, deliberately:
 *
 *   - **Order is data.** `participants` is the left-to-right lifeline order
 *     and `items` is the top-to-bottom message order — the entire point of a
 *     sequence diagram, unlike C4's unordered edge sets. Nothing in this
 *     file is ever sorted on write; reordering an array is a REAL model
 *     change and must show up in a diff as one.
 *
 *   - **Fragments are a TREE, not a flat list with depth markers.** The
 *     alternative — a flat `items` list where each entry carries a nesting
 *     depth or open/close sentinels (how PlantUML's own text format works) —
 *     was rejected because it makes malformed structure representable: an
 *     `else` without an `alt`, a close without an open, a branch that ends
 *     mid-fragment. Every consumer would then have to re-validate nesting
 *     before doing anything, and a bug in any writer corrupts silently. The
 *     tree makes those states unrepresentable at the type level. What the
 *     flat form would have bought — O(1) append while streaming a parse, and
 *     slightly flatter JSON diffs — is cheap to give up: parsers here hold
 *     the whole document anyway, and a fragment's diff is naturally read as
 *     a block. (This is not a contradiction of C4's "diagrams are stored
 *     FLAT" rule: C4 nesting is a drill-down GRAPH with cross-references
 *     between diagrams, where flatness buys O(1) lookup; a fragment is pure
 *     containment with nothing pointing into it.)
 *
 * Nothing here is validated at runtime; the `.alab` sequence parser
 * (`src/features/archtext/lib/sequence/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Participants                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `actor` renders as a stick figure, `participant` as a box — the same
 * distinction Mermaid and UML draw. Absent means "unstated": the renderer
 * treats it as `participant`, but the model keeps the omission so a document
 * that never said either round-trips without inventing a value.
 */
export type SequenceParticipantKind = "participant" | "actor";

/** One lifeline. Array position in `SequenceLabFile.participants` is the
 * left-to-right display order — there is no separate `order` field to drift
 * out of step with it. */
export interface SequenceParticipant {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  name: string;
  /** Absent = unstated (rendered as `participant`). */
  kind?: SequenceParticipantKind;
  /** Free text, e.g. "Next.js", "PostgreSQL 16". */
  technology?: string;
  /** <= 500 chars, same budget as `C4Node.description`. */
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The three message semantics a sequence diagram distinguishes:
 *
 *   - `sync`  — a call the sender waits on (solid line, filled head).
 *   - `async` — fire-and-forget (solid line, open head).
 *   - `reply` — a return to an earlier call (dashed line).
 *
 * A SELF-message is not a fourth kind: it is any message whose `from` equals
 * `to`. Deriving it keeps one source of truth — a stored `kind: "self"`
 * could contradict the endpoints, and then one of the two would be a lie.
 */
export type SequenceMessageKind = "sync" | "async" | "reply";

export interface SequenceMessage {
  /** Discriminant of the `SequenceItem` union. */
  step: "message";
  /** Participant id. */
  from: string;
  /** Participant id. `to === from` is a self-message. */
  to: string;
  kind: SequenceMessageKind;
  /** Required — an unlabelled arrow says nothing; may be `""` for imported
   * documents whose source allowed it. The arrow's TITLE: what the step does
   * ("Call login API"), kept short because it is drawn on the wire and its
   * width feeds column planning. */
  label: string;
  /** e.g. "HTTPS", "gRPC". */
  technology?: string;
  /**
   * The detail behind the title — endpoint, payload, failure modes — shown
   * only when the message is FOCUSED, never drawn on the arrow. Same field
   * and same <= 500 char budget as `SequenceParticipant.description`, for
   * the same reason: a diagram that says everything on the wire is a wall of
   * text, and a diagram that can say nothing more than the wire is a lie by
   * omission. Absent means the label is the whole story.
   *
   * MAY CONTAIN NEWLINES, and viewers must honour them: the field usually
   * holds request/response facts, which read as lines rather than as a
   * sentence. Nothing special is needed to store them — the `.alab` `desc`
   * line is a JSON string, so a `\n` escape is one line of canonical text
   * either way (`scripts/sequence-check.mjs` pins that round trip).
   */
  description?: string;
  /**
   * Activation bars, kept as two booleans on the MESSAGE rather than as
   * standalone activate/deactivate items: in every renderer a bar starts
   * when a message arrives and ends when one leaves, so tying the flags to
   * the message makes an unanchored (undrawable) activation unrepresentable.
   * `activate` starts a bar on `to`; `deactivate` ends the bar on `from`.
   * Absent means false; `true` is the only value ever written.
   */
  activate?: boolean;
  deactivate?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

export type SequenceNotePlacement = "left" | "right" | "over";

export interface SequenceNote {
  step: "note";
  placement: SequenceNotePlacement;
  /**
   * Participant ids. `left`/`right` take exactly one; `over` takes one or
   * two (a two-id `over` note spans between them). A list rather than
   * `participant` + `participant2` so "how many" is one rule in the parser,
   * not a shape change.
   */
  participants: string[];
  text: string;
}

/* -------------------------------------------------------------------------- */
/* Fragments                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `alt` and `par` are multi-branch (`else` / `and` open the 2nd+ branch);
 * `loop` and `opt` always have exactly one branch. One shape for all four —
 * a branch count rule, not four shapes — so tools walk fragments uniformly.
 */
export type SequenceFragmentKind = "loop" | "opt" | "alt" | "par";

export interface SequenceBranch {
  /** The guard / condition / lane label ("retry x3", "cart valid"). */
  label?: string;
  /** Ordered. May be empty (an authored-but-not-yet-filled branch). */
  items: SequenceItem[];
}

export interface SequenceFragment {
  step: "fragment";
  kind: SequenceFragmentKind;
  /** At least one. `loop`/`opt`: exactly one; `alt`/`par`: one per lane. */
  branches: SequenceBranch[];
}

/** One step of the diagram. ORDERED — array position is execution order. */
export type SequenceItem = SequenceMessage | SequenceNote | SequenceFragment;

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved sequence document: one file, self-contained.
 *
 * `kind: "sequence"` is the JSON-level discriminant against `ArchLabFile`
 * (which has no `kind` key), placed right after `version` so a reader can
 * tell the two document types apart before touching anything else — the
 * same first-line rule the `.alab` text header follows.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write. Same index
 * signature escape hatch as `ArchLabFile`, for the same reason.
 */
export interface SequenceLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"sequence"`. */
  kind: "sequence";
  /** Reused, not redeclared: a sequence file carries the same title /
   * ownership / timestamp story as a C4 file. */
  metadata: ArchLabMetadata;
  /** Ordered: left-to-right lifeline order. Never sorted. */
  participants: SequenceParticipant[];
  /** Number every message when true. Absent = unstated (off). */
  autonumber?: boolean;
  /** Ordered: top-to-bottom execution order. Never sorted. */
  items: SequenceItem[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Whether a message loops back to its own lifeline (see `SequenceMessageKind`
 * for why this is derived rather than stored). */
export function isSelfMessage(message: SequenceMessage): boolean {
  return message.from === message.to;
}

/** How many branches each fragment kind may carry: `alt`/`par` grow one per
 * `else`/`and`; `loop`/`opt` are single-branch. One table, no duplicated
 * rules — the parser and any future editor both read this. */
export const MAX_BRANCHES_BY_FRAGMENT_KIND: Record<
  SequenceFragmentKind,
  number
> = {
  loop: 1,
  opt: 1,
  alt: Number.POSITIVE_INFINITY,
  par: Number.POSITIVE_INFINITY,
};

/** Whether `kind` accepts a 2nd, 3rd, … branch (`else` / `and` lines). */
export function isMultiBranch(kind: SequenceFragmentKind): boolean {
  return MAX_BRANCHES_BY_FRAGMENT_KIND[kind] > 1;
}
