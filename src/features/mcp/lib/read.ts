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

import { detectAlabKind } from "@/features/archtext";
import {
  checkSource,
  type CheckChoice,
  type CheckOk,
} from "@/features/validate/lib/check";

import { notationFork } from "./ask";
import { guardSourceSize } from "./limits";
import {
  askHumanResult,
  errorResult,
  formatNote,
  joinSections,
  renderIssues,
  type AskHuman,
  type McpTextResult,
} from "./render";

/**
 * Is the text a SEQUENCE document, by its first meaningful line? Mirrors the
 * detection in `sequence/input/parse.ts` (`archlab 1.0 sequence` header, or a
 * Mermaid `sequenceDiagram` opener) rather than importing it, because that
 * module's result carries parsed sequence values the C4 reader has no use for
 * — all this door needs is the yes/no.
 */
function isSequenceDocument(source: string): boolean {
  if (detectAlabKind(source) === "sequence") return true;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("%%") || line.startsWith("//")) {
      continue;
    }
    return line.split(/[\s({]/, 1)[0] === "sequenceDiagram";
  }
  return false;
}

export type ReadResult =
  | { status: "ok"; value: CheckOk }
  | { status: "error"; message: string }
  /**
   * The text is a document of another kind. NOT an error: the read did all the
   * work it could and stopped at a fork only a person can settle — see
   * `notationFork` and the `isError` note on `askHumanResult`.
   */
  | { status: "ask"; ask: AskHuman };

/**
 * The result a tool must return for any non-ok read.
 *
 * ONE FUNCTION FOR ALL FOUR C4 TOOLS. Each of them used to end its read with
 * `if (read.status === "error") return errorResult(read.message)`, and adding a
 * third arm to `ReadResult` would have meant four copies of the same two-arm
 * choice — and one of them forgotten, which is a tool that reports a question
 * as a failure.
 */
export function readFailureResult(
  read: Exclude<ReadResult, { status: "ok" }>,
): McpTextResult {
  return read.status === "ask"
    ? askHumanResult(read.ask)
    : errorResult(read.message);
}

/**
 * Reads `source` under the caller's format choice. On success the result
 * carries the model AND its canonical `.alab` and JSON text, because
 * `checkSource` produces all three in one pass — no tool needs to re-serialize.
 */
export function readSource(source: string, choice: CheckChoice): ReadResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", message: size.message };

  const alabKind = detectAlabKind(source);

  /*
   * ALL EIGHT OTHER KINDS, not the three that used to be named here.
   *
   * A `flowchart`, `usecase` or sequence document was redirected in prose; the
   * other five (`er`, `dict`, `gantt`, `timeline`, `lifecycle`) fell through to
   * `checkSource` and came back as "INVALID … line 1, column 13", which reads
   * as "your syntax is wrong" when only the tool choice was. The detection was
   * always there — `detectAlabKind` is total over the kinds — so the five were
   * a gap rather than a limit.
   *
   * It is a QUESTION and not a redirect because the text and the tool call
   * disagree and the server cannot know which was the mistake. Checked
   * whatever `choice` says: no other kind's header can ever parse as C4, so a
   * forced reading would only fail more confusingly.
   */
  if (alabKind !== null && alabKind !== "c4") {
    return { status: "ask", ask: notationFork(alabKind) };
  }

  // Mermaid `sequenceDiagram` carries no `archlab` header, so `detectAlabKind`
  // cannot see it and this second sniff is not redundant.
  if (isSequenceDocument(source)) {
    return { status: "ask", ask: notationFork("sequence") };
  }

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
