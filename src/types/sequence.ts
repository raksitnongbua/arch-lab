/**
 * TypeScript model of the arch-lab SEQUENCE document — the second document
 * type next to the C4 model in `./c4.ts`. Follows the same conventions as
 * The same rules the C4 model follows: stable human-readable ids, deterministic key
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
  /**
   * Icon slug from the shared registry (`editor/lib/icons`), e.g.
   * `"postgresql"` — the same vocabulary a C4 node's `icon` uses, because a
   * participant and a container are the same system drawn twice and a second
   * icon namespace would make them disagree about what to call one.
   *
   * EXPLICIT ONLY, unlike C4, which also carries an `iconSource` so an
   * icon INFERRED from `technology` can be re-inferred when the technology
   * changes while a user's own choice is never overwritten. Nothing infers
   * icons for a sequence document — there is no editor writing them — so the
   * flag would record a distinction nothing makes. If inference arrives, this
   * grows an `iconSource` beside it exactly as the C4 node did.
   */
  icon?: string;
  /** Free text, e.g. "Next.js", "PostgreSQL 16". */
  technology?: string;
  /** <= 500 chars, same budget as `C4Node.description`. */
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * AN ARROW IS TWO INDEPENDENT AXES, not one enum. `line` says whether the
 * wire is drawn solid or dotted; `head` says how it is tipped. The product is
 * total — every one of the 2 x 5 combinations is a real arrow a reader can
 * draw and every consumer must handle all of them — which is exactly why the
 * pair is stored rather than a flat name per combination.
 *
 * WHY NOT TEN NAMES. The alternative shipped everywhere else is a single
 * union (`sync | async | reply | …`) with ten members. It was rejected for
 * two reasons that both cost real bugs in the version this replaced:
 *
 *   - Every consumer that cares about only ONE axis has to know all ten
 *     names. The canvas dashes a line for `reply` and nothing else, so a
 *     dotted-open arrow added later draws solid until somebody remembers this
 *     one `===` comparison. With two axes the canvas asks about `line` and
 *     cannot be wrong about a head it has never heard of.
 *   - A `Record<Kind, …>` over ten names is a hand-listed set of ten, and a
 *     hand-listed set cannot notice an eleventh. A
 *     `Record<Line, Record<Head, …>>` is the grid itself: TypeScript refuses
 *     to compile a table with a hole in it, so the arrow vocabulary and the
 *     tables that map it are the same shape by construction. The `.alab`
 *     token table, the Mermaid arrow table and the canvas head table are all
 *     that shape (`SEQUENCE_ARROW_TOKENS`, `MERMAID_SEQUENCE_ARROWS`,
 *     `SEQUENCE_HEAD_SHAPES`). The two field names are `lineStyle` and
 *     `headStyle` rather than the shorter `line`/`head`: `line` already means
 *     a SOURCE LINE NUMBER throughout the parser (`Loc.line`), and one
 *     identifier with two meanings in neighbouring modules is how a `Loc` and
 *     a message once tried to share a field.
 *
 * The three arrows this grammar shipped with are three points in the grid,
 * and their `.alab` spelling is unchanged: `->` is solid+arrow (a call the
 * sender waits on), `~>` is solid+open (fire and forget), `..>` is
 * dotted+arrow (a return).
 *
 * A SELF-message is not a head style: it is any message whose `from` equals
 * `to`. Deriving it keeps one source of truth — a stored `"self"` could
 * contradict the endpoints, and then one of the two would be a lie.
 */
export type SequenceLineStyle = "solid" | "dotted";

/**
 * How an arrow is tipped. `bidirectional` puts an arrowhead at BOTH ends —
 * the head field describes the tipping of the whole wire, not of one end, so
 * that a two-ended arrow is one value rather than a second boolean free to
 * disagree with this one.
 *
 * `none` is a real choice, not a missing value: an undirected line between
 * two lifelines says "these two talked" without claiming who called whom, and
 * the C4 grammar has spelled that `--` since 1.0.
 */
export type SequenceHeadStyle =
  "none" | "arrow" | "cross" | "open" | "bidirectional";

