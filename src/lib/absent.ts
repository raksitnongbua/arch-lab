/**
 * "Empty means absent" — the contract every edit form in this app shares, in
 * one place.
 *
 * A blank string becomes `undefined`, so clearing a field REMOVES it rather
 * than storing emptiness. That matters because `.alab` can spell an empty
 * value — `: ""`, `[""]`, `desc ""` — and a document carrying one renders a
 * blank field the reader cannot tell from a missing one. The serializer omits
 * an absent field entirely, so routing through this keeps a cleared field out
 * of the saved document instead of writing the emptiness down.
 *
 * This existed three times over — the C4 element card, the relationship card
 * and the sequence dock each spelled it privately, one of them under a comment
 * apologising for the copy. `dry.md` names that comment as the first sign of
 * real duplication, so the three now share this.
 *
 * The one place a form deliberately does NOT use it is a field the model
 * REQUIRES: a sequence message label submits as the empty string the model
 * already permits, and the arrow draws without one.
 */
export function orAbsent(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}
