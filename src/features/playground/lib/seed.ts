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

/** `?d=seq`/`?d=sequence` seed the sequence example, `?d=flow`/`?d=flowchart`
 * the flowchart one, `?d=uc`/`?d=usecase` the use-case one; anything else
 * seeds C4. Both spellings per kind because the short one is what gets
 * minted (`/view/seq`, `/view/flow`, `/view/uc` forward to it) and the long
 * one is what gets typed from memory. */
export function seedFromParam(value: string | string[] | undefined): SeedKind {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === "seq" || first === "sequence") return "sequence";
  if (first === "flow" || first === "flowchart") return "flowchart";
  if (first === "uc" || first === "usecase") return "usecase";
  return "c4";
}
