import type { SeedKind } from "../input/parse";

/**
 * Which example fills the playground when no share link supplies a document.
 *
 * A QUERY PARAM rather than a route, because that is what it describes: the
 * starting text, not a different page. `/view`, `/view/c4` and `/view/seq`
 * were three routes mounting one component with one difference between them.
 *
 * SHORT ON PURPOSE — `?d=seq`, not `?document=sequence`. The whole URL
 * competes with `MAX_SHARE_URL_LENGTH`, and this param can appear beside a
 * fragment carrying a document. It costs 6 characters where a spelled-out
 * name would cost 18. (It is absent from a share link entirely: the payload
 * carries the document and the reader detects its kind.)
 */
export const VIEW_SEED_PARAM = "d";

/** `?d=seq` and `?d=sequence` both work; anything else seeds C4. */
export function seedFromParam(value: string | string[] | undefined): SeedKind {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "seq" || first === "sequence" ? "sequence" : "c4";
}
