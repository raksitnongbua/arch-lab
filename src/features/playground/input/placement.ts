/**
 * How much of a placement canvas is placed by hand — the one rule, in one
 * place.
 *
 * WHY THIS MODULE EXISTS. Three callers ask the same question and used to
 * spell it themselves: `er-edit.ts`'s sweep, `usecase-edit.ts`'s sweep, and
 * the host, which names the count on the control that presses them. Three
 * copies of `pinned !== true && position !== undefined` is the copy-paste
 * fingerprint `dry.md` names, and asked what they would have to do
 * differently in future the answer is nothing: it is one predicate about one
 * pair of fields.
 *
 * IT IS TOKEN PRESENCE, NOT A COMPARISON, and that is the load-bearing half.
 * The question is "is there a coordinate in the text to remove?", which is
 * answered by `position !== undefined`. The serializer's question — "do these
 * numbers equal what the layout would have chosen, so the token may be
 * omitted?" — is a DIFFERENT question with a different answer, and answering
 * the first with the second is what once left a hand-placed C4 diagram
 * silently unmovable. `placedByHand` in `types/c4.ts` carries the same warning
 * for the notation whose position is mandatory.
 */

import type { ViewDocument } from "./parse";

/** The fields a placement canvas's element carries — the shape both notations
 *  share, so this module never needs to know which one it is looking at. */
interface Placeable {
  pinned?: boolean;
  position?: { x: number; y: number };
}

/**
 * Whether the SWEEP may release this element: it states a coordinate, and it
 * is not pinned.
 *
 * A PINNED ELEMENT IS EXEMPT FROM THE SWEEP AND NOT FROM THE AUTHOR — the
 * per-element release honours a direct request either way. That distinction is
 * the entire meaning of `pinned`, and it is the field's only reader.
 */
export function isReleasable(element: Placeable): boolean {
  return element.pinned !== true && element.position !== undefined;
}

/** What the host needs to name a count on the sweep control. */
export interface PlacementCount {
  /** Elements the document holds, placed or not. */
  total: number;
  /** Elements whose text states a coordinate, pinned or not. */
  placed: number;
  /** Of those, the ones the sweep will actually release. */
  releasable: number;
  /** Of those, the ones it will skip. */
  pinned: number;
}

const EMPTY: PlacementCount = {
  total: 0,
  placed: 0,
  releasable: 0,
  pinned: 0,
};

/**
 * `doc`'s placement tally, or zeroes for a notation that has no placements to
 * count.
 *
 * TOTAL FOR EVERY OTHER NOTATION RATHER THAN A THROW: the host calls this
 * while rendering whatever document is on screen, and a canvas with no
 * placements legitimately has none. Returning zeroes makes the sweep control
 * absent by the same rule that hides it on an ER diagram nobody has dragged.
 */
export function placementCount(doc: ViewDocument): PlacementCount {
  const elements: readonly Placeable[] =
    doc.kind === "er"
      ? doc.file.entities
      : doc.kind === "usecase"
        ? doc.file.elements
        : [];
  if (elements.length === 0) return EMPTY;
  const placed = elements.filter(
    (element) => element.position !== undefined,
  ).length;
  const releasable = elements.filter(isReleasable).length;
  return {
    total: elements.length,
    placed,
    releasable,
    pinned: placed - releasable,
  };
}
