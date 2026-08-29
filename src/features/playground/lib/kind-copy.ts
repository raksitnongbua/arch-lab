import type { SeedKind } from "../input/parse";

/**
 * What each document kind is FOR, in one line a newcomer can act on.
 *
 * The playground's starter row used to be bare nouns — "C4 · Sequence ·
 * Flowchart · Use case" — which names the grammars to someone who already
 * knows them all and tells everyone else nothing. A reader who does not know
 * which they want cannot pick from a list of labels; they can pick from a list
 * of jobs. Each line names the QUESTION the diagram answers rather than the
 * shapes it draws, because the shapes are what you see once you have already
 * chosen. There are NINE now, which only sharpens the point: nine nouns is a
 * list nobody reads to the end of.
 *
 * IT LIVES HERE, not beside the starter buttons, because `/demo` needs exactly
 * the same sentences and for exactly the same reason: it groups its examples
 * under one heading per kind, and a heading that says only "Use cases" leaves
 * the reader to guess which of their problems that section solves. Two copies of
 * this table would be two answers to "what is a flowchart for" on two pages of
 * one site — and the second copy is how the checkout example's `desc` came to
 * say two different things (see the note in the sequence example registry).
 *
 * A SERVER-SAFE MODULE on purpose. `view-playground.tsx` is `"use client"`, so
 * importing these strings from there would drag the whole editor into a page
 * that renders a column of headings.
 */
export const KIND_BLURB: Record<SeedKind, string> = {
  c4: "Systems and the lines between them, drillable level by level",
  sequence: "Who calls whom, in order, over time",
  flowchart: "Steps, decisions and the loops back",
  usecase: "Who can do what at the system's edge",
  er: "What you store, and how one record finds another",
  dict: "What each field means, and where its value comes from",
  /* "can't start until" rather than "depends on": the dependency is the half a
     reader arrives without — every plan tool draws durations, and the thing
     this one is for is the arrow between them. Quoted verbatim on the demo
     index and the starter row, so reword it here and nowhere else. */
  gantt: "How long each piece takes, and what can't start until it's done",
  /* CHECKED AGAINST ALL SEVEN LINES ABOVE, because this is the kind whose job
     most nearly duplicates another's — `src/types/timeline.ts` records that
     the overlap with the gantt was waived by name rather than argued away, and
     this line is where the waiver has to be paid for in wording. Two
     neighbours are close and are kept apart by one word each:

       - the GANTT line is about work that has NOT happened ("takes", "can't
         start"), where this one is about work that HAS. Past tense is the
         whole distinction and is why the verb is "happened" twice.
       - the SEQUENCE line is also about order ("in order, over time"), but its
         subject is WHO — "who calls whom". This one names no actor at all,
         because the grammar has none.

     "and which period it happened in" rather than "and in what order": the
     order is visible in any list, and what this notation adds over one is the
     BAND — the reader's own way of cutting the history up. Quoted verbatim on
     the home page, the demo index, `/faq` and the MCP catalogue, so reword it
     here and nowhere else. */
  timeline: "What happened when, and which period it happened in",
  /* CHECKED AGAINST ALL EIGHT LINES ABOVE, the way the timeline's was and for
     a sharper reason: this is the kind whose PICTURE most nearly duplicates
     another's — `src/types/lifecycle.ts` records that the overlap with the
     flowchart was waived by name rather than argued away, and this line is
     where the waiver has to be paid for in wording. Three neighbours are
     close, and each is kept apart by one word:

       - the FLOWCHART line is about "steps, decisions and the loops back" —
         MANY things, doing. This one names ONE thing, being: "one thing" is
         the first phrase for that reason, and "ends up" is a state rather
         than an action.
       - the SEQUENCE line is about order between actors ("who calls whom").
         This one has no second party at all.
       - the TIMELINE line is also one subject in order ("what happened
         when"), and the word that separates them is "where it can end up":
         a timeline records what DID happen once, a lifecycle names every
         outcome that is possible. Past tense against possibility is the whole
         distinction.

     "went through" rather than "goes through": the states are a passage
     already shaped, which is what stops a reader hearing a process
     definition — that is the flowchart. Quoted verbatim on the home page, the
     demo index, `/faq` and the MCP catalogue, so reword it here and nowhere
     else. */
  lifecycle: "What one thing went through, and where it can end up",
};