/** Every line style, for iterating the grid. Order is the order the docs and
 * the edit form list them in. */
export const SEQUENCE_LINE_STYLES: readonly SequenceLineStyle[] = [
  "solid",
  "dotted",
];

/** Every head style, for iterating the grid. */
export const SEQUENCE_HEAD_STYLES: readonly SequenceHeadStyle[] = [
  "none",
  "arrow",
  "cross",
  "open",
  "bidirectional",
];

/**
 * Every arrow in the grid, as `{ line, head }` pairs — the CARTESIAN PRODUCT,
 * computed, so a check that iterates this cannot be one arrow short of the
 * type. Anything that wants "for each arrow" reads this rather than writing
 * two nested loops of its own.
 */
export const SEQUENCE_ARROWS_GRID: readonly SequenceArrow[] =
  SEQUENCE_LINE_STYLES.flatMap((lineStyle) =>
    SEQUENCE_HEAD_STYLES.map((headStyle) => ({ lineStyle, headStyle })),
  );

/** The two axes together — the shape every arrow table is keyed by, and the
 * shape a gesture passes around when it means "this arrow". */
export interface SequenceArrow {
  lineStyle: SequenceLineStyle;
  headStyle: SequenceHeadStyle;
}

/** How a line style reads in a sentence (an accessible name, a refusal, the
 * edit form's menu). One phrase per axis value rather than ten per pair: the
 * pair's phrase is composed, so a new head needs one string, not five. */
export const SEQUENCE_LINE_STYLE_PHRASE: Record<SequenceLineStyle, string> = {
  solid: "solid",
  dotted: "dotted",
};

export const SEQUENCE_HEAD_STYLE_PHRASE: Record<SequenceHeadStyle, string> = {
  none: "no head",
  arrow: "an arrowhead",
  cross: "a cross",
  open: "an open head",
  bidirectional: "an arrowhead at both ends",
};

/**
 * What choosing each value MEANS for the flow, as the edit form's menus say
 * it. Separate from the phrase records above because the two answer different
 * questions — a phrase describes the drawing ("dotted line"), a meaning
 * describes the step ("a return or a callback") — and the form needs both on
 * one row.
 *
 * These are the sentences the retired three-way menu carried ("a call the
 * sender waits on", "fire and forget", "a return"), split onto the axis each
 * one was really about: the waiting was the head, the returning was the line.
 */
export const SEQUENCE_LINE_STYLE_MEANING: Record<SequenceLineStyle, string> = {
  solid: "a call outward",
  dotted: "a return or a callback",
};

export const SEQUENCE_HEAD_STYLE_MEANING: Record<SequenceHeadStyle, string> = {
  none: "no direction claimed",
  arrow: "the sender waits on it",
  cross: "lost — it never arrives",
  open: "fire and forget",
  bidirectional: "both ways at once",
};

/** "a dotted line with an open head" — the one wording, so the canvas's
 * accessible name and the edit form's menu cannot describe the same arrow
 * two ways. */
export function sequenceArrowPhrase(arrow: SequenceArrow): string {
  return `${SEQUENCE_LINE_STYLE_PHRASE[arrow.lineStyle]} line with ${SEQUENCE_HEAD_STYLE_PHRASE[arrow.headStyle]}`;
}

