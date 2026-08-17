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

import { guardSourceSize } from "./limits";
import { formatNote, joinSections, renderIssues } from "./render";

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
  { status: "ok"; value: CheckOk } | { status: "error"; message: string };

/**
 * Reads `source` under the caller's format choice. On success the result
 * carries the model AND its canonical `.alab` and JSON text, because
 * `checkSource` produces all three in one pass — no tool needs to re-serialize.
 */
export function readSource(source: string, choice: CheckChoice): ReadResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", message: size.message };

  const alabKind = detectAlabKind(source);

  // Named here for the same reason as the sequence guard below: without it the
  // caller gets a C4 line-1 parse error that reads as "your syntax is wrong"
  // when only the tool choice was.
  if (alabKind === "flowchart") {
    return {
      status: "error",
      message:
        "This is a flowchart, not a C4 model — the C4 tools cannot read it. " +
        "Use `validate_flowchart` and `format_flowchart` for flowchart " +
        "documents, or `create_share_link`, which accepts every kind.",
    };
  }

  // Named here for the same reason as the guards around it: without it the
  // caller gets a C4 line-1 parse error that reads as "your syntax is wrong"
  // when only the tool choice was.
  if (alabKind === "usecase") {
    return {
      status: "error",
      message:
        "This is a use-case diagram, not a C4 model — the C4 tools cannot " +
        "read it. Use `validate_usecase` and `format_usecase` for use-case " +
        "documents, or `create_share_link`, which accepts every kind.",
    };
  }

  // The misdirection guard `tools/sequence.ts` documents, in reverse: a
  // sequence document fed to a C4 tool used to come back as "INVALID … line 1,
  // column 13", which reads as "your syntax is wrong" when only the tool
  // choice was. Checked whatever `choice` says, because neither header can
  // ever parse as C4 — a forced reading would just fail more confusingly.
  if (isSequenceDocument(source)) {
    return {
      status: "error",
      message:
        "This is a sequence diagram, not a C4 model — the C4 tools cannot " +
        "read it. Use `validate_sequence` and `format_sequence` for sequence " +
        "documents, or `create_share_link`, which accepts every kind.",
    };
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
