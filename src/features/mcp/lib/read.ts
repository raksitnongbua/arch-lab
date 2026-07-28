/**
 * The single door every tool goes through to turn caller text into a model.
 *
 * There is exactly one reader — `checkSource` from the validate feature —
 * and it is the same one `/validate` uses in the browser, which is itself
 * built on the same `parseArchText` / `deserializeModel` / `parseMermaidC4`
 * the editor and viewer use. So "the MCP server accepted it" means "a saved
 * file, a share link and the two-pane editor accept it too". No second
 * grammar exists to drift.
 *
 * Every failure — oversized input, empty input, undetectable format, parse
 * error — comes back here as an already-rendered caller-facing message, so
 * the tools stay a thin shell over their real work.
 */

import {
  checkSource,
  type CheckChoice,
  type CheckOk,
} from "@/features/validate/lib/check";

import { guardSourceSize } from "./limits";
import { formatNote, joinSections, renderIssues } from "./render";

export type ReadResult =
  { status: "ok"; value: CheckOk } | { status: "error"; message: string };

/**
 * Reads `source` under the caller's format choice. On success the result
 * carries the model AND its canonical `.alab` and JSON text, because
 * `checkSource` produces all three in one pass — no tool needs to re-serialize.
 */
export function readSource(source: string, choice: CheckChoice): ReadResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", message: size.message };

  const result = checkSource(source, choice);

  if (result.status === "ok") return { status: "ok", value: result };

  if (result.status !== "error") {
    // "empty" or "unknown-format": already a caller-facing sentence.
    return { status: "error", message: result.message };
  }

  // The issues already carry the location, the message and the quoted line —
  // `result.message` is the same text again (it is the FIRST issue, formatted
  // for a headline), so it is used only when there are somehow no issues to
  // show. Printing both reads like two different problems.
  return {
    status: "error",
    message: joinSections(
      `INVALID as ${formatNote(result.format, result.autoDetected)}.`,
      result.issues.length > 0 ? renderIssues(result.issues) : result.message,
    ),
  };
}
