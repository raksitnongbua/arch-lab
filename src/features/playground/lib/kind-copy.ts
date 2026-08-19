import type { SeedKind } from "../input/parse";

/**
 * What each document kind is FOR, in one line a newcomer can act on.
 *
 * The playground's starter row used to be four bare nouns — "C4 · Sequence ·
 * Flowchart · Use case" — which names the four grammars to someone who already
 * knows all four and tells everyone else nothing. A reader who does not know
 * which they want cannot pick from a list of labels; they can pick from a list
 * of jobs. Each line names the QUESTION the diagram answers rather than the
 * shapes it draws, because the shapes are what you see once you have already
 * chosen.
 *
 * IT LIVES HERE, not beside the starter buttons, because `/demo` needs exactly
 * the same sentences and for exactly the same reason: it groups eight examples
 * under four headings, and a heading that says only "Use cases" leaves the
 * reader to guess which of their problems that section solves. Two copies of
 * this table would be two answers to "what is a flowchart for" on two pages of
 * one site — and the second copy is how the checkout example's `desc` came to
 * say two different things (see the note in the sequence example registry).
 *
 * A SERVER-SAFE MODULE on purpose. `view-playground.tsx` is `"use client"`, so
 * importing these strings from there would drag the whole editor into a page
 * that renders four headings.
 */
export const KIND_BLURB: Record<SeedKind, string> = {
  c4: "Systems and the lines between them, drillable level by level",
  sequence: "Who calls whom, in order, over time",
  flowchart: "Steps, decisions and the loops back",
  usecase: "Who can do what at the system's edge",
  er: "What you store, and how one record finds another",
};
