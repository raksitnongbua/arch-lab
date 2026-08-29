/**
 * TypeScript model of the arch-lab LIFECYCLE — the ninth document type, next
 * to the C4 model in `./c4.ts`, the sequence model in `./sequence.ts`, the
 * flowchart model in `./flowchart.ts`, the use-case model in `./usecase.ts`,
 * the ER model in `./er.ts`, the data dictionary in `./dict.ts`, the gantt in
 * `./gantt.ts` and the milestone timeline in `./timeline.ts`. Same conventions
 * as all eight: deterministic key order on write, no per-element timestamps,
 * and forward tolerance for unknown fields from newer minors.
 *
 * ── THE BAR, AND THE FACT THAT THIS KIND DOES NOT CLEAR IT ────────────────
 *
 * `.claude/rules/new-diagram-type.md` requires a new notation to answer a
 * question the existing ones cannot. THIS ONE DOES NOT, and — exactly as
 * `./timeline.ts` does for its own waiver — that is recorded here rather than
 * left for a future reader to discover and assume was an oversight. It ships
 * because the user asked for it explicitly and reaffirmed after being shown
 * the overlap.
 *
 * THE OVERLAP, NAMED. Two neighbours cover most of what a lifecycle says:
 *
 *   - A FLOWCHART (`./flowchart.ts`) already draws NAMED BOXES JOINED BY
 *     ARROWS, including decisions with guarded outgoing edges. Every picture
 *     this notation can draw is a flowchart a flowchart could draw, and the
 *     flowchart could draw more of them. There is no shape here the older
 *     grammar lacks.
 *   - A SEQUENCE diagram (`./sequence.ts`) already owns ORDER down a page:
 *     its axis is the index of a message, which is what a state's position
 *     is here too. And the MILESTONE TIMELINE next door already draws one
 *     ordered spine of labelled points, which is this notation minus the
 *     branches.
 *
 * WHAT IS ACTUALLY DIFFERENT, stated as narrowly as it deserves: a lifecycle
 * is a flowchart with the freedom taken OUT. It cannot express an arbitrary
 * graph — the main track is consecutive declaration order and nothing may
 * write an edge along it, a branch has exactly one source and at most one
 * destination, and a rejoin may only go BACKWARD. Every one of those is a
 * subtraction, and a notation defined by what it removes is the same weaker
 * case the timeline made. What the subtraction buys is presentational: the
 * picture is guaranteed to read as elapsed time down one spine, where a
 * flowchart of the same content is laid out by rank and says nothing about
 * duration or order of occurrence. `purpose.md` does say presentation is the
 * product, and that is the strongest honest argument for it — but it is not
 * the argument the rule asks for.
 *
 * THE TEST THAT KEEPS THIS FROM BEING THE FLOWCHART AGAIN, and it is the one
 * a future change must re-run before widening anything here: **can the
 * grammar express a graph the spine does not determine?** Today it cannot,
 * and `check:lifecycle` proves it by refusing every construct that would —
 * a `to`/`next` between states, a forward rejoin, a branch off a branch. The
 * day one of them is accepted this notation has become a worse flowchart and
 * should be deleted rather than extended.
 *
 * Do not read this header as a licence. A TENTH notation still has to clear
 * the bar; this one was waived by name, once, on request — the second and
 * last such waiver.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────
 *
 * Four structural rules, each of which is what keeps this from becoming a
 * flowchart by accretion:
 *
 *   - **THERE IS EXACTLY ONE SUBJECT, AND IT IS DECLARED ONCE.** A lifecycle
 *     is about ONE thing — an order, a claim, a manuscript — passing through
 *     states. A second subject would make this a graph of two things, which
 *     is a flowchart with lanes. The subject is not a state and has no
 *     position on the spine; it is what the spine is about.
 *
 *   - **THE MAIN TRACK IS DECLARATION ORDER, AND NOTHING MAY WRITE AN EDGE
 *     ALONG IT.** State N is followed by state N+1 because it was written
 *     next, full stop. There is no `to`, no `next` and no `then`: the moment
 *     one exists an author can write `placed -> shipped` and skip a state,
 *     and a set of arbitrary state-to-state edges IS the flowchart.
 *
 *   - **A BRANCH LEAVES THE TRACK; IT IS NOT A PEER.** An exit belongs to
 *     exactly one state (it is nested under it), and it either ENDS or
 *     REJOINS a state declared strictly earlier. It has no exits of its own,
 *     so nothing departs from a departure and the branch depth is one by
 *     construction rather than by a rule someone has to remember.
 *
 *   - **A REJOIN GOES BACKWARD ONLY.** Forward would be a shortcut along the
 *     spine — an edge between two states the spine itself does not have — and
 *     that is the arbitrary edge this notation exists without. Backward is
 *     the real thing a history contains: the subject re-does part of what it
 *     already did (returned goes back to packed; a rejected draft goes back
 *     to writing).
 *
 * WHAT `ends` MEANS, precisely, because a validator depends on it: a state
 * marked final is where the SUBJECT STOPS. Anything declared after one is
 * therefore unreachable — which is a real authoring mistake a parse cannot
 * see, and one of the four findings `validate_lifecycle` reports.
 *
 * Nothing here is validated at runtime; the `.alab` lifecycle parser
 * (`src/features/archtext/lib/lifecycle/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Exits                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A departure from the main track — the subject leaves at this state and
 * either stops or comes back.
 *
 * AN EXIT HAS NO ID, unlike a state. Ids exist so one element can NAME
 * another, and nothing in this grammar names an exit: `rejoins` points at a
 * STATE, never at a departure, because a departure is where the subject went
 * and a state is where it can be. An id here would be a key with no reader —
 * the argument `TimelineEvent` makes for the same absence.
 *
 * AND AN EXIT HAS NO EXITS. Branch depth is one, by the shape of this type
 * rather than by a rule: nothing departs from a departure, so the picture can
 * never become a tree of alternatives, which is the flowchart.
 */