export interface SequenceMessage {
  /** Discriminant of the `SequenceItem` union. */
  step: "message";
  /** Participant id. */
  from: string;
  /** Participant id. `to === from` is a self-message. */
  to: string;
  /** Required, both of them — see {@link SequenceLineStyle} for why an arrow
   * is two fields. Neither has a default: "absent" and "solid" would be two
   * spellings of one document, which is the shape that lost a hand-written
   * `autonumber false` once already. */
  lineStyle: SequenceLineStyle;
  headStyle: SequenceHeadStyle;
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
 * `alt`, `par` and `critical` are multi-branch (`else` / `and` / `option`
 * open the 2nd+ branch); `loop`, `opt`, `break` and `rect` always have
 * exactly one branch. One shape for all seven — a branch count rule, not
 * seven shapes — so tools walk fragments uniformly.
 *
 * `critical`, `break` and `rect` arrived with the Mermaid importer, which
 * used to flatten them because the model had nowhere to put them. Two of the
 * three are ordinary UML fragments and needed only a keyword; `rect` is the
 * odd one and earns its place anyway:
 *
 *   - `critical` — the branch that MUST happen, with `option` lanes for the
 *     circumstances that can interrupt it. Structurally an `alt`; drawn as
 *     itself, because "critical" is the word that carries the meaning.
 *   - `break` — the exit path out of the enclosing loop or flow. Single
 *     branch, like `opt`, and drawn distinctly for the same reason.
 *   - `rect` — a HIGHLIGHT, not control flow: a tinted region behind a run
 *     of messages ("everything in here is the payment leg"). It is a
 *     fragment because it nests, spans and encloses exactly like one, and
 *     making it a fragment means the layout, the focus walk, the collapse
 *     filter and the exporter all handle it with no new case. What is
 *     different is only that it carries a {@link SequenceFragment.tint} and
 *     draws no guard chip when it has no label.
 */
export type SequenceFragmentKind =
  "loop" | "opt" | "alt" | "par" | "critical" | "break" | "rect";

export interface SequenceBranch {
  /** The guard / condition / lane label ("retry x3", "cart valid"). */
  label?: string;
  /** Ordered. May be empty (an authored-but-not-yet-filled branch). */
  items: SequenceItem[];
}

export interface SequenceFragment {
  step: "fragment";
  kind: SequenceFragmentKind;
  /**
   * The highlight colour of a `rect`, as lowercase `#rrggbb` — the ONE
   * spelling, normalised on the way in from whatever the source wrote
   * (`rgb(191, 223, 255)`, `#BFDFFF`, `Aqua`), so two documents that mean the
   * same colour are the same bytes.
   *
   * Rendered as a WASH rather than a fill: the author picked it against
   * Mermaid's light canvas, and painting it opaque would make a dark-theme
   * diagram unreadable and its own text invisible. At low alpha the hue still
   * says "these steps belong together" in both themes, which is the whole
   * job of the colour.
   *
   * Ignored on every other kind — a tinted `alt` is not a thing the grammar
   * can spell, so nothing can produce one.
   */
  tint?: string;
  /** At least one. `loop`/`opt`/`break`/`rect`: exactly one;
   * `alt`/`par`/`critical`: one per lane. */
  branches: SequenceBranch[];
}

/* -------------------------------------------------------------------------- */
/* Participant boxes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A labelled bracket over a CONTIGUOUS run of lifelines — "these three are
 * the payments team", "everything in here is third-party". Mermaid's `box`.
 *
 * A separate list rather than a `box` field on each participant, for the same
 * reason `participants` is an array and not a map: the bracket is a thing
 * with its own label and colour, and hanging it off its members would make
 * "the box's name" a value repeated on every member, free to disagree.
 *
 * CONTIGUITY IS A RULE, not a hope. A bracket is drawn as one span from its
 * leftmost to its rightmost member, so a box whose members are interleaved
 * with an outsider's lifeline would draw over a participant it does not
 * contain. Both readers refuse that rather than draw a lie: the `.alab`
 * grammar makes it unspellable (members are nested inside the box block, and
 * nesting IS the order), and the Mermaid importer checks it.
 */
export interface SequenceBox {
  /** Required — an unlabelled bracket says nothing a reader can use. */
  label: string;
  /** Same normalised `#rrggbb` and the same wash treatment as
   * {@link SequenceFragment.tint}. */
  tint?: string;
  /** Participant ids, in lifeline order. At least one. */
  participants: string[];
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
  /** Labelled brackets over contiguous runs of `participants`. Absent when
   * the document groups nothing — an empty array is not written. */
  boxes?: SequenceBox[];
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

/** Whether a message loops back to its own lifeline (see `SequenceLineStyle`
 * for why this is derived rather than stored). */
export function isSelfMessage(message: SequenceMessage): boolean {
  return message.from === message.to;
}

/**
 * The activation flags a message carries, as the glyphs the author wrote —
 * `[]` for a message that opens and closes nothing.
 *
 * ONE FACT, TWO CALLERS, and that is the whole reason it is a function here
 * rather than two `item.activate === true` tests. `activationRefusal`
 * (`playground/input/sequence-edit.ts`) turns it into the sentence a reader
 * hears when a delete, a repoint or a reorder declines; `lib/reorder.ts` reads
 * it to decide which slots a drag may even be offered. Those two must never
 * come to different conclusions — a drag that offers a slot the edit refuses is
 * exactly the "two halves, each self-consistent" failure — so they share the
 * fact and only the wording is the refusal's own.
 *
 * The glyphs rather than a boolean because the sentence quotes them: "carries
 * an activation flag (+ and -)" tells the reader what to go and delete.
 */
export function sequenceActivationFlags(message: SequenceMessage): string[] {
  return [
    message.activate === true ? "+" : null,
    message.deactivate === true ? "-" : null,
  ].filter((flag): flag is string => flag !== null);
}

/** How many branches each fragment kind may carry: `alt`/`par`/`critical`
 * grow one per `else`/`and`/`option`; the rest are single-branch. One table,
 * no duplicated rules — the parser and any future editor both read this. */
export const MAX_BRANCHES_BY_FRAGMENT_KIND: Record<
  SequenceFragmentKind,
  number
> = {
  loop: 1,
  opt: 1,
  alt: Number.POSITIVE_INFINITY,
  par: Number.POSITIVE_INFINITY,
  critical: Number.POSITIVE_INFINITY,
  break: 1,
  rect: 1,
};

/** Whether `kind` accepts a 2nd, 3rd, … branch (`else` / `and` lines). */
export function isMultiBranch(kind: SequenceFragmentKind): boolean {
  return MAX_BRANCHES_BY_FRAGMENT_KIND[kind] > 1;
}

/* -------------------------------------------------------------------------- */
/* Addressing one item                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The address of one item in the fragment tree — the sequence document's
 * answer to the id a C4 node has.
 *
 * WHY THERE IS NO ID TO USE INSTEAD. Nothing in this file gives an item an
 * `id`, and adding one is not a small change: it would appear in the `.alab`
 * grammar, in every Mermaid import, and in every file already on disk (which
 * would have to be assigned ids on read, i.e. two readings of the same
 * document disagreeing about what to call a step). Position IS the identity
 * here — `items` is execution order and "order is data", per this file's
 * header — so the address is the position.
 *
 * A JSON-POINTER-STYLE INDEX PATH, alternating item index and branch index
 * and therefore always ODD in length. `[3]` is `items[3]`; `[3, 1, 2]` is
 * `items[3].branches[1].items[2]`. It is a homogeneous path of indices rather
 * than the object-per-segment shape `comments.md` prefers for positional
 * tuples, because every segment means the same kind of thing — "the nth child"
 * — and the alternation is the tree's own shape, not two fields crammed into
 * one slot. Nothing indexes it by hand: `sequenceItemAt` is the only reader.
 */
export type SequenceItemPath = readonly number[];

/**
 * The item `path` addresses, or `undefined` when the path does not land on one
 * — a stale path (the document was re-parsed with that branch shorter) reads
 * as "no item" rather than throwing, because every caller here is resolving an
 * address a user gesture captured a moment ago.
 */
export function sequenceItemAt(
  items: readonly SequenceItem[],
  path: SequenceItemPath,
): SequenceItem | undefined {
  if (path.length === 0 || path.length % 2 === 0) return undefined;
  let list = items;
  for (let at = 0; at < path.length; at += 2) {
    const item = list[path[at]];
    if (item === undefined) return undefined;
    if (at + 1 === path.length) return item;
    if (item.step !== "fragment") return undefined;
    const branch = item.branches[path[at + 1]];
    if (branch === undefined) return undefined;
    list = branch.items;
  }
  return undefined;
}

/**
 * Every MESSAGE address in document order — fragments walked depth-first,
 * branches in order, which is the order a reader's eye takes down the page.
 *
 * This is what turns a layout STEP NUMBER into a model address:
 * `sequenceMessagePaths(file.items)[step - 1]`. The layout numbers messages
 * 1..n as it walks, and it walks this order; `check:sequence` pins the two
 * walks against each other rather than trusting the coincidence, because the
 * failure mode is silent — an edit landing on a neighbouring message.
 */
export function sequenceMessagePaths(
  items: readonly SequenceItem[],
): SequenceItemPath[] {
  const out: SequenceItemPath[] = [];
  const walk = (list: readonly SequenceItem[], prefix: number[]): void => {
    list.forEach((item, index) => {
      if (item.step === "message") out.push([...prefix, index]);
      else if (item.step === "fragment") {
        item.branches.forEach((branch, branchIndex) => {
          walk(branch.items, [...prefix, index, branchIndex]);
        });
      }
    });
  };
  walk(items, []);
  return out;
}

/**
 * A `SequenceItemPath` as a map key. Dots are unambiguous because every
 * segment is a decimal index — no segment can contain one — so no pair of
 * paths can forge another's key.
 */
export function sequenceItemKey(path: SequenceItemPath): string {
  return path.join(".");
}

/* -------------------------------------------------------------------------- */
/* The editable subset of an element                                           */
/* -------------------------------------------------------------------------- */

/*
 * These two are the CONTRACT BETWEEN THE CANVAS AND THE TEXT: the sequence
 * viewer's detail dock collects them, and `playground/input/sequence-edit.ts`
 * turns them into a line patch. They live here rather than beside either half
 * because the viewer must not import from the playground — the repo's import
 * layering runs editor -> viewer -> sequence and the playground consumes all
 * three — and this file is the neutral ground both already share.
 */

/**
 * The editable subset of a message, given WHOLE rather than as a diff:
 * `undefined` means the field is absent from the document, not "leave it as it
 * was". The dock's form shows all four at once and submits all four, so a diff
 * would only add a way for the form and the model to disagree.
 *
 * `from`, `to`, `activate` and `deactivate` are deliberately NOT here, and the
 * two halves of that sentence have since gone different ways.
 *
 * ENDPOINTS ARE A DIFFERENT GESTURE, and it now exists: `repointedMessageEdit`
 * in `playground/input/sequence-edit.ts`, driven by the same armed two-click
 * lifeline picker an insert uses. They stayed out of this form rather than
 * arriving in it as two text inputs because an endpoint is POINTED AT, not
 * typed — a form field would ask the reader to spell an id while the lifeline
 * it names is on screen a few pixels away, and a typo there is a document the
 * parser refuses.
 *
 * THE ACTIVATION FLAGS ARE STILL OUT, for the reason they always were: they
 * are half of an unvalidated open/close pairing, so a control on one message
 * can unbalance the bars several rows below it, where the reader cannot see
 * what they did. The same reasoning now also REFUSES a delete or a repoint of
 * a message that carries one — see `activationRefusal`.
 */
export interface SequenceMessageRevision {
  label: string;
  /** Both axes, always both — the form shows two menus and submits two
   * values, so a revision that carried one would let the head follow a line
   * change nobody made. */
  lineStyle: SequenceLineStyle;
  headStyle: SequenceHeadStyle;
  technology?: string;
  description?: string;
}

/**
 * The editable subset of a participant, on the same whole-value contract.
 *
 * `id` is absent because it is the name every message refers to: renaming it
 * on the canvas would mean rewriting every line that mentions it, which is a
 * refactor rather than an edit and belongs in the pane where the reader can
 * see all of them. `icon` is absent because there is no icon picker on this
 * canvas to change it with.
 */
export interface SequenceParticipantRevision {
  name: string;
  /** `undefined` keeps the document's "unstated", which is a third state
   * distinct from an explicit `participant` — see `SequenceParticipantKind`. */
  kind?: SequenceParticipantKind;
  technology?: string;
  description?: string;
}