export interface LifecycleExit {
  /** What this outcome is called — "Cancelled", "Returned", "Rejected". */
  label: string;
  /**
   * The id of the state the subject comes back to, or ABSENT for a terminal
   * exit.
   *
   * ABSENCE IS THE TERMINAL CASE rather than a second discriminant field,
   * because the parser already demands exactly one of `ends` / `rejoins` on
   * every exit line: a model with neither is unspellable, so a `kind` beside
   * this one would be a field that can only ever agree with it. The
   * serializer writes `ends` when this is absent.
   *
   * ALWAYS A STATE DECLARED STRICTLY EARLIER — see the file header on why
   * forward is the flowchart's edge and this one may not have it.
   */
  rejoins?: string;
  /**
   * The condition under which the subject takes this departure, in the
   * author's own words ("the customer changes their mind before payment").
   *
   * OPTIONAL IN THE GRAMMAR, REPORTED BY THE VALIDATOR. An exit with no
   * `when` parses — it is one omitted line, and refusing it would make the
   * first draft of every document an error — but a branch nobody knows how to
   * take is exactly the defect `validate_lifecycle` exists to name.
   */
  when?: string;
  /** Same `#tag` vocabulary as every other document kind. */
  tags?: string[];
  /** The note behind the outcome, drawn under it in the quieter token. */
  description?: string;
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One state on the main track — a place the subject can BE, not a thing it
 * does. "Paid", never "Take payment": the difference is what stops this
 * becoming a list of steps, which is the flowchart's element.
 *
 * ITS POSITION IS ITS INDEX. There is no `at`, no rank and no coordinate:
 * where a state sits is where it was written, which is what makes the spine
 * an elapsed order rather than a layout.
 */
export interface LifecycleState {
  /**
   * Stable identity. THE ONE ID IN THIS GRAMMAR, and it has exactly one
   * reader: `LifecycleExit.rejoins`. It is not a display name — that is
   * `label` — and nothing else in the document or the app addresses a state
   * by it.
   */
  id: string;
  /** What the state is called, as drawn. */
  label: string;
  /**
   * Whether the subject STOPS here. Omitted when false, never written as
   * `false`, so the canonical text of a non-final state has no marker at all.
   *
   * A state after a final one is unreachable — see the file header, and
   * `validate_lifecycle`'s `unreachable` finding.
   */
  final?: boolean;
  /** Same `#tag` vocabulary as every other document kind. */
  tags?: string[];
  /** The note behind the state, drawn under its label. */
  description?: string;
  /**
   * Departures from the track at this state, in declaration order.
   *
   * NESTED, not a flat list with a `from` field, for the reason
   * `TimelinePeriod.events` and `ErEntity.attributes` are nested: membership
   * IS the nesting, so an exit belonging to no state is unspellable and the
   * JSON cannot disagree with the text about where a branch leaves.
   */
  exits?: LifecycleExit[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Subject                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one thing the diagram is about.
 *
 * A SEPARATE TYPE RATHER THAN A METADATA FIELD, because it is content and not
 * chrome: `metadata.title` names the DOCUMENT ("An order, end to end") and
 * this names the THING ("Order"). Collapsing them would leave the canvas
 * drawing a file name at the head of the spine, and would let a document
 * exist with a title and no subject — which is a lifecycle of nothing.
 */
export interface LifecycleSubject {
  /** The noun, singular: "Order", "Claim", "Manuscript". */
  label: string;
  /** What one of them is, when the noun alone is not enough. */
  description?: string;
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved lifecycle document: one file, self-contained.
 *
 * `kind: "lifecycle"` is the JSON-level discriminant against `ArchLabFile` (no
 * `kind` key) and the seven other tagged file types, placed right after
 * `version` — the same first-line rule the `.alab` text header follows.
 */
export interface LifecycleLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"lifecycle"`. */
  kind: "lifecycle";
  /** Reused, not redeclared: a lifecycle carries the same title / ownership /
   * timestamp story as the other eight document types. */
  metadata: ArchLabMetadata;
  /** The one thing this document is about. Required. */
  subject: LifecycleSubject;
  /** The main track, in declaration order. Never sorted — the order IS the
   * history. */
  states: LifecycleState[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Every exit in the file, in declaration order, flattened across states. */
export function lifecycleExits(file: LifecycleLabFile): LifecycleExit[] {
  return file.states.flatMap((state) => state.exits ?? []);
}

/**
 * The index of the LAST state the subject can still be reached at, or `-1`
 * for a document with no states.
 *
 * SHARED BY THE VALIDATOR AND THE LAYOUT rather than computed twice: the
 * validator reports what follows it as unreachable, and the canvas draws
 * those states faded for the same reason. Two implementations of "where does
 * the track stop" is the "two halves of one thing" failure `codebase.md`
 * names, and this one is three lines.
 */
export function lifecycleReachableThrough(file: LifecycleLabFile): number {
  const final = file.states.findIndex((state) => state.final === true);
  return final === -1 ? file.states.length - 1 : final;
}
